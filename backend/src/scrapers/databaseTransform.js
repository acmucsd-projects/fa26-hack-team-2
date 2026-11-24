const { createHash } = require('node:crypto');
const { DB_ALLERGEN } = require('../constants/tags');
const { calorieValue } = require('./nutritionParser');

const MASS = { mg: 1, g: 1000, mcg: 0.001, kg: 1000000 };
const OUNCES = { oz: 1, g: 1 / 28.349523125, mg: 1 / 28349.523125, kg: 1000 / 28.349523125, lb: 16 };
const MACROS = ['protein', 'carb', 'fat'];
const NUTRIENTS = ['calorie', 'fat_cal', 'sat_fat', 'trans_fat', 'fiber', 'sugar', 'sodium', 'cholesterol'];
function convertQuantity(field, q) {
  if (!q || q.qualifier || !Number.isFinite(q.value) || q.value < 0) return null;
  let value;
  if (['calorie', 'fat_cal'].includes(field)) {
    const calories = calorieValue(q);
    value = calories === null ? NaN : calories * 10;
  } else if (field === 'serving_size') value = q.value * (OUNCES[q.unit] ?? NaN) * 10;
  else value = q.value * (MASS[q.unit] ?? NaN);
  const rounded = Math.round(value);
  return Number.isSafeInteger(rounded) && rounded >= 0 ? rounded : null;
}
function convertNutrition(item) {
  const raw = item.nutrition;
  const usable = raw?.collection_status === 'cached' && !['calorie_conflict', 'snapshot_ambiguous'].includes(raw.verification_status);
  const data = usable ? raw.data : null;
  const result = { macros: {} }, issues = [];
  const put = (target, field, q) => {
    const value = convertQuantity(field, q);
    if (value !== null) target[field] = value;
    else if (q) issues.push(`Cannot export ${field}: unsupported, qualified or invalid quantity (${q.raw})`);
  };
  // The captured menu always wins; the full conflicting snapshot stays in raw JSON.
  put(result, 'calorie', item.calories == null ? data?.nutrients.calorie : { value: item.calories, unit: 'kcal' });
  for (const field of NUTRIENTS.filter(f => f !== 'calorie')) put(result, field, data?.nutrients[field]);
  for (const field of MACROS) put(result.macros, field, data?.nutrients[field]);
  put(result, 'serving_size', data?.serving_size);
  return { nutrition: result, usable, issues };
}
function stable(value) {
  return Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])])) : value;
}
const oid = value => ({ $oid: createHash('sha256').update(JSON.stringify(stable(['hdh-nutrition-v1', value]))).digest('hex').slice(0, 24) });
const FOOD_CATEGORIES = new Set([
  'Burritos', 'Tacos', 'Bowls', 'Quesadillas', 'Burgers', 'Salads', 'Soups', 'Pizza', 'Pizza Slices',
  'Ice Cream', 'Breakfast Sandwiches', 'Pasta Bowls', 'Poke Bowls', 'Breakfast Bowls', 'Wrap',
  'Detroit Pizza', 'Sushi Rolls', 'Bagel Bar', 'Oatmeal', 'Nachos', 'Wings', 'Sandwiches & More',
  'Desserts', 'Plates', 'Side Salads', 'Salad BYO Base', 'Breakfast Burrito',
  'Sauces', 'Toppings', 'Proteins', 'Small Plates', 'Appetizers', 'Specialty Bowls',
  'Burger Styles', 'Bakery', 'Pastries', 'Soups & Stews'
].map(s => s.toLowerCase()));
const DRINK_CATEGORIES = new Set([
  'beverage', 'beverages', 'drinks', 'hot drinks', 'cold drinks', 'soft drinks',
  'fountain drinks', 'bottled drinks', 'water', 'bottled water', 'coffee',
  'coffee & tea', 'coffee and tea', 'espresso', 'espresso drinks', 'tea', 'teas',
  'milk tea', 'boba', 'bubble tea', 'smoothies', 'shakes', 'milkshakes', 'juice',
  'juices', 'lemonade', 'sports drinks', 'energy drinks', 'hot chocolate', 'milk'
]);
const normalized = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const FOOD_FORM = /\b(?:sandwich(?:es)?|soups?|broths?|bowls?|plates?|salads?|cakes?|brownies?|cookies?|pastries|pastry|desserts?|ice cream|gelato|sorbet|sherbet|sundaes?|pudding|custard|cheesecake|cannoli|flan|pies?|tarts?|mousse|mochi|truffles?|granita|popsicles?|ice pops?|frozen yogurt|tiramisu|pancakes?|waffles?|toast|biscuits?|bread(?:sticks?)?|croutons?|muffins?|croissants?|scones?|doughnuts?|donuts?|dumplings?|bao|buns?|rolls?|sushi|nigiri|onigiri|tacos?|burritos?|quesadillas?|burgers?|cheeseburgers?|pizza|pasta|noodles?|ramen|rice|oatmeal|oats|granola|parfait|fries|tots?|potato(?:es)?|hash browns?|chips|nachos|wings?|tenders?|nuggets?|patt(?:y|ies)|meatballs?|steaks?|cutlets?|beef|chicken|pork|salmon|fish|tuna|shrimp|tofu|sausage|bacon|eggs?|cheese|beans?|lentils?|vegetables?|lettuce|slaw|salsa|sauces?|dressing|aioli|chutney|gravy|marinade|reduction|syrup|powder|pearls|chestnuts|candy|chocolate bar)\b/;
// Checked after drink names so, for example, a mango smoothie is still a drink.
const SOLID_INGREDIENT = /\b(?:fruit|avocado|guacamole|edamame|quinoa|greens|corn|bamboo|mushrooms?|carrots?|onions?|beets?|radish|cabbage|cucumber|jalapeno|ginger|cilantro|broccolini|bok choy|peas|artichoke|olives?|peppers?|tomato(?:es)?|squash|blueberries|cranberr(?:y|ies)|bananas?|apples?|mango|pineapple|nuts?|walnuts?|almonds?|cashews?|peanuts?|seeds?|pepitas|wonton strips|honey|sour cream|dough|grain|garnish|topping|spread|spice|seafood|krab|naan|chana|chaat|beignets|onion rings)\b/;
const DRINK_RULES = [
  ['water', /\b(?:water|seltzer)\b/],
  ['soft_drink', /\b(?:soda|soft drinks?|cola|coca[ -]?cola|coke|pepsi|sprite|fanta|dr\.? pepper|7up|root beer|mountain dew)\b/],
  ['coffee', /\b(?:coffee|espresso|americano|cappuccino|latte|macchiato|mocha|cortado|cold brew|flat white|cafe au lait)\b/],
  ['tea_or_boba', /\b(?:tea|boba|matcha|chai)\b/],
  ['smoothie_or_shake', /\b(?:smoothies?|milk\s?shakes?|shakes?|frappes?|frappuccino|floats?)\b/],
  ['juice_or_lemonade', /\b(?:juices?|lemonade|cider|punch)\b/],
  ['sports_or_energy_drink', /\b(?:(?:sports?|energy|electrolyte) drinks?|gatorade|powerade|red bull|monster energy)\b/],
  ['other_beverage', /\b(?:hot chocolate|cocoa|horchata|agua fresca|agua de|lassi|kombucha|kefir|milk|beverages?|drinks?|drinkable)\b/]
];
const DRINK_STATION = /^(?:(?:coffee|espresso|tea|boba|smoothie|juice|beverage|drink)s? (?:bar|station)|beverages?|drinks?)$/;
const DESCRIPTION_DRINK = /^(?:(?:a|an|hot|cold|iced|sweetened|unsweetened|bottled|sparkling|fresh|freshly squeezed|blended|fruit|black|green|refreshing|orange|apple|mango|pineapple|coconut)\s+){0,4}(?:water|seltzer|coffee|espresso|tea|milk tea|boba|smoothie|milkshake|juice|lemonade|hot chocolate|cocoa|beverage|drink)\b/;
function classifyBeverage(item = {}, stationName = '') {
  const name = normalized(item.name), category = normalized(item.category), description = normalized(item.description);
  // Ice cream shakes/floats are drinks; cake, pudding, cones, etc. remain food.
  let formName = /\b(?:shakes?|floats?)\b/.test(name) ? name.replace(/\bice cream\b/g, '') : name;
  if (/\brice milk\b/.test(name)) formName = formName.replace(/\brice\b/g, '');
  const foodName = FOOD_FORM.test(formName);
  const drinkRule = DRINK_RULES.find(([, pattern]) => pattern.test(name))?.[0];
  const result = (value, source, rule, review_required = false) => ({ value, source, rule, review_required });
  const fallback = rule => result(false, 'default', rule, true);
  if (DRINK_CATEGORIES.has(category)) {
    return foodName ? fallback('conflicting_beverage_category_and_food_name') : result(true, 'explicit_category', 'beverage_category');
  }
  if (FOOD_CATEGORIES.has(category)) {
    // Dessert/ice cream menus also publish drinkable shakes. A specific drink
    // form is stronger evidence than these mixed dessert categories.
    if (drinkRule && !foodName && ['desserts', 'ice cream'].includes(category)) return result(true, 'high_confidence_inference', 'drink_name_in_dessert_category:' + drinkRule);
    return result(false, 'explicit_category', 'food_category');
  }
  if (foodName) return result(false, 'high_confidence_inference', 'food_form_in_name');
  if (drinkRule) return result(true, 'high_confidence_inference', 'drink_name:' + drinkRule);
  if (SOLID_INGREDIENT.test(name)) return result(false, 'high_confidence_inference', 'solid_food_in_name');
  // Descriptions are supporting evidence, never a bag of ingredient keywords.
  // For example, orange juice in a chicken sauce does not describe a drink.
  if (FOOD_FORM.test(description)) return result(false, 'high_confidence_inference', 'food_form_in_description');
  if (DESCRIPTION_DRINK.test(description)) return result(true, 'high_confidence_inference', 'drink_description');
  if (SOLID_INGREDIENT.test(description)) return result(false, 'high_confidence_inference', 'solid_food_in_description');
  if (DRINK_STATION.test(normalized(stationName))) return result(true, 'high_confidence_inference', 'beverage_station');
  return fallback('insufficient_evidence');
}
const PERIODS = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', lunch_dinner: 'lunch/dinner', late_night: 'late-night', all: 'all', unknown: 'unknown' };
function transformMenus(menus) {
  const snapshots = {}, withheld = [], issues = [];
  const beverageClassification = { summary: { total: 0, true: 0, false: 0, explicit_category: 0, high_confidence_inference: 0, default: 0, manual_review: 0 }, review: [] };
  let accepted = 0;
  for (const menu of menus) {
    const snap = snapshots[menu.menu_date] ||= { Locations: [], Foods: [], Menu_Items: [], provenance: [] };
    const locId = oid(['location', menu.dining_hall.id]);
    if (menu.hours) snap.Locations.push({
      _id: locId, version: 1, name: menu.dining_hall.name, type: 'dining hall',
      location: { area: menu.dining_hall.area, geodata: {} }, hours: menu.hours,
      stations: menu.stations.map(s => ({ station_id: oid(['station', s.id]), station_name: s.name }))
    });
    for (const station of menu.stations) for (const item of station.items) {
      const context = { restaurant: menu.dining_hall.id, date: menu.menu_date, station: station.name, name: item.name, source_url: item.nutrition_url, category: item.category };
      const classification = classifyBeverage(item, station.name);
      const beverage = classification.value;
      const summary = beverageClassification.summary;
      summary.total++; summary[String(beverage)]++; summary[classification.source]++;
      if (classification.review_required) {
        summary.manual_review++;
        beverageClassification.review.push({ ...context, description: item.description, source_item_id: item.source_item_id,
          meal_periods: item.meal_periods, source_files: menu.source_files, classification });
      }
      if (!menu.hours) {
        withheld.push({ ...context, reason: 'Required location hours are unknown' });
        continue;
      }
      const converted = convertNutrition(item);
      const detail = converted.usable ? item.nutrition.data : null;
      const tags = new Set([...(item.tags || []), ...(detail?.tags || [])]);
      const flags = {};
      for (const field of ['vegan', 'vegetarian', 'wellness', 'sustainability']) {
        const menuPositive = tags.has(field);
        const snapshot = detail?.flags[field];
        flags[field] = menuPositive ? snapshot === false ? null : true : snapshot ?? null;
      }
      if (flags.vegan === true && flags.vegetarian !== false) flags.vegetarian = true;
      const food = {
        version: 1, name: item.name, personal: false, beverage, ...flags,
        ingredients: detail?.ingredients || [],
        allergens: Object.fromEntries([...tags].filter(t => DB_ALLERGEN[t]).map(t => [DB_ALLERGEN[t], true])),
        nutrition: converted.nutrition
      };
      const foodId = oid(['food', item.nutrition_url, item.calories, item.description, food]);
      if (!snap.Foods.some(f => f._id.$oid === foodId.$oid)) snap.Foods.push({ _id: foodId, ...food });
      accepted++;
      for (const issue of converted.issues) issues.push({ ...context, issue });
      for (const rawPeriod of item.meal_periods) {
        const period = PERIODS[rawPeriod] || 'unknown';
        if (!PERIODS[rawPeriod]) issues.push({ ...context, issue: `${rawPeriod} maps to unknown because the schema has no corresponding meal period` });
        const price = item.prices_by_meal_period[rawPeriod];
        const doc = {
          _id: oid(['offering', menu.menu_date, menu.dining_hall.id, station.id, item.category, foodId, rawPeriod, price]),
          version: 1, food_id: foodId, loc_id: locId, station_id: oid(['station', station.id]), meal_period: period
        };
        if (price != null) doc.price = price;
        snap.Menu_Items.push(doc);
        snap.provenance.push({ menu_item_id: doc._id, ...context, description: item.description, menu_day: menu.menu_day,
          source_item_id: item.source_item_id, raw_meal_period: rawPeriod, source_files: menu.source_files,
          retrieved_at: item.nutrition?.retrieved_at || null, verification_status: item.nutrition?.verification_status || 'unavailable',
          beverage_classification: classification });
      }
    }
  }
  return { snapshots, withheld, issues, records_valid_for_export: accepted, beverage_classification: beverageClassification };
}
function validateDatabase(database) {
  const errors = [];
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const objectId = value => value && Object.keys(value).length === 1 && /^[a-f0-9]{24}$/.test(value.$oid);
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  const only = (doc, fields) => Object.keys(doc).every(k => fields.includes(k));
  if (!record(database?.snapshots)) return ['Missing dated snapshots'];
  for (const [date, snap] of Object.entries(database.snapshots)) {
    if (!record(snap) || ['Locations', 'Foods', 'Menu_Items'].some(name => !Array.isArray(snap[name]))) {
      errors.push(`${date}: missing collection arrays`);
      continue;
    }
    const locs = new Map(snap.Locations.map(l => [l?._id?.$oid, l]));
    const foods = new Set(snap.Foods.map(f => f?._id?.$oid));
    for (const collection of ['Locations', 'Foods', 'Menu_Items']) {
      const ids = new Set();
      for (const doc of snap[collection]) {
        const fail = text => errors.push(`${date}/${collection}/${doc._id?.$oid}: ${text}`);
        if (!record(doc)) { errors.push(`${date}/${collection}: document must be an object`); continue; }
        if (!objectId(doc._id) || !integer(doc.version) || doc.version < 1 || ids.has(doc._id?.$oid)) fail('Invalid ID, version or duplicate document');
        ids.add(doc._id?.$oid);
        if (collection === 'Foods') {
          if (!only(doc, ['_id','version','name','personal','beverage','wellness','vegetarian','vegan','sustainability','ingredients','allergens','nutrition']) || typeof doc.name !== 'string' || !doc.name.trim() || typeof doc.personal !== 'boolean' || typeof doc.beverage !== 'boolean') fail('Invalid food fields');
          for (const flag of ['wellness','vegetarian','vegan','sustainability']) if (doc[flag] !== null && typeof doc[flag] !== 'boolean') fail(`Invalid ${flag}`);
          if (!Array.isArray(doc.ingredients) || doc.ingredients.some(v => typeof v !== 'string')) fail('Invalid ingredients');
          if (!record(doc.allergens) || Object.entries(doc.allergens).some(([k,v]) => !Object.values(DB_ALLERGEN).includes(k) || typeof v !== 'boolean')) fail('Invalid allergens');
          if (!record(doc.nutrition) || !record(doc.nutrition.macros) || !only(doc.nutrition, [...NUTRIENTS,'macros','serving_size'])) fail('Invalid nutrition object');
          else {
            for (const [k,v] of Object.entries(doc.nutrition)) if (k !== 'macros' && !integer(v)) fail(`Invalid integer nutrient ${k}`);
            if (!only(doc.nutrition.macros, MACROS) || Object.values(doc.nutrition.macros).some(v => !integer(v))) fail('Invalid macros');
          }
        } else if (collection === 'Locations') {
          if (!only(doc, ['_id','version','name','type','location','hours','stations']) || typeof doc.name !== 'string' || !doc.name.trim() || !['dining hall','cafe','market','other'].includes(doc.type) || !record(doc.location) || typeof doc.location.area !== 'string' || !record(doc.location.geodata)) fail('Invalid location');
          const hours = doc.hours;
          if (!record(hours) || !Array.isArray(hours.days) || !hours.days.length || hours.days.some(d => !['mon','tue','wed','thu','fri','sat','sun'].includes(d)) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hours.open) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hours.close)) fail('Invalid hours');
          if (!Array.isArray(doc.stations) || doc.stations.some(s => !record(s) || !objectId(s.station_id) || typeof s.station_name !== 'string' || !s.station_name.trim()) || new Set(doc.stations.map(s => s?.station_id?.$oid)).size !== doc.stations.length) fail('Invalid stations');
        } else {
          if (!only(doc, ['_id','version','food_id','loc_id','station_id','meal_period','price']) || !objectId(doc.food_id) || !foods.has(doc.food_id.$oid)) fail('Invalid food reference/fields');
          const loc = locs.get(doc.loc_id?.$oid);
          if (!objectId(doc.loc_id) || !loc || !objectId(doc.station_id) || !Array.isArray(loc.stations) || !loc.stations.some(s => s?.station_id?.$oid === doc.station_id.$oid)) fail('Invalid location/station reference');
          if (!Object.values(PERIODS).includes(doc.meal_period) || ('price' in doc && !integer(doc.price))) fail('Invalid meal period or cents price');
        }
      }
    }
  }
  return errors;
}
module.exports = { convertQuantity, convertNutrition, classifyBeverage, transformMenus, validateDatabase };
