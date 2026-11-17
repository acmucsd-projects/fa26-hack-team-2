// Wes's Updated_Schema_Doc.pdf (2026-11-13), pages 1, 3–5.
// This export deliberately does not use the legacy Mongoose models (older units).
const { createHash } = require('node:crypto');
const { DB_ALLERGEN } = require('../constants/tags');
// All drink entries in the supplied web captures use this category.
const BEVERAGE_CATEGORIES = new Set(['Beverages']);
const oid = value => ({ $oid: createHash('sha256').update(JSON.stringify(['hdh-web-v1',value])).digest('hex').slice(0,24) });
const periods = { breakfast:'breakfast', lunch:'lunch', dinner:'dinner', lunch_dinner:'lunch/dinner', late_night:'late-night', all:'all', unknown:'unknown' };
function convertNutrition(item) {
  const n = item.nutrition || {};
  const result = { macros: {} };
  const add = (target, key, value, scale) => { if (value != null) target[key] = Math.round(value * scale); };
  add(result,'calorie', n.calorie ?? item.calories,10);
  add(result,'fat_cal',n.fat_cal,10);
  add(result,'serving_size',n.serving_size,10);
  for (const field of ['sat_fat','trans_fat','fiber','sugar']) add(result,field,n[field],1000);
  for (const field of ['sodium','cholesterol']) add(result,field,n[field],1);
  for (const field of ['protein','carb','fat']) add(result.macros,field,n.macros?.[field],1000);
  return result;
}
function transformMenus(menus) {
  const snapshots = {}, warnings = [], withheld = [];
  for (const menu of menus) {
    const date = menu.menu_date;
    const snap = snapshots[date] ||= { Locations: [], Foods: [], Menu_Items: [], provenance: [] };
    if (!menu.hours) { withheld.push({ restaurant: menu.dining_hall.id, date, reason: 'PDF requires hours.days/open/close; no hours available' }); continue; }
    const locId = oid(['location',menu.dining_hall.id]);
    snap.Locations.push({ _id:locId, version:1, name:menu.dining_hall.name, type:'dining hall',
      location:{area:menu.dining_hall.area,geodata:{}}, hours:menu.hours,
      stations:menu.stations.map(s => ({station_id:oid(['station',s.id]),station_name:s.name})) });
    for (const station of menu.stations) for (const item of station.items) {
      const tags = new Set(item.tags);
      const food = { version:1, name:item.name, personal:false, beverage:BEVERAGE_CATEGORIES.has(item.category),
        wellness:tags.has('wellness') ? true:null, vegetarian:tags.has('vegetarian') || tags.has('vegan') ? true:null,
        vegan:tags.has('vegan') ? true:null, sustainability:tags.has('sustainability') ? true:null,
        ingredients:item.nutrition?.ingredients ? [item.nutrition.ingredients]:[],
        allergens:Object.fromEntries(item.tags.filter(t=>DB_ALLERGEN[t]).map(t=>[DB_ALLERGEN[t],true])), nutrition:convertNutrition(item) };
      // ID includes source recipe + observed attributes, so differing portions
      // or nutrition never overwrite one another; identical foods can share IDs.
      const foodId = oid(['food',item.nutrition_url,food]);
      if (!snap.Foods.some(f=>f._id.$oid===foodId.$oid)) snap.Foods.push({_id:foodId,...food});
      for (const rawPeriod of item.meal_periods) {
        const period = periods[rawPeriod] || 'unknown';
        if (!periods[rawPeriod]) warnings.push(`${date} / ${item.name}: ${rawPeriod} maps to unknown (PDF has no matching enum)`);
        const doc = { _id:oid(['offering',date,menu.dining_hall.id,station.id,item.category,foodId,rawPeriod,item.price_cents]), version:1,
          food_id:foodId,loc_id:locId,station_id:oid(['station',station.id]),meal_period:period };
        const price = item.prices_by_meal_period[rawPeriod];
        if (price != null) doc.price = price;
        snap.Menu_Items.push(doc);
        snap.provenance.push({menu_item_id:doc._id,menu_date:date,menu_day:menu.menu_day,category:item.category,raw_meal_period:rawPeriod,source_item_id:item.source_item_id,nutrition_url:item.nutrition_url,nutrition_status:item.nutrition_status,source_files:menu.source_files});
      }
    }
  }
  return { schema_reference:'Updated_Schema_Doc.pdf, November 13 2026', format:'MongoDB Extended JSON; independent dated snapshots', snapshots, warnings:[...new Set(warnings)], withheld };
}
// Check the PDF contract and its virtual references without connecting to MongoDB.
function validateDatabase(database) {
  const errors = [];
  const objectId = v => v && Object.keys(v).length === 1 && /^[a-f0-9]{24}$/.test(v.$oid);
  const integer = v => Number.isSafeInteger(v) && v >= 0;
  for (const [date, snapshot] of Object.entries(database.snapshots)) {
    const locs = new Map(snapshot.Locations.map(l=>[l._id.$oid,l]));
    const foods = new Set(snapshot.Foods.map(f=>f._id.$oid));
    for (const collection of ['Locations','Foods','Menu_Items']) {
      const ids = new Set();
      for (const doc of snapshot[collection]) {
        const fail = message => errors.push(`${date}/${collection}/${doc._id?.$oid}: ${message}`);
        if (!objectId(doc._id) || !integer(doc.version) || doc.version < 1) fail('invalid ID/version');
        if (ids.has(doc._id?.$oid)) fail('duplicate ID');
        ids.add(doc._id?.$oid);
        if (collection === 'Locations') {
          if (!doc.name || !['dining hall','cafe','market','other'].includes(doc.type) || typeof doc.location?.area !== 'string' || !doc.location?.geodata) fail('invalid location');
          if (!Array.isArray(doc.hours?.days) || !doc.hours.days.length || doc.hours.days.some(d=>!['mon','tue','wed','thu','fri','sat','sun'].includes(d)) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(doc.hours.open) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(doc.hours.close)) fail('invalid required hours');
          if (!Array.isArray(doc.stations) || doc.stations.some(s=>!objectId(s.station_id)||!s.station_name)) fail('invalid stations');
        } else if (collection === 'Foods') {
          if (!doc.name || typeof doc.personal !== 'boolean' || typeof doc.beverage !== 'boolean') fail('invalid food identity');
          for (const flag of ['wellness','vegetarian','vegan','sustainability']) if (doc[flag] !== null && typeof doc[flag] !== 'boolean') fail(`invalid ${flag}`);
          if (!Array.isArray(doc.ingredients) || doc.ingredients.some(i=>typeof i!=='string')) fail('invalid ingredients');
          if (!doc.allergens || Object.entries(doc.allergens).some(([key,value])=>!Object.values(DB_ALLERGEN).includes(key)||typeof value!=='boolean')) fail('invalid allergens');
          if (!doc.nutrition?.macros) fail('missing nutrition.macros');
          else {
            for (const [key,value] of Object.entries(doc.nutrition)) if (key !== 'macros' && (!['sodium','sat_fat','fiber','serving_size','calorie','fat_cal','trans_fat','cholesterol','sugar'].includes(key) || !integer(value))) fail(`invalid nutrition.${key}`);
            for (const [key,value] of Object.entries(doc.nutrition.macros)) if (!['protein','carb','fat'].includes(key)||!integer(value)) fail(`invalid macro ${key}`);
          }
        } else {
          if (!objectId(doc.food_id) || !foods.has(doc.food_id.$oid)) fail('dangling food_id');
          const location = locs.get(doc.loc_id?.$oid);
          if (!objectId(doc.loc_id) || !location) fail('dangling loc_id');
          if (!objectId(doc.station_id) || !location?.stations.some(s=>s.station_id.$oid===doc.station_id.$oid)) fail('dangling station_id');
          if (!['breakfast','lunch','dinner','lunch/dinner','late-night','all','unknown'].includes(doc.meal_period)) fail('invalid meal_period');
          if ('price' in doc && !integer(doc.price)) fail('price must be nonnegative integer cents');
        }
      }
    }
  }
  return errors;
}
module.exports = { transformMenus, convertNutrition, validateDatabase };
