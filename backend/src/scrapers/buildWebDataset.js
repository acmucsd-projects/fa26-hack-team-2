const fs = require('node:fs');
const path = require('node:path');
const { parseMenuHtml } = require('./menuParser');
const { parseNutrition, nutritionCacheFileName } = require('./nutritionParser');
const { validateMenu } = require('./validateMenu');
const { extractArchive, htmlFiles } = require('./inputArchive');
const { transformMenus, validateDatabase } = require('./databaseTransform');
const LOCATIONS = [
  ['64-degrees','64degrees','64 Degrees','Revelle College'],
  ['bistro','bistro','Bistro'], ['canyon-vista','canyonVista','Canyon Vista Marketplace'],
  ['cecils-faculty-club','cecilsAtFacultyClub',"Cecil's at Faculty Club"],
  ['club-med','clubMed','Club Med'], ['foodworx','foodworx','Foodworx'],
  ['oceanview','oceanView','OceanView'], ['pines','pines','Pines','Muir College'],
  ['sixth-college','sixth','Restaurants at Sixth College'], ['ventanas','ventanas','Ventanas']
].map(([id,alias,name,area])=>({id,alias,name,area:area || 'unknown'}));
function write(file, data) { fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n'); }
function buildDataset(dataDir = path.join(__dirname,'../../data/web')) {
  extractArchive(path.join(dataDir,'inputs/ucsdRestaurants.zip'),path.join(dataDir,'inputs/extracted'));
  const reportsDir = path.join(dataDir,'reports');
  fs.mkdirSync(reportsDir,{recursive:true});
  // Preserve old artifacts rather than deleting local user data. The current
  // build reads inputs only, never stale JSON from previous builds.
  for (const name of ['capture-checklist.html','nutrition-manifest.json','pines-preview.json']) {
    const from = path.join(dataDir,name), to = path.join(reportsDir,'legacy',name);
    if (fs.existsSync(from) && !fs.existsSync(to)) { fs.mkdirSync(path.dirname(to),{recursive:true}); fs.renameSync(from,to); }
  }
  const oldOutput = path.join(dataDir,'output');
  if (fs.existsSync(oldOutput)) for (const name of fs.readdirSync(oldOutput).filter(n=>n.endsWith('.json'))) {
    const to = path.join(reportsDir,'legacy/output',name);
    if (!fs.existsSync(to)) { fs.mkdirSync(path.dirname(to),{recursive:true}); fs.renameSync(path.join(oldOutput,name),to); }
  }
  const files = [...htmlFiles(path.join(dataDir,'raw')),...htmlFiles(path.join(dataDir,'inputs/extracted'))];
  const failures = [], captures = [], byMenu = new Map(), nutritionPages = new Map(), nutritionCache = new Map();
  for (const file of files) {
    const relative = path.relative(dataDir,file);
    try {
      const match = path.basename(file).match(/^(.+)-day([0-6])\.html$/i);
      if (!match) throw new Error('Expected <location>-day0..6.html filename');
      const hall = LOCATIONS.find(h=>[h.id,h.alias].some(a=>a.toLowerCase()===match[1].toLowerCase()));
      if (!hall) throw new Error(`Unconfigured restaurant alias: ${match[1]}`);
      const menu = parseMenuHtml(fs.readFileSync(file,'utf8'),hall,Number(match[2]));
      if (menu.dining_hall.name !== hall.name) throw new Error(`Restaurant heading does not match filename: ${menu.dining_hall.name}`);
      menu.source_files = [relative];
      const preliminary = validateMenu(menu);
      if (preliminary.errors.length) throw new Error(preliminary.errors.join('; '));
      const key = `${hall.id}|${menu.menu_date}`;
      const old = byMenu.get(key);
      captures.push({file:relative,restaurant:hall.id,date:menu.menu_date,day:menu.menu_day,stations:menu.stations.map(s=>s.name),foods:preliminary.counts.foods,rows:menu.diagnostics.rows});
      if (old) {
        // Never silently choose between disagreeing captures of the same date.
        if (JSON.stringify(old.stations)!==JSON.stringify(menu.stations) || JSON.stringify(old.hours)!==JSON.stringify(menu.hours)) throw new Error('Conflicting captures for restaurant/date; both originals preserved');
        old.source_files.push(relative);
        continue;
      }
      byMenu.set(key,menu);
    } catch (error) { failures.push({file:relative,error:error.message}); }
  }
  const menus = [...byMenu.values()].sort((a,b)=>`${a.dining_hall.id}|${a.menu_date}`.localeCompare(`${b.dining_hall.id}|${b.menu_date}`));
  const validations = [];
  for (const menu of menus) {
    for (const station of menu.stations) for (const item of station.items) {
      const cacheFile = nutritionCacheFileName(item.nutrition_url);
      const saved = path.join(dataDir,'nutrition',cacheFile);
      if (!nutritionCache.has(cacheFile)) {
        let nutrition = null;
        if (fs.existsSync(saved)) {
          const parsed = parseNutrition(fs.readFileSync(saved,'utf8'));
          const {macros,ingredients,serving_size_text,...values}=parsed;
          if (Object.values({...values,...macros}).some(v=>v!==null) || ingredients) nutrition=parsed;
        }
        nutritionCache.set(cacheFile,nutrition);
      }
      item.nutrition = nutritionCache.get(cacheFile);
      item.nutrition_status = item.nutrition ? 'available' : fs.existsSync(saved) ? 'invalid':'missing';
      if (!nutritionPages.has(cacheFile)) nutritionPages.set(cacheFile,{cache_file:cacheFile,url:item.nutrition_url,saved:fs.existsSync(saved),used_by:[]});
      nutritionPages.get(cacheFile).used_by.push(`${menu.dining_hall.id}/${menu.menu_date}/${station.name}/${item.name}`);
    }
    const result = validateMenu(menu);
    validations.push({restaurant:menu.dining_hall.id,date:menu.menu_date,...result});
    write(path.join(dataDir,'output/menus',`${menu.dining_hall.id}-${menu.menu_date}.json`),menu);
  }
  const locations = LOCATIONS.filter(h=>menus.some(m=>m.dining_hall.id===h.id)).map(h=>({id:h.id,name:h.name,area:h.area,menus:menus.filter(m=>m.dining_hall.id===h.id)}));
  const summary = {input_files:files.length,menus:menus.length,locations:locations.length,food_entries:validations.reduce((n,v)=>n+v.counts.foods,0)};
  const dataset = {source:'hdh-web',collection_method:'saved-html-only',generated_at:new Date().toISOString(),summary,locations};
  const database = transformMenus(menus);
  const databaseErrors = validateDatabase(database);
  const report = {database_errors:databaseErrors,summary:{...summary,errors:databaseErrors.length+failures.length+validations.reduce((n,v)=>n+v.errors.length,0),warnings:validations.reduce((n,v)=>n+v.warnings.length,0)+database.warnings.length,
    duplicate_captures:captures.length-menus.length,duplicates:validations.reduce((n,v)=>n+v.counts.duplicates,0),merged_occurrences:validations.reduce((n,v)=>n+v.counts.merged_occurrences,0)},
    failures,captures,menus:validations,coverage:LOCATIONS.map(h=>({restaurant:h.id,dates:menus.filter(m=>m.dining_hall.id===h.id).map(m=>m.menu_date),saved_day_offsets:[...new Set(menus.filter(m=>m.dining_hall.id===h.id).map(m=>m.menu_day))],missing_day_offsets:[0,1,2,3,4,5,6].filter(d=>!menus.some(m=>m.dining_hall.id===h.id&&m.menu_day===d))})),
    database_warnings:database.warnings,withheld_database_locations:database.withheld,
    limitations:['Missing day offsets do not prove closure; only saved pages were processed.','Area unknown unless supported by existing project data. No coordinates inferred.','Absent allergen icons do not prove allergen absence.','Current backend models/importer predate Wes PDF: do not import these exports through db:import.','Each database snapshot is independent: Menu_Items has no calendar date field.']};
  if (!files.length) { report.failures.push({error:'No saved HTML input files'}); report.summary.errors++; }
  if (locations.length<LOCATIONS.length) report.limitations.push(`Only ${locations.length}/10 configured restaurants have captures.`);
  write(path.join(dataDir,'web-dataset.json'),dataset);
  for (const [date,snapshot] of Object.entries(database.snapshots)) {
    for (const collection of ['Locations','Foods','Menu_Items']) write(path.join(dataDir,'output/mongodb',date,`${collection}.json`),snapshot[collection]);
    write(path.join(dataDir,'output/mongodb',date,'provenance.json'),snapshot.provenance);
  }
  write(path.join(reportsDir,'validation-report.json'),report);
  const pages=[...nutritionPages.values()].sort((a,b)=>a.cache_file.localeCompare(b.cache_file));
  write(path.join(reportsDir,'nutrition-manifest.json'),{summary:{unique_nutrition_pages:pages.length,saved_pages:pages.filter(p=>p.saved).length,missing_pages:pages.filter(p=>!p.saved).length},pages});
  write(path.join(reportsDir,'output-manifest.json'),{menus:menus.map(m=>`output/menus/${m.dining_hall.id}-${m.menu_date}.json`),database_dates:Object.keys(database.snapshots)});
  return {dataset,report,database};
}
if (require.main===module) {
  try {
    const {report}=buildDataset();
    console.log(JSON.stringify(report.summary,null,2));
    console.log('Offline build complete. See data/web/reports/validation-report.json. No HTTP requests.');
    if (report.summary.errors) process.exitCode=1;
  } catch (error) { console.error(`Build failed: ${error.message}`); process.exitCode=1; }
}
module.exports={buildDataset,LOCATIONS};
