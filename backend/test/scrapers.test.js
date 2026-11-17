const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const cheerio = require('cheerio');
const { buildDataset, LOCATIONS } = require('../src/scrapers/buildWebDataset');
const { parseMenuHtml } = require('../src/scrapers/menuParser');
const { parseNutrition, nutritionCacheFileName, nutritionConflict } = require('../src/scrapers/nutritionParser');
const { validateMenu } = require('../src/scrapers/validateMenu');
const { transformMenus, convertNutrition, validateDatabase } = require('../src/scrapers/databaseTransform');
const { extractArchive } = require('../src/scrapers/localFiles');
const dataDir = path.join(__dirname,'../data/web');
const haveInputs = fs.existsSync(path.join(dataDir,'inputs/ucsdRestaurants.zip'));
let dir, result;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(),'hdh-tests-'));
  if (!haveInputs) return;
  fs.mkdirSync(path.join(dir,'inputs'));
  fs.copyFileSync(path.join(dataDir,'inputs/ucsdRestaurants.zip'),path.join(dir,'inputs/ucsdRestaurants.zip'));
  for (const folder of ['raw','nutrition']) if (fs.existsSync(path.join(dataDir,folder))) fs.cpSync(path.join(dataDir,folder),path.join(dir,folder),{recursive:true});
  // Prove the entire pipeline succeeds with fetch and Node socket/HTTP entry
  // points disabled. Cheerio parses strings and never loads linked assets.
  const blocked = [];
  const block = (obj,key) => { blocked.push([obj,key,obj[key]]); obj[key] = () => { throw new Error('Network forbidden in offline test'); }; };
  for (const mod of ['node:http','node:https']) for (const key of ['request','get']) block(require(mod),key);
  for (const key of ['connect','createConnection']) block(require('node:net'),key);
  block(require('node:tls'),'connect'); block(globalThis,'fetch');
  try { result = buildDataset(dir); } finally { for (const [obj,key,original] of blocked) obj[key]=original; }
});
after(() => { if (dir) fs.rmSync(dir,{recursive:true,force:true}); });
const integration = {skip:!haveInputs && 'Local saved HTML ZIP not supplied'};
const entries = menu => menu.stations.flatMap(s=>s.items);
function fixture(rows, date='Monday, November 16 2026') {
  return `<h1>Pines</h1><h2 class="datenow">${date}</h2><p id="station-hours">7:00 AM - 11:00 PM</p>${rows}`;
}
function section(period='Lunch',station='Grill',price='$5.25',name='Rice',id='1',cal='123') {
  return `<div class="meal-category" id="${period}"><div class="menu-category-section"><header class="accordion-header"><h3>${station}</h3></header><div class="accordion1"><div class="panel-heading"><a class="sublocs">Sides</a></div><div class="station-list"><div class="d-none d-lg-block"><div class="menU-item-row"><a class="sublocsitem" href="/dining/apps/diningservices/Nutrition/Nutritionfacts2?id=${id}">${name}</a><span class="item-price">${price}</span><span class="cals">${cal}</span><img title="Vegan"></div></div></div></div></div></div>`;
}
const hall = {id:'pines',name:'Pines',area:'Muir College'};
test('every supplied capture parses; preserves older dates and covers ten restaurants',integration,()=>{
  assert.deepEqual(result.report.failures,[]);
  assert.equal(result.dataset.summary.locations,10);
  assert.equal(result.report.captures.length,14);
  assert.equal(result.dataset.summary.menus,13);
  assert.equal(result.dataset.summary.food_entries,1757);
  assert.equal(result.report.summary.duplicate_captures,1);
  assert.equal(result.report.summary.original_food_occurrences,2990);
  assert.equal(result.report.summary.merged_occurrences,1233);
  assert.equal(result.report.summary.duplicate_capture_rows,209);
  assert.equal(result.report.summary.unverified_nutrition,1);
  assert.deepEqual(result.report.database_errors,[]);
  for (const m of result.dataset.locations.flatMap(l=>l.menus)) assert.deepEqual(validateMenu(m).errors,[]);
  assert.deepEqual(result.dataset.locations.find(l=>l.id==='pines').menus.map(m=>m.menu_date),['2026-11-13','2026-11-14','2026-11-16']);
});
test('independently count desktop rows; retain every row through merge accounting',integration,()=>{
  for (const capture of result.report.captures) {
    const $=cheerio.load(fs.readFileSync(path.join(dir,capture.file),'utf8'));
    const rows=$('.station-list > .d-none.d-lg-block > .menU-item-row');
    const menu=result.dataset.locations.find(l=>l.id===capture.restaurant).menus.find(m=>m.menu_date===capture.date);
    assert.equal(rows.length,entries(menu).length+menu.diagnostics.merged_occurrences);
    rows.each((_,element)=>{
      const row=$(element), name=row.find('a.sublocsitem').text().replace(/\s+/g,' ').trim(), href=row.find('a.sublocsitem').attr('href');
      const station=row.closest('.menu-category-section').find('> .accordion-header h3').text().trim();
      const candidates=menu.stations.find(s=>s.name===station).items.filter(i=>i.name===name&&i.nutrition_url===new URL(href,'https://hdh-web.ucsd.edu').href);
      assert.ok(candidates.length, `${capture.file}: ${station}/${name}`);
      const priceText=row.find('.item-price').first().text().trim();
      const priceMatch=priceText.match(/-?\d+(?:\.\d+)?/);
      const calories=Number(row.find('.cals').first().text().match(/\d+(?:\.\d+)?/)[0]);
      const cents=priceMatch ? Math.round(Number(priceMatch[0])*100):null;
      assert.ok(candidates.some(i=>i.price_cents===cents&&i.calories===calories), `${name}: source price/calories lost`);
    });
  }
});
test('dedup merges repeated meals but preserves stations, portions, prices and dates',()=>{
  const menu=parseMenuHtml(fixture(section()+section('Dinner')+section('Lunch','Other')+section('Dinner','Grill','$6.00')+section('Lunch','Grill','$5.25','Rice','1','200')),hall,0);
  assert.equal(entries(menu).length,4);
  assert.deepEqual(entries(menu)[0].meal_periods,['lunch','dinner']);
  assert.equal(menu.diagnostics.merged_occurrences,1);
  const other=parseMenuHtml(fixture(section(),'Tuesday, November 17 2026'),hall,0);
  assert.equal(Object.keys(transformMenus([menu,other]).snapshots).length,2);
});
test('missing fields survive parsing and validation identifies bad records',()=>{
  const menu=parseMenuHtml(fixture(section('Lunch','Grill','','','bad','')),hall,0);
  assert.equal(entries(menu)[0].price_cents,null);
  assert.equal(entries(menu)[0].calories,null);
  assert.ok(validateMenu(menu).errors.some(e=>e.includes('missing name')));
  const good=parseMenuHtml(fixture(section()),hall,0);
  const item=entries(good)[0]; item.price_cents=-1;item.tags=['invented'];item.nutrition_url='https://evil.test/?id=1';item.calories=-2;
  assert.ok(validateMenu(good).errors.length>=4);
});
test('explicit empty menus work; malformed HTML and impossible dates are reported',()=>{
  assert.equal(parseMenuHtml(fixture('<div class="meal-category">Closed today</div>'),hall,0).stations.length,0);
  assert.throws(()=>parseMenuHtml('<p>error</p>',hall,0),/Unrecognized/);
  assert.throws(()=>parseMenuHtml(fixture('<div class="meal-category">new layout</div>'),hall,0),/layout/);
  assert.ok(validateMenu(parseMenuHtml(fixture(section(),'Monday, February 30 2026'),hall,0)).errors.length);
});
test('nutrition cache rejects foreign hosts, paths, credentials and missing IDs',()=>{
  for (const url of ['https://evil.test/?id=1','https://hdh-web.ucsd.edu/other?id=1','https://x@hdh-web.ucsd.edu/dining/apps/diningservices/Nutrition/Nutritionfacts2?id=1','http://hdh-web.ucsd.edu/?id=1',null]) assert.throws(()=>nutritionCacheFileName(url));
  assert.equal(nutritionCacheFileName('https://hdh-web.ucsd.edu/dining/apps/diningservices/Nutrition/Nutritionfacts2?id=12&recId=a/b'),'12-a%2Fb.html');
});
test('saved detailed nutrition matches source values and PDF integer units',integration,()=>{
  const n=parseNutrition(fs.readFileSync(path.join(dir,'nutrition/6352.html'),'utf8'));
  assert.equal(n.calorie,984); assert.equal(n.macros.protein,38.6);assert.equal(n.sodium,2784.5);assert.equal(n.serving_size,11.6);
  assert.equal(n.macros.carb,91);assert.equal(n.macros.fat,52.1);assert.equal(n.sat_fat,9.9);assert.equal(n.trans_fat,0.1);assert.equal(n.cholesterol,282.2);assert.equal(n.fiber,4.4);assert.equal(n.sugar,28.1);
  const db=convertNutrition({nutrition:n});
  assert.equal(db.calorie,9840);assert.equal(db.macros.protein,38600);assert.equal(db.sodium,2785);assert.equal(db.serving_size,116);
  assert.ok(n.ingredients.startsWith('Chicken, Breast'));
  assert.deepEqual(convertNutrition({calories:null}),{macros:{}});
});
test('all PDF documents validate; missing values omitted and allergens remain unknown',integration,()=>{
  assert.deepEqual(validateDatabase(result.database),[]);
  const snap=result.database.snapshots['2026-11-16'];
  assert.equal(snap.Locations.length,10);
  assert.ok(snap.Foods.some(f=>f.name==='Fountain Soda' && f.beverage===true));
  assert.ok(snap.Foods.some(f=>f.name==='Bacon' && f.beverage===false));
  for(const f of snap.Foods) {
    assert.equal(f.version,1);assert.ok('wellness' in f);assert.ok('vegetarian' in f);
    assert.ok(Object.values(f.allergens).every(v=>v===true));
    if (!('protein' in f.nutrition.macros)) assert.equal(f.nutrition.macros.protein,undefined);
  }
  const copied=structuredClone(result.database);copied.snapshots['2026-11-16'].Menu_Items[0].price=1.5;
  assert.ok(validateDatabase(copied).some(e=>e.includes('cents')));
});
test('missing hours withholds location rather than fabricating required PDF fields',()=>{
  const menu=parseMenuHtml(fixture(section()).replace('7:00 AM - 11:00 PM','unknown'),hall,0);
  const db=transformMenus([menu]);assert.equal(db.withheld.length,1);assert.equal(db.snapshots[menu.menu_date].Locations.length,0);
});
test('ZIP extraction refuses traversal and preserves existing differing inputs',()=>{
  const archive=path.join(dir,'unsafe.zip'),target=path.join(dir,'safe');
  const created=spawnSync('python3',['-c',"import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],'w'); z.writestr('../escape.html','bad'); z.close()",archive]);
  assert.equal(created.status,0);assert.throws(()=>extractArchive(archive,target),/Unsafe ZIP path/);
  assert.equal(fs.existsSync(path.join(dir,'escape.html')),false);
});
test('rebuilding is deterministic and never includes stale generated menu JSON',integration,()=>{
  fs.writeFileSync(path.join(dir,'output/menus/stale.json'),'{"fake":true}');
  const again=buildDataset(dir);
  assert.deepEqual(again.database,result.database);
  assert.deepEqual(again.dataset.summary,result.dataset.summary);
  assert.deepEqual(again.report.summary,result.report.summary);
});

test('validation catches missing station, source IDs, invalid nutrition and duplicate records',()=>{
  const menu=parseMenuHtml(fixture(section()),hall,0);
  const food=entries(menu)[0];
  food.nutrition={calorie:NaN,macros:{protein:-1}};
  food.source_item_id=null;
  menu.stations[0].items.push(structuredClone(food));
  const r=validateMenu(menu);
  assert.equal(r.counts.duplicates,1);
  assert.ok(r.errors.some(e=>e.includes('invalid detailed nutrition')));
  assert.ok(r.errors.some(e=>e.includes('source item ID')));
  menu.stations[0].name='';
  assert.ok(validateMenu(menu).errors.some(e=>e.includes('station')));
});
test('malformed captures are reported while valid captures still produce output',()=>{
  const local=path.join(dir,'partial');fs.mkdirSync(path.join(local,'raw'),{recursive:true});
  fs.writeFileSync(path.join(local,'raw/pines-day0.html'),fixture(section()));
  fs.writeFileSync(path.join(local,'raw/bistro-day0.html'),'<html>error response</html>');
  fs.writeFileSync(path.join(local,'raw/strange.html'),'unknown format');
  const r=buildDataset(local);
  assert.equal(r.report.summary.errors,2);assert.equal(r.dataset.summary.menus,1);
  assert.equal(r.report.failures.length,2);
});
test('ZIP cannot overwrite a differing saved capture',()=>{
  const archive=path.join(dir,'different.zip'),target=path.join(dir,'overwrite');
  fs.mkdirSync(target);fs.writeFileSync(path.join(target,'pines-day0.html'),'original');
  const made=spawnSync('python3',['-c',"import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],'w'); z.writestr('pines-day0.html','changed'); z.close()",archive]);
  assert.equal(made.status,0);assert.throws(()=>extractArchive(archive,target),/Existing capture differs/);
  assert.equal(fs.readFileSync(path.join(target,'pines-day0.html'),'utf8'),'original');
});

test('date-specific calorie policy preserves historical snapshots and quarantines all conflicting nutrients',integration,()=>{
  const pines=result.dataset.locations.find(l=>l.id==='pines');
  for (const menu of pines.menus) {
    const item=entries(menu).find(i=>i.source_item_id==='6352');
    const conflict=menu.menu_date==='2026-11-16';
    assert.equal(item.calories,conflict ? 875:984);
    assert.equal(item.nutrition.calorie,984); // Original snapshot retained in full.
    assert.equal(item.nutrition.macros.protein,38.6);
    assert.equal(item.nutrition_status,conflict ? 'unverified':'available');
    const snap=result.database.snapshots[menu.menu_date];
    const provenance=snap.provenance.filter(p=>p.source_item_id==='6352');
    assert.equal(provenance.length,2);
    for (const p of provenance) {
      const menuItem=snap.Menu_Items.find(m=>m._id.$oid===p.menu_item_id.$oid);
      const food=snap.Foods.find(f=>f._id.$oid===menuItem.food_id.$oid);
      assert.equal(menuItem.price,950);
      assert.equal(food.nutrition.calorie,conflict ? 8750:9840);
      if (conflict) {
        assert.deepEqual(food.nutrition,{macros:{},calorie:8750});
        assert.deepEqual(food.ingredients,[]);
        assert.equal(p.nutrition_status,'unverified');
        assert.equal(p.nutrition_audit.menu_calories,875);
        assert.equal(p.nutrition_audit.snapshot_calories,984);
        assert.equal(p.nutrition_audit.snapshot_file,'nutrition/6352.html');
      } else {
        assert.equal(food.nutrition.macros.protein,38600);
        assert.ok(food.ingredients.length);
      }
    }
  }
});
test('conflict policy works for any food, without status annotations or a particular date/ID',()=>{
  const item={name:'Unrelated food',calories:123,source_item_id:'99999',nutrition_status:'available',
    nutrition:{calorie:456,macros:{protein:12},sodium:50,ingredients:'unverified recipe'}};
  assert.deepEqual(nutritionConflict(item),{reason:'calorie_mismatch',menu_calories:123,snapshot_calories:456});
  assert.deepEqual(convertNutrition(item),{macros:{},calorie:1230});
  assert.equal(item.nutrition.calorie,456);
  item.calories=null;
  assert.equal(convertNutrition(item).calorie,4560); // No menu value to overwrite.
  item.calories=456;
  assert.equal(convertNutrition(item).macros.protein,12000);
  item.nutrition_status='unverified';
  assert.deepEqual(convertNutrition(item),{macros:{},calorie:4560});
});
test('new layout packages only current generated files and ignores archived captures',integration,()=>{
  assert.ok(fs.existsSync(path.join(dir,'output/web-dataset.json')));
  assert.equal(fs.existsSync(path.join(dir,'web-dataset.json')),false);
  const archive=path.join(dir,'archive/raw');fs.mkdirSync(archive,{recursive:true});
  fs.writeFileSync(path.join(archive,'pines-day0.html'),'invalid archived capture');
  const again=buildDataset(dir);
  assert.deepEqual(again.report.summary,result.report.summary);
  const checked=spawnSync('python3',['-c',`
import sys,zipfile,json
with zipfile.ZipFile(sys.argv[1]) as z:
    names=z.namelist()
    assert 'output/web-dataset.json' in names
    assert 'README.md' in names
    assert all(n=='README.md' or (n.startswith(('output/','reports/')) and n.endswith('.json')) for n in names)
    data=json.loads(z.read('output/web-dataset.json'))
    assert data['summary']['food_entries']==1757
    foods=json.loads(z.read('output/mongodb/2026-11-16/Foods.json'))
    sandwich=next(f for f in foods if f['name']=='Korean Fried Chicken Sandwich')
    assert sandwich['nutrition']=={'macros':{},'calorie':8750}
`,path.join(dir,'exports/hdh-web-validated.zip')],{encoding:'utf8'});
  assert.equal(checked.status,0,checked.stderr);
});
