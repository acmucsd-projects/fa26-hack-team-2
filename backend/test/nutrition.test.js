const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { parseNutrition, nutritionUrl, cacheKey, hashHtml, readCachedNutrition, ORIGIN, NUTRITION_PATH } = require('../src/scrapers/nutritionParser');
const { convertQuantity, convertNutrition, classifyBeverage, transformMenus, validateDatabase } = require('../src/scrapers/databaseTransform');
const { writeNutritionCache, parseArgs, downloadNutrition, discoverNutritionUrls, robotsRules, retryAfter, USER_AGENT } = require('../src/scrapers/nutritionDownloader');
const { buildDataset } = require('../src/scrapers/buildWebDataset');

// Entirely synthetic food records model the public table structure. Values and
// identifiers are test-only, not published HDH nutrition. No real HTTP is used.
const FRUIT = `<h1>Fixture Food A</h1><p>Serving Size 4.0 oz</p>
<table summary="Amount per serving"><tr><th>Calories</th><td>144</td></tr><tr><th>Calories from Fat</th><td>2</td></tr></table>
<table summary="Nutrition Values per serving size"><tr><th>Amount/Serving</th><th>%DV*</th></tr>
<tr><td>Total Fat 0.2 g</td><td>0%</td><td>Tot. Carb. 11.2 g</td><td>4%</td></tr>
<tr><td>Sat. Fat 0.0 g</td><td>0%</td><td>Dietary Fiber 1.2 g</td><td>4%</td></tr>
<tr><td>Trans Fat 0.0 g</td><td></td><td>Sugars 9.1 g</td><td>18%</td></tr>
<tr><td>Cholesterol 0.0 mg</td><td>0%</td><td>Protein 1.3 g</td><td>1%</td></tr><tr><td>Sodium 7.8 mg</td><td>0%</td></tr></table>
<h2>Ingredients</h2><p>Fruit mix (melon, berries), Sauce (water, flavor (mint, lime)).</p>
<p>For specific nutritional information, contact the nutrition team.</p>
<h2>Allergens</h2><div><img alt="Vegan"><p>Vegan</p><img title="Sustainability"><p>Sustainably Sourced</p></div><h3>Disclaimer</h3>`;
const EGG = `<h1>Fixture Food B</h1><p>Serving Size 1.9 oz</p><table summary="Amount per serving"><tr><th>Calories</th><td>178</td></tr><tr><th>Calories from Fat</th><td>47</td></tr></table>
<table summary="Nutrition Values per serving size"><tr><td>Total Fat 5.3 g</td><td>7%</td><td>Tot. Carb. 0.4 g</td><td>0%</td></tr><tr><td>Sat. Fat 1.7 g</td><td>8%</td><td>Dietary Fiber 0.0 g</td><td>0%</td></tr><tr><td>Trans Fat 0.0 g</td><td>0%</td><td>Sugars 0.2 g</td><td>0%</td></tr><tr><td>Cholesterol 199.8 mg</td><td>67%</td><td>Protein 6.3 g</td><td>14%</td></tr><tr><td>Sodium 76.3 mg</td><td>3%</td></tr></table><h2>Ingredients</h2><p>Egg, oil.</p><h2>Allergens</h2><p>Vegetarian</p><p>Contains Eggs</p><h3>Disclaimer</h3>`;
const URL1 = ORIGIN + NUTRITION_PATH + '?id=900000001&recId=fixture-a';
const URL2 = ORIGIN + NUTRITION_PATH + '?id=900000002&recId=fixture-b';
function temp(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdh-nutrition-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }
function menuHtml(items = [{ url: URL1, name: 'Fruit', calories: 144, category: 'Salads' }]) {
  return '<h1>Pines</h1><h2 class="datenow">Monday, November 16 2026</h2><p id="station-hours">7:00 AM - 11:00 PM</p><div id="Lunch" class="meal-category">' + items.map(i => `<div class="menu-category-section"><header class="accordion-header"><h3>Grill</h3></header><div class="panel-heading"><a class="sublocs">${i.category || 'Salads'}</a></div><div class="station-list"><div class="d-none d-lg-block"><div class="menU-item-row"><a class="sublocsitem" href="${i.url.replace(/&/g, '&amp;')}">${i.name}</a><div class="proI">Original description</div><span class="item-price">$5.25</span><span class="cals">${i.calories} Cals</span></div></div></div></div>`).join('') + '</div>';
}
function input(t, items) { const dir = temp(t); fs.mkdirSync(path.join(dir, 'raw')); fs.writeFileSync(path.join(dir, 'raw/pines-day0.html'), menuHtml(items)); return dir; }
function permission(dir) {
  fs.mkdirSync(path.join(dir, 'nutrition-cache'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'nutrition-cache/access.json'), JSON.stringify({ bulk_download_allowed: true, origin: ORIGIN, path: NUTRITION_PATH, permission_reference: 'Test fixture permission; not a real site grant', reviewed_at: '2026-11-16T00:00:00Z' }));
}
function cache(dir, url = URL1, html = FRUIT) {
  const base = path.join(dir, 'nutrition-cache', cacheKey(url)); fs.mkdirSync(path.dirname(base), { recursive: true });
  fs.writeFileSync(base + '.html', html); fs.writeFileSync(base + '.json', JSON.stringify({ url: nutritionUrl(url), retrieved_at: '2026-11-16T01:00:00Z', sha256: hashHtml(html) }));
}
function response(text = FRUIT, status = 200, headers = {}) { return new Response(text, { status, headers: { 'content-type': 'text/html', ...headers } }); }
function mockService(handler, calls = []) {
  return async (url, options) => {
    calls.push(url); assert.equal(options.redirect, 'manual'); assert.equal(options.headers['User-Agent'], USER_AGENT);
    if (url === ORIGIN + '/robots.txt') return response('User-agent: *\nAllow: /');
    if (url.includes('terms-of-use')) return response('<h1>Website Terms of Use</h1>');
    nutritionUrl(url); return handler(url, options);
  };
}
const noWait = async () => {};

for (const [name, html, expected] of [
  ['fruit', FRUIT, { calorie:144, fat_cal:2, protein:1.3, carb:11.2, fat:0.2, sat_fat:0, trans_fat:0, cholesterol:0, sodium:7.8, fiber:1.2, sugar:9.1 }],
  ['egg', EGG, { calorie:178, fat_cal:47, protein:6.3, carb:0.4, fat:5.3, sat_fat:1.7, trans_fat:0, cholesterol:199.8, sodium:76.3, fiber:0, sugar:0.2 }]
]) test(`parses every nutrient from ${name} labels without using daily-value percentages`, () => {
  const parsed = parseNutrition(html);
  assert.equal(parsed.recognized, true);
  for (const [field, value] of Object.entries(expected)) assert.equal(parsed.nutrients[field].value, value, field);
  assert.equal(parsed.nutrients.sodium.unit, 'mg');
  assert.equal(parsed.nutrients.protein.unit, 'g');
  assert.ok(parsed.serving_size.value > 0);
});
test('ingredients retain nested comma boundaries; allergen and dietary labels remain source-supported', () => {
  const parsed = parseNutrition(FRUIT);
  assert.deepEqual(parsed.ingredients, ['Fruit mix (melon, berries), Sauce (water, flavor (mint, lime)).']);
  assert.equal(parsed.ingredients_text, parsed.ingredients[0]);
  assert.deepEqual(parsed.tags, ['sustainability', 'vegan']);
  assert.deepEqual(parseNutrition(EGG).tags, ['eggs', 'vegetarian']);
  assert.equal(parsed.tags.includes('dairy'), false);
});
test('handles capitalization, abbreviations, nested/repeated tables and split label/value cells', () => {
  const html = '<table><tr><td><table><tr><th>PROTEIN</th><td>12.5 G</td><td>99%</td></tr><tr><th>Total Carbohydrate</th><td>2 g</td></tr></table></td></tr></table><table><tr><td>Protein 12.5 g</td><td>18%</td></tr></table>';
  const parsed = parseNutrition(html);
  assert.equal(parsed.nutrients.protein.value, 12.5);
  assert.equal(parsed.nutrients.carb.value, 2);
  assert.deepEqual(parsed.issues, []);
});
test('conflicting repeated labels and qualified values are preserved but not silently converted', () => {
  const parsed = parseNutrition('<table><tr><td>Protein 1 g</td></tr><tr><td>Protein 2 g</td></tr><tr><td>Total Fat &lt;0.5 g</td></tr></table>');
  assert.equal(parsed.nutrients.protein, undefined);
  assert.equal(parsed.observations.protein.length, 2);
  assert.equal(parsed.field_status.protein, 'conflicting_labels');
  assert.equal(convertQuantity('fat', parsed.nutrients.fat), null);
});
test('missing, empty and unrecognized source fields stay distinct', () => {
  const parsed = parseNutrition('<table summary="Amount per serving"><tr><th>Calories</th><td></td></tr><tr><td>Protein unknown text</td></tr></table>');
  assert.equal(parsed.field_status.calorie, 'source_empty');
  assert.equal(parsed.field_status.protein, 'parser_unrecognized');
  assert.equal(parsed.field_status.sodium, 'source_not_published');
  assert.deepEqual(parsed.nutrients, {});
  assert.equal(parseNutrition('<h1>Access denied</h1>').recognized, false);
});
for (const [field, value, unit, expected] of [
  ['calorie',875,'kcal',8750], ['fat_cal',47,'kcal',470],
  ['protein',25,'g',25000], ['carb',11.2,'g',11200], ['fat',12.5,'g',12500],
  ['sat_fat',1.7,'g',1700], ['trans_fat',0.1,'g',100], ['fiber',1.2,'g',1200], ['sugar',9.1,'g',9100],
  ['sodium',7.8,'mg',8], ['cholesterol',199.8,'mg',200], ['protein',25,'mg',25],
  ['serving_size',8.5,'oz',85], ['serving_size',28.349523125,'g',10], ['serving_size',1,'lb',160],
  ['sodium',1,'g',1000], ['protein',1000,'mcg',1], ['calorie',418.4,'kJ',1000]
]) test(`converts ${field} ${value} ${unit} to schema integer ${expected}`, () => assert.equal(convertQuantity(field, { value, unit }), expected));
test('never converts missing/negative/unknown units or fluid measures to guessed zeros', () => {
  for (const q of [null, { value: -1, unit: 'g' }, { value: 1, unit: null }, { value: 1, unit: 'cups' }, { value: Infinity, unit: 'g' }]) assert.equal(convertQuantity('protein', q), null);
  assert.equal(convertQuantity('serving_size', { value: 1, unit: 'fl oz' }), null);
  assert.deepEqual(convertNutrition({ calories: null }).nutrition, { macros: {} });
});
test('canonical URLs preserve empty/absent/non-numeric recipe parameters and reject unsafe formats', () => {
  assert.notEqual(cacheKey(ORIGIN + NUTRITION_PATH + '?id=1'), cacheKey(ORIGIN + NUTRITION_PATH + '?id=1&recId='));
  assert.equal(nutritionUrl(ORIGIN + NUTRITION_PATH + '?recId=640332%20%2F%20061244&id=1'), ORIGIN + NUTRITION_PATH + '?id=1&recId=640332+%2F+061244');
  for (const value of ['http://hdh-web.ucsd.edu' + NUTRITION_PATH + '?id=1', 'https://evil.test' + NUTRITION_PATH + '?id=1', ORIGIN + '/other?id=1', ORIGIN + NUTRITION_PATH + '?id=1&id=2', ORIGIN + NUTRITION_PATH + '?id=1&other=2', ORIGIN + NUTRITION_PATH + '?id=1#x', 'https://x@hdh-web.ucsd.edu' + NUTRITION_PATH + '?id=1', ORIGIN + NUTRITION_PATH + '?id=bad']) assert.throws(() => nutritionUrl(value));
});
test('discovery deduplicates source links without conflating distinct recipe IDs', t => {
  const dir = input(t, [{ url:URL1,name:'First',calories:144 }, { url:URL1,name:'Second',calories:144 }, { url:URL2,name:'Third',calories:178 }]);
  const { dataset } = buildDataset(dir, { write:false, enrich:false });
  assert.equal(discoverNutritionUrls(dataset).pages.length, 2);
});
test('no authorization means no requests; access blocker is explicit and all URLs remain unattempted', async t => {
  const dir = input(t);
  const state = await downloadNutrition(dir, { fetchImpl: () => { throw new Error('No network allowed'); } });
  assert.equal(state.access.status, 'permission_required');
  assert.equal(state.summary.not_attempted, 1);
  assert.equal(state.summary.downloaded, 0);
});
test('authorized mocked download caches each page once and reruns need no requests', async t => {
  const dir = input(t); permission(dir); const calls = [];
  const state = await downloadNutrition(dir, { sleep:noWait, fetchImpl:mockService(() => response(), calls) });
  assert.equal(state.summary.downloaded, 1);
  assert.equal(calls.filter(u => u === nutritionUrl(URL1)).length, 1);
  assert.ok(readCachedNutrition(dir, URL1).data.recognized);
  const again = await downloadNutrition(dir, { fetchImpl: () => { throw new Error('Cache must avoid requests'); } });
  assert.equal(again.summary.already_cached, 1);
});
test('interrupted collection resumes from completed caches without re-requesting them', async t => {
  const dir = input(t, [{ url:URL1,name:'Fruit',calories:144 }, { url:URL2,name:'Egg',calories:178 }]); permission(dir);
  let waits = 0;
  await assert.rejects(downloadNutrition(dir, { sleep:async () => { if (++waits === 3) throw new Error('interrupted'); }, fetchImpl:mockService(u => response(u === nutritionUrl(URL1) ? FRUIT : EGG)) }), /interrupted/);
  assert.ok(readCachedNutrition(dir, URL1));
  const calls = [];
  const again = await downloadNutrition(dir, { sleep:noWait, fetchImpl:mockService(() => response(EGG), calls) });
  assert.equal(again.summary.already_cached, 1);
  assert.equal(again.summary.downloaded, 1);
  assert.equal(calls.includes(nutritionUrl(URL1)), false);
});
for (const [status, expected] of [[403,'blocked'],[404,'not_found'],[500,'failed']]) test(`HTTP ${status} has bounded handling and records ${expected}`, async t => {
  const dir = input(t); permission(dir); let count = 0;
  const state = await downloadNutrition(dir, { sleep:noWait, fetchImpl:mockService(() => { count++; return response('',status); }) });
  assert.equal(state.pages[nutritionUrl(URL1)].status, expected);
  assert.equal(count, status === 500 ? 3 : 1);
});
test('HTTP 429 respects Retry-After, stops after repeated limits and persists a resume time', async t => {
  const dir = input(t); permission(dir); const waits = []; let count = 0;
  const state = await downloadNutrition(dir, { sleep:async n => waits.push(n), fetchImpl:mockService(() => { count++; return response('',429,{'retry-after':'5'}); }) });
  assert.equal(count, 2);
  assert.ok(waits.includes(5000));
  assert.equal(state.pages[nutritionUrl(URL1)].status, 'rate_limited');
  assert.ok(state.access.pause_reason);
  assert.ok(Date.parse(state.pages[nutritionUrl(URL1)].next_attempt_at) > Date.now());
  assert.equal(retryAfter('5'), 5000);
  assert.equal(retryAfter(new Date(10000).toUTCString(), 0), 10000);
});
test('long Retry-After pauses instead of making another request early', async t => {
  const dir = input(t); permission(dir); let count = 0;
  const options = { sleep:noWait, fetchImpl:mockService(() => { count++; return response('',429,{'retry-after':'120'}); }) };
  await downloadNutrition(dir, options);
  const paused = await downloadNutrition(dir, { fetchImpl: () => { throw new Error('Retry-After forbids every request'); } });
  assert.equal(paused.access.status, 'paused_retry_after');
  assert.equal(count, 1);
});
test('temporary errors retry and succeed; timeouts retry only a limited number of times', async t => {
  const dir = input(t); permission(dir); let count = 0;
  const state = await downloadNutrition(dir, { sleep:noWait, fetchImpl:mockService(() => ++count === 1 ? response('',500) : response()) });
  assert.equal(count, 2); assert.equal(state.summary.downloaded, 1);
  const timed = input(t); permission(timed); let hangs = 0;
  const failed = await downloadNutrition(timed, { sleep:noWait, timeoutMs:5, fetchImpl:mockService(() => { hangs++; return new Promise(() => {}); }) });
  assert.equal(hangs, 3); assert.match(failed.pages[nutritionUrl(URL1)].error, /timed out/);
});
test('redirects, captcha/error pages and non-HTML responses are rejected without following targets', async t => {
  for (const res of [response('',302,{location:'https://evil.test'}),response('<h1>CAPTCHA</h1>'),response(FRUIT,200,{'content-type':'application/json'})]) {
    const dir = input(t); permission(dir); const calls = [];
    const state = await downloadNutrition(dir, { sleep:noWait, fetchImpl:mockService(() => res, calls) });
    assert.equal(calls.some(u => u.includes('evil.test')), false);
    assert.equal(readCachedNutrition(dir, URL1), null);
    assert.ok(['blocked_redirect','blocked','invalid_response'].includes(state.pages[nutritionUrl(URL1)].status));
  }
});
test('robots rules take precedence, respect specificity/allow/crawl-delay and reject unclear policy', async t => {
  assert.equal(robotsRules('User-agent: *\nDisallow: /dining/', URL1).allowed, false);
  assert.equal(robotsRules('User-agent: *\nDisallow: /\nAllow: /dining/', URL1).allowed, true);
  assert.equal(robotsRules('User-agent: *\nCrawl-delay: 5', URL1).delayMs, 5000);
  assert.equal(robotsRules('User-agent: *\nDisallow: /\nUser-agent: UCSD-HDH-StudentDataset\nAllow: /', URL1).allowed, true);
  assert.throws(() => robotsRules('<html>blocked</html>', URL1));
  const dir = input(t); permission(dir);
  const state = await downloadNutrition(dir, { sleep:noWait, fetchImpl: async url => { assert.equal(url,ORIGIN+'/robots.txt'); return response('User-agent: *\nDisallow: /'); } });
  assert.equal(state.access.status, 'blocked_policy'); assert.equal(state.summary.downloaded, 0);
});
test('cache hashes and metadata prevent corrupted or mismatched HTML being used', t => {
  const dir = input(t); cache(dir);
  assert.ok(readCachedNutrition(dir, URL1).data.recognized);
  fs.appendFileSync(path.join(dir,'nutrition-cache',cacheKey(URL1)+'.html'),'changed');
  assert.match(readCachedNutrition(dir, URL1).error, /hash mismatch/);
});
test('offline enrichment preserves every menu field, includes raw units/timestamps and conforms to the schema', t => {
  const dir = input(t); cache(dir);
  const raw = buildDataset(dir, {write:false,enrich:false});
  const enriched = buildDataset(dir);
  const stripped = structuredClone(enriched.dataset);
  for (const l of stripped.locations) for (const m of l.menus) for (const s of m.stations) for (const i of s.items) delete i.nutrition;
  delete stripped.generated_at; delete raw.dataset.generated_at;
  assert.deepEqual(stripped, raw.dataset);
  const item = enriched.dataset.locations[0].menus[0].stations[0].items[0];
  assert.equal(item.nutrition.data.nutrients.protein.value,1.3);
  assert.equal(item.nutrition.data.nutrients.protein.unit,'g');
  assert.equal(item.nutrition.retrieved_at,'2026-11-16T01:00:00Z');
  assert.deepEqual(validateDatabase(enriched.database), []);
  const food = enriched.database.snapshots['2026-11-16'].Foods[0];
  assert.equal(food.nutrition.macros.protein,1300);
  assert.equal(food.nutrition.calorie,1440);
  assert.equal(food.nutrition.serving_size,40);
  assert.deepEqual(food.allergens,{});assert.equal(food.vegan,true);assert.equal(food.vegetarian,true);
  assert.equal(food.personal,false);assert.equal(food.beverage,false);assert.equal(food.wellness,null);
  assert.equal(enriched.coverage.summary.foods_with_complete_macros,1);
});
test('calorie conflicts preserve both sources and exclude all conflicting nutrients/ingredients from export', t => {
  const dir = input(t,[{url:URL1,name:'Fruit',calories:100,category:'Salads'}]); cache(dir);
  const result = buildDataset(dir);
  const item = result.dataset.locations[0].menus[0].stations[0].items[0];
  assert.equal(item.calories,100);assert.equal(item.nutrition.data.nutrients.calorie.value,144);
  assert.equal(item.nutrition.verification_status,'calorie_conflict');
  const food = result.database.snapshots['2026-11-16'].Foods[0];
  assert.deepEqual(food.nutrition,{macros:{},calorie:1000});assert.deepEqual(food.ingredients,[]);
  assert.equal(result.coverage.conflicts[0].snapshot_calories,144);
  assert.equal(result.coverage.conflicts[0].menu_date,'2026-11-16');
  assert.equal(result.coverage.summary.foods_with_usable_macros,0);
});
test('ambiguous beverages default to false, retain source data and remain exportable with separate review provenance', t => {
  const dir = input(t,[{url:URL1,name:'Daily Special',calories:144,category:'Menu Items'}]);
  const result = buildDataset(dir);
  assert.equal(result.dataset.summary.food_entries,1);
  assert.equal(result.database.withheld.length,0);
  const snap=result.database.snapshots['2026-11-16'];
  assert.equal(snap.Foods.length,1);assert.equal(snap.Foods[0].beverage,false);
  assert.equal('beverage_classification' in snap.Foods[0],false);
  const classification=snap.provenance[0].beverage_classification;
  assert.deepEqual(classification,{value:false,source:'default',rule:'insufficient_evidence',review_required:true});
  assert.deepEqual(result.coverage.beverage_classification.summary,{total:1,true:0,false:1,explicit_category:0,high_confidence_inference:0,default:1,manual_review:1});
  assert.equal(result.coverage.beverage_classification.review[0].source_url,URL1);
  assert.deepEqual(result.coverage.beverage_classification.review[0].classification,classification);
  assert.deepEqual(validateDatabase(result.database),[]);
});

for (const name of [
  'Water', 'Bottled Water', 'Sparkling Water', 'Fountain Soda', 'Diet Coke',
  'Coffee', 'Iced Espresso', 'Cappuccino', 'Vanilla Latte', 'Cold Brew',
  'Black Tea', 'Oat Milk Tea', 'Taro Boba', 'Mango Smoothie', 'Vanilla Milkshake',
  'Chocolate Ice Cream Shake', 'Orange Juice', 'Lemonade', 'Sports Drink',
  'Energy Drink', 'Gatorade', 'Red Bull', 'Hot Chocolate', 'Horchata',
  'Drinkable Yogurt', 'Rice Milk', 'Almond Milk'
]) test(`classifies the standalone drink ${name} from its name`, () => {
  const classification=classifyBeverage({name,category:'Menu Items'});
  assert.equal(classification.value,true);
  assert.equal(classification.source,'high_confidence_inference');
  assert.equal(classification.review_required,false);
});

for (const name of [
  'Turkey Sandwich', 'Tomato Soup', 'Miso Broth', 'Rice Bowl', 'Garden Salad',
  'Butter Croissant', 'Chocolate Cake', 'Vanilla Ice Cream', 'Coffee Cake',
  'Coffee and Cream Overnight Oats', 'Chicken with Orange Juice Sauce',
  'Milk Tea Pudding', 'Green Tea Ice Cream', 'Matcha Mochi', 'Tea Truffles',
  'Espresso Brownie', 'Orange Juice Sorbet', 'Water Chestnuts', 'Boba Pearls',
  'Cocoa Powder', 'Milkshake Cake', 'Soda Bread', 'Apple Whole', 'Candied Walnuts'
]) test(`keeps the solid food ${name} out of beverages`, () => {
  const classification=classifyBeverage({name,category:'Menu Items'});
  assert.equal(classification.value,false);
  assert.equal(classification.source,'high_confidence_inference');
  assert.equal(classification.review_required,false);
});

test('explicit categories precede keyword guesses and normalize whitespace/case', () => {
  assert.deepEqual(classifyBeverage({name:'House Special',category:'  BeVeRaGes  '}),
    {value:true,source:'explicit_category',rule:'beverage_category',review_required:false});
  assert.equal(classifyBeverage({name:'Tea',category:'Soups'},'Coffee Bar').value,false);
  assert.equal(classifyBeverage({name:'Condensed Milk',category:'Sauces'}).source,'explicit_category');
  assert.equal(classifyBeverage({name:'Boba Pearls',category:'Toppings'}).value,false);
  assert.equal(classifyBeverage({name:'Vanilla Ice Cream Shake',category:'Desserts'}).value,true);
  assert.equal(classifyBeverage({name:'Green Tea Ice Cream',category:'Desserts'}).value,false);
});

test('descriptions and dedicated drink stations provide context without treating ingredients as drinks', () => {
  assert.equal(classifyBeverage({name:'House Special',description:'An iced tea served over ice'}).rule,'drink_description');
  assert.equal(classifyBeverage({name:'House Special',description:'Fresh orange juice'}).value,true);
  assert.equal(classifyBeverage({name:'House Special'},'Juice Bar').rule,'beverage_station');
  assert.equal(classifyBeverage({name:'House Special',description:'Chicken with orange juice sauce'},'Juice Bar').value,false);
  assert.equal(classifyBeverage({name:'House Special',description:'Tea-flavored cake'}).value,false);
  assert.equal(classifyBeverage({name:'House Special'},'Cafe').source,'default');
});

test('missing evidence and conflicting beverage categories default to false and request review', () => {
  for(const item of [{},{name:'Daily Special',category:'Sides'},{name:'Coffee Cake',category:'Beverages'}]){
    const classification=classifyBeverage(item);
    assert.equal(classification.value,false);assert.equal(classification.source,'default');
    assert.equal(classification.review_required,true);assert.ok(classification.rule);
  }
});

test('missing location hours remain a separate export blocker even with a Boolean beverage value', t => {
  const dir=input(t);const menu=buildDataset(dir,{write:false}).dataset.locations[0].menus[0];
  menu.hours=null;
  const database=transformMenus([menu]);
  assert.equal(database.records_valid_for_export,0);
  assert.equal(database.withheld.length,1);
  assert.equal(database.withheld[0].reason,'Required location hours are unknown');
  assert.equal(database.beverage_classification.summary.false,1);
});
test('IDs remain stable, dated snapshots stay separate and invalid references/units are detected', t => {
  const dir = input(t); cache(dir);const a=buildDataset(dir),b=buildDataset(dir);
  assert.deepEqual(a.database,b.database);
  const broken=structuredClone(a.database);broken.snapshots['2026-11-16'].Menu_Items[0].food_id={$oid:'0'.repeat(24)};
  assert.ok(validateDatabase(broken).some(e=>e.includes('food reference')));
  const invalid=structuredClone(a.database);invalid.snapshots['2026-11-16'].Foods[0].nutrition.macros.protein=1.5;
  assert.ok(validateDatabase(invalid).some(e=>e.includes('macros')));
  const menu=a.dataset.locations[0].menus[0];const later=structuredClone(menu);later.menu_date='2026-11-17';
  assert.equal(Object.keys(transformMenus([menu,later]).snapshots).length,2);
});

test('leading decimal quantities are parsed and preserve explicit zero separately from unknown', () => {
  const p=parseNutrition('<table><tr><td>Protein .5 g</td><td>1%</td></tr><tr><td>Total Fat 0 g</td><td>0%</td></tr></table>');
  assert.equal(p.nutrients.protein.value,0.5);assert.equal(p.nutrients.fat.value,0);
  assert.equal(p.nutrients.sodium,undefined);
});
test('oversized responses are bounded and never cached', async t => {
  const {request}=require('../src/scrapers/nutritionDownloader');
  await assert.rejects(request(URL1,{maxBytes:5,fetchImpl:async()=>response('too much content')}),/size limit/);
});
test('coverage distinguishes unrecognized parser pages, blocked downloads and missing source fields', t => {
  const dir=input(t);cache(dir,URL1,'<h1>Unknown new layout</h1>');
  const a=buildDataset(dir);
  assert.equal(a.coverage.collection_status_counts.parser_unrecognized,1);
  fs.unlinkSync(path.join(dir,'nutrition-cache',cacheKey(URL1)+'.html'));
  fs.unlinkSync(path.join(dir,'nutrition-cache',cacheKey(URL1)+'.json'));
  fs.writeFileSync(path.join(dir,'nutrition-cache/download-state.json'),JSON.stringify({pages:{[nutritionUrl(URL1)]:{status:'blocked',error:'HTTP 403'}},access:{status:'authorized'}}));
  assert.equal(buildDataset(dir).coverage.collection_status_counts.blocked,1);
  cache(dir,URL1,'<table summary="Amount per serving"><tr><th>Calories</th><td>144</td></tr></table>');
  const c=buildDataset(dir);
  assert.equal(c.coverage.summary.foods_with_partial_nutrition,1);
  assert.equal(c.coverage.foods[0].source_field_status.protein,'source_not_published');
});

test('contradictory explicit diet labels remain unknown rather than asserting a positive flag', () => {
  const parsed=parseNutrition('<table><tr><td>Calories 10</td></tr></table><h2>Allergens</h2><p>Vegan</p><p>Not vegan</p><h3>Disclaimer</h3>');
  assert.equal(parsed.flags.vegan,null);assert.equal(parsed.tags.includes('vegan'),false);
  assert.ok(parsed.issues.some(i=>i.includes('Conflicting dietary')));
});
test('internally contradictory snapshot calories quarantine detailed values too', t => {
  const dir=input(t);cache(dir,URL1,FRUIT.replace('</table>','<tr><th>Calories</th><td>100</td></tr></table>'));
  const result=buildDataset(dir);
  const item=result.dataset.locations[0].menus[0].stations[0].items[0];
  assert.equal(item.nutrition.verification_status,'snapshot_ambiguous');
  assert.deepEqual(result.database.snapshots['2026-11-16'].Foods[0].nutrition,{macros:{},calorie:1440});
});
test('robots 404 does not grant permission but works with a separately documented grant', async t => {
  const dir=input(t);permission(dir);
  const state=await downloadNutrition(dir,{sleep:noWait,fetchImpl:async url=>{
    if(url.endsWith('/robots.txt'))return response('',404);
    if(url.includes('terms-of-use'))return response('Website Terms of Use');
    return response();
  }});
  assert.equal(state.access.robots_status,404);assert.equal(state.summary.downloaded,1);
});
test('negative source nutrition is flagged and never exported as a negative number', t => {
  const dir=input(t);cache(dir,URL1,FRUIT.replace('Protein 1.3 g','Protein -1.3 g'));
  const result=buildDataset(dir);
  assert.ok(result.coverage.foods[0].parser_issues.some(i=>i.includes('Invalid nutrient quantity')));
  assert.equal(result.database.snapshots['2026-11-16'].Foods[0].nutrition.macros.protein,undefined);
  assert.deepEqual(validateDatabase(result.database),[]);
});

test('all published allergen labels map to exact schema names without inferred false values', t => {
  const dir=input(t);
  const labels=['Dairy','Eggs','Fish','Shellfish','TreeNuts','Peanuts','Soy','Wheat','Sesame','Gluten'];
  cache(dir,URL1,'<table><tr><th>Calories</th><td>144</td></tr></table><h2>Allergens</h2>'+labels.map(l=>`<p>Contains ${l}</p>`).join('')+'<p>Wellness</p><p>Sustainably Sourced</p><h3>Disclaimer</h3>');
  const result=buildDataset(dir);
  const food=result.database.snapshots['2026-11-16'].Foods[0];
  assert.deepEqual(food.allergens,Object.fromEntries(['dairy','eggs','fish','shell_fish','tree_nuts','peanuts','soy','wheat','sesame','gluten'].map(k=>[k,true])));
  assert.equal(food.wellness,true);assert.equal(food.sustainability,true);
  assert.equal(food.vegan,null);assert.equal(food.vegetarian,null);
});

test('a successfully cached unfamiliar layout is never downloaded again for parser reasons', async t => {
  const dir=input(t);permission(dir);
  const unfamiliar='<h1>Fruit</h1><section data-new-layout="true">New nutrition format</section>';
  const first=await downloadNutrition(dir,{sleep:noWait,fetchImpl:mockService(()=>response(unfamiliar))});
  assert.equal(first.summary.downloaded,1);
  const before=readCachedNutrition(dir,URL1);
  assert.equal(before.data.recognized,false);
  const next=await downloadNutrition(dir,{fetchImpl:()=>{throw new Error('Parser changes must not cause HTTP requests');}});
  assert.equal(next.summary.already_cached,1);
  assert.equal(next.summary.downloaded,0);
  assert.equal(readCachedNutrition(dir,URL1).html,before.html);
  const report=buildDataset(dir).coverage;
  assert.equal(report.summary.pages_cached,1);
  assert.equal(report.summary.pages_parser_unrecognized,1);
  assert.equal(report.summary.failed_downloads,0);
  assert.equal(report.foods[0].source_field_status.protein,'parser_unrecognized');
});
test('corrupt caches require explicit refresh and never trigger automatic replacement', async t => {
  const dir=input(t);cache(dir);
  const file=path.join(dir,'nutrition-cache',cacheKey(URL1)+'.html');
  fs.appendFileSync(file,'corruption');const original=fs.readFileSync(file,'utf8');
  const blocked=await downloadNutrition(dir,{fetchImpl:()=>{throw new Error('No implicit repair request');}});
  assert.equal(blocked.summary.invalid_cached,1);
  assert.equal(fs.readFileSync(file,'utf8'),original);
  permission(dir);
  const refreshed=await downloadNutrition(dir,{refreshUrls:[URL1],sleep:noWait,fetchImpl:mockService(()=>response())});
  assert.equal(refreshed.summary.downloaded,1);assert.equal(refreshed.summary.refreshed,1);
  assert.equal(readCachedNutrition(dir,URL1).html,FRUIT);
});
test('missing files for a previously completed download require explicit refresh too', async t => {
  const dir=input(t);permission(dir);
  fs.writeFileSync(path.join(dir,'nutrition-cache/download-state.json'),JSON.stringify({pages:{[nutritionUrl(URL1)]:{status:'downloaded',retrieved_at:'2026-11-16T00:00:00Z'}}}));
  const state=await downloadNutrition(dir,{fetchImpl:()=>{throw new Error('Do not re-download a known completed page silently');}});
  assert.equal(state.pages[nutritionUrl(URL1)].status,'invalid_cache');assert.equal(state.summary.downloaded,0);
});
test('explicit refresh-all replaces a cached response only after access checks', async t => {
  const dir=input(t);cache(dir);
  const blocked=await downloadNutrition(dir,{refresh:true,fetchImpl:()=>{throw new Error('Refresh also requires permission');}});
  assert.equal(blocked.access.status,'permission_required');assert.equal(readCachedNutrition(dir,URL1).html,FRUIT);
  permission(dir);let requests=0;
  const changed=FRUIT.replace('Protein 1.3 g','Protein 1.7 g');
  const state=await downloadNutrition(dir,{refresh:true,sleep:noWait,fetchImpl:mockService(()=>{requests++;return response(changed);})});
  assert.equal(requests,1);assert.equal(state.summary.refreshed,1);
  assert.equal(readCachedNutrition(dir,URL1).data.nutrients.protein.value,1.7);
});
test('selective refresh leaves other cached URLs and their metadata untouched', async t => {
  const dir=input(t,[{url:URL1,name:'Fruit',calories:144},{url:URL2,name:'Egg',calories:178}]);
  cache(dir);cache(dir,URL2,EGG);permission(dir);
  const before=fs.readFileSync(path.join(dir,'nutrition-cache',cacheKey(URL1)+'.json'),'utf8');
  const calls=[];
  const state=await downloadNutrition(dir,{refreshUrls:[URL2],sleep:noWait,fetchImpl:mockService(()=>response(EGG.replace('Protein 6.3 g','Protein 7.7 g')),calls)});
  assert.equal(state.summary.already_cached,1);assert.equal(state.summary.refreshed,1);
  assert.equal(calls.includes(nutritionUrl(URL1)),false);
  assert.equal(fs.readFileSync(path.join(dir,'nutrition-cache',cacheKey(URL1)+'.json'),'utf8'),before);
});
test('only newly discovered URLs are downloaded when other pages already exist', async t => {
  const dir=input(t,[{url:URL1,name:'Fruit',calories:144},{url:URL2,name:'Egg',calories:178}]);
  cache(dir);permission(dir);const calls=[];
  const state=await downloadNutrition(dir,{sleep:noWait,fetchImpl:mockService(()=>response(EGG),calls)});
  assert.equal(state.summary.downloaded,1);assert.equal(state.summary.already_cached,1);
  assert.equal(calls.filter(u=>u===nutritionUrl(URL2)).length,1);
  assert.equal(calls.includes(nutritionUrl(URL1)),false);
});
test('CLI refresh options are explicit and cannot expand collection beyond discovered links', async t => {
  assert.deepEqual(parseArgs([]),{refresh:false,refreshUrls:[]});
  assert.equal(parseArgs(['--refresh']).refresh,true);
  assert.deepEqual(parseArgs(['--refresh-url',URL1]).refreshUrls,[nutritionUrl(URL1)]);
  assert.throws(()=>parseArgs(['--refresh-url']));assert.throws(()=>parseArgs(['--unknown']));
  assert.throws(()=>parseArgs(['--refresh','--refresh-url',URL1]));
  const dir=input(t);
  await assert.rejects(downloadNutrition(dir,{refreshUrls:[URL2],fetchImpl:()=>{throw new Error('No guessed URLs');}}),/not discovered/);
});
test('failed explicit refresh preserves the previously successful cache', async t => {
  const dir=input(t);cache(dir);permission(dir);
  const first=readCachedNutrition(dir,URL1);
  await downloadNutrition(dir,{refresh:true,sleep:noWait,fetchImpl:mockService(()=>response('',403))});
  assert.equal(readCachedNutrition(dir,URL1).html,first.html);
  assert.deepEqual(readCachedNutrition(dir,URL1).metadata,first.metadata);
  const second=await downloadNutrition(dir,{fetchImpl:()=>{throw new Error('Old successful cache must still be reused');}});
  assert.equal(second.summary.already_cached,1);
});
for(const stopAt of ['.html','.json']) test(`interruption at cache ${stopAt} promotion recovers without re-downloading`,async t=>{
  const dir=input(t);cache(dir);
  const changed=FRUIT.replace('Protein 1.3 g','Protein 2.7 g');
  const originalRename=fs.renameSync;
  const target=path.join(dir,'nutrition-cache',cacheKey(URL1)+stopAt);
  fs.renameSync=(from,to)=>{if(to===target)throw new Error('Simulated process interruption');return originalRename(from,to);};
  try {assert.throws(()=>writeNutritionCache(dir,URL1,changed),/interruption/);}
  finally {fs.renameSync=originalRename;}
  assert.equal(readCachedNutrition(dir,URL1).html,changed);
  assert.equal(fs.existsSync(path.join(dir,'nutrition-cache',cacheKey(URL1)+'.json.tmp')),false);
  const next=await downloadNutrition(dir,{fetchImpl:()=>{throw new Error('Recovered pages must not be requested');}});
  assert.equal(next.summary.already_cached,1);
});
test('incomplete temporary writes do not corrupt a committed cache',async t=>{
  const dir=input(t);cache(dir);
  fs.writeFileSync(path.join(dir,'nutrition-cache',cacheKey(URL1)+'.html.tmp'),'partial data');
  assert.equal(readCachedNutrition(dir,URL1).html,FRUIT);
  const next=await downloadNutrition(dir,{fetchImpl:()=>{throw new Error('Successful main cache is unchanged');}});
  assert.equal(next.summary.already_cached,1);
});
test('collection remains sequential when more than one page is missing',async t=>{
  const dir=input(t,[{url:URL1,name:'Fruit',calories:144},{url:URL2,name:'Egg',calories:178}]);permission(dir);
  let active=0,maxActive=0;
  const state=await downloadNutrition(dir,{sleep:noWait,fetchImpl:mockService(async url=>{
    active++;maxActive=Math.max(maxActive,active);
    await new Promise(resolve=>setTimeout(resolve,2));active--;
    return response(url===nutritionUrl(URL1)?FRUIT:EGG);
  })});
  assert.equal(maxActive,1);assert.equal(state.summary.downloaded,2);
});
test('same-named foods with the same item ID but different recipes receive their own nutrition',t=>{
  const first=ORIGIN+NUTRITION_PATH+'?id=139&recId=first';
  const second=ORIGIN+NUTRITION_PATH+'?id=139&recId=second';
  const dir=input(t,[{url:first,name:'Same name',calories:144},{url:second,name:'Same name',calories:178}]);
  cache(dir,first,FRUIT);cache(dir,second,EGG);
  const items=buildDataset(dir).dataset.locations[0].menus[0].stations[0].items;
  assert.equal(items.length,2);
  assert.equal(items.find(i=>i.nutrition_url===first).nutrition.data.nutrients.protein.value,1.3);
  assert.equal(items.find(i=>i.nutrition_url===second).nutrition.data.nutrients.protein.value,6.3);
});
test('coverage counts each macro and sodium separately, including published zero values',t=>{
  const dir=input(t,[{url:URL1,name:'Fruit',calories:144},{url:URL2,name:'Partial',calories:178}]);
  cache(dir);cache(dir,URL2,'<table><tr><td>Calories 178</td></tr><tr><td>Protein 1 g</td></tr><tr><td>Sodium 0 mg</td></tr></table>');
  const summary=buildDataset(dir).coverage.summary;
  assert.equal(summary.foods_with_protein,2);assert.equal(summary.foods_with_carbohydrates,1);
  assert.equal(summary.foods_with_fat,1);assert.equal(summary.foods_with_sodium,2);
  assert.equal(summary.foods_with_complete_macros,1);assert.equal(summary.foods_with_partial_nutrition,1);
  assert.equal(summary.foods_with_no_detailed_nutrition,0);
});

test('schema validation rejects arrays instead of objects, missing required fields and unknown nutrient keys',t=>{
  const dir=input(t);cache(dir);const database=buildDataset(dir).database;
  const mutations=[
    d=>{d.Foods[0].allergens=[];},d=>{d.Foods[0].nutrition.macros=[];},
    d=>{d.Locations[0].location.geodata=[];},d=>{delete d.Foods[0].nutrition.macros;},
    d=>{d.Foods[0].nutrition.protein=10;},d=>{d.Foods[0].name=123;},d=>{d.Locations[0].stations={};},
    d=>{d.Menu_Items[0].price=-1;},d=>{d.Foods[0].version=0;}
  ];
  for(const mutate of mutations){const copy=structuredClone(database);mutate(copy.snapshots['2026-11-16']);assert.ok(validateDatabase(copy).length>0);}
});

test('menu dollars become integer cents once and exports retain cents unchanged',t=>{
  const dir=input(t);
  const file=path.join(dir,'raw/pines-day0.html');
  fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('$5.25','$8.50'));
  const result=buildDataset(dir);
  assert.equal(result.dataset.locations[0].menus[0].stations[0].items[0].price_cents,850);
  assert.equal(result.database.snapshots['2026-11-16'].Menu_Items[0].price,850);
});

test('empty formatting paragraphs do not hide the complete ingredient statement',()=>{
  const p=parseNutrition('<h2>Ingredients</h2><p> </p><p>Rice (water, rice), sauce (soy, spices).</p><p></p><p>Contact the nutrition team.</p><h2>Allergens</h2>');
  assert.deepEqual(p.ingredients,['Rice (water, rice), sauce (soy, spices).']);
});

test('recorded approval can require slower requests and a strict stop on the first technical issue',async t=>{
  const dir=input(t,[{url:URL1,name:'Fruit',calories:144},{url:URL2,name:'Egg',calories:178}]);permission(dir);
  const file=path.join(dir,'nutrition-cache/access.json');const grant=JSON.parse(fs.readFileSync(file));
  Object.assign(grant,{minimum_delay_ms:3500,stop_on_technical_issues:true});fs.writeFileSync(file,JSON.stringify(grant));
  const waits=[],calls=[];
  const state=await downloadNutrition(dir,{sleep:async n=>waits.push(n),fetchImpl:mockService(()=>response('',500),calls)});
  assert.equal(calls.filter(u=>u===nutritionUrl(URL1)).length,1);
  assert.equal(calls.includes(nutritionUrl(URL2)),false);
  assert.ok(waits.every(n=>n>=3500));assert.ok(state.access.pause_reason);
});
test('a one-time approval cannot be reused for a changed URL set or an unapproved refresh',async t=>{
  const dir=input(t);permission(dir);
  const file=path.join(dir,'nutrition-cache/access.json');const grant=JSON.parse(fs.readFileSync(file));
  Object.assign(grant,{one_time_collection:true,approved_url_set_sha256:hashHtml('different scope'),allow_refresh:false});fs.writeFileSync(file,JSON.stringify(grant));
  const noRequests=()=>{throw new Error('Scope restrictions must be checked before any request');};
  assert.equal((await downloadNutrition(dir,{fetchImpl:noRequests})).access.status,'blocked_permission_scope');
  grant.approved_url_set_sha256=hashHtml(nutritionUrl(URL1));fs.writeFileSync(file,JSON.stringify(grant));cache(dir);
  assert.equal((await downloadNutrition(dir,{refresh:true,fetchImpl:noRequests})).access.status,'blocked_permission_scope');
  assert.equal((await downloadNutrition(dir,{fetchImpl:noRequests})).summary.already_cached,1);
});
