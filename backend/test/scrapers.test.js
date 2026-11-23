const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cheerio = require('cheerio');
const { buildDataset, LOCATIONS } = require('../src/scrapers/buildWebDataset');
const { parseMenuHtml } = require('../src/scrapers/menuParser');
const { validateMenu } = require('../src/scrapers/validateMenu');

const raw = process.env.HDH_TEST_RAW_DIR || path.join(__dirname, '../data/web/raw/ucsdRestaurants');
const haveInputs = fs.existsSync(raw) && fs.readdirSync(raw).filter(f => f.endsWith('.html')).length === 10;
const integration = { skip: !haveInputs && 'The 10 local restaurant HTML files are not supplied' };
const hall = { id: 'pines', name: 'Pines', area: 'Muir College' };
const entries = menu => menu.stations.flatMap(station => station.items);
const clean = text => text.replace(/\s+/g, ' ').trim();
let dir, result;

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdh-tests-'));
  if (!haveInputs) return;
  fs.mkdirSync(path.join(dir, 'raw'));
  fs.cpSync(raw, path.join(dir, 'raw/ucsdRestaurants'), { recursive: true });
  const blocked = [];
  const block = (obj, key) => {
    blocked.push([obj, key, obj[key]]);
    obj[key] = () => { throw new Error('Network forbidden in offline build'); };
  };
  for (const mod of ['node:http', 'node:https']) for (const key of ['request', 'get']) block(require(mod), key);
  for (const key of ['connect', 'createConnection']) block(require('node:net'), key);
  block(require('node:tls'), 'connect');
  block(globalThis, 'fetch');
  try { result = buildDataset(dir); }
  finally { for (const [obj, key, original] of blocked) obj[key] = original; }
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

function section({ period = 'Lunch', station = 'Grill', category = 'Sides', price = '$5.25', name = 'Rice', id = '1', cal = '123', description = 'Plain rice' } = {}) {
  return `<div class="meal-category" id="${period}"><div class="menu-category-section"><header class="accordion-header"><h3>${station}</h3></header><div class="panel-heading"><a class="sublocs">${category}</a></div><div class="station-list"><div class="d-none d-lg-block"><div class="menU-item-row"><a class="sublocsitem" href="/dining/apps/diningservices/Nutrition/Nutritionfacts2?id=${id}">${name}</a>${description === null ? '' : `<div class="proI"><span>${description}</span></div>`}<span class="item-price">${price}</span><span class="cals">${cal}</span><img title="Vegan"></div></div></div></div></div>`;
}
function fixture(rows = section(), date = 'Monday, November 16 2026') {
  return `<h1>Pines</h1><h2 class="datenow">${date}</h2><p id="station-hours">7:00 AM - 11:00 PM</p>${rows}`;
}

test('offline build covers all ten current captures and accounts for every occurrence', integration, () => {
  assert.equal(LOCATIONS.length, 10);
  assert.deepEqual(result.validation.failures, []);
  assert.deepEqual(result.dataset.summary, { input_files: 10, menus: 10, locations: 10, food_entries: 1199 });
  const stats = result.validation.summary;
  assert.equal(stats.errors, 0);
  assert.equal(stats.original_food_occurrences, 2037);
  assert.equal(stats.merged_occurrences, 838);
  assert.equal(stats.food_entries + stats.merged_occurrences, stats.original_food_occurrences);
  assert.equal(stats.duplicates, 0);
  assert.equal(stats.duplicate_captures, 0);
  for (const location of result.dataset.locations) {
    assert.equal(location.menus.length, 1);
    assert.equal(location.menus[0].menu_date, '2026-11-16');
    assert.deepEqual(validateMenu(location.menus[0]).errors, []);
  }
});

test('every HTML row retains its description and existing fields across all ten restaurants', integration, () => {
  for (const location of result.dataset.locations) for (const menu of location.menus) {
    const $ = cheerio.load(fs.readFileSync(path.join(dir, menu.source_files[0]), 'utf8'));
    const rows = $('.station-list > .d-none.d-lg-block > .menU-item-row');
    assert.equal(rows.length, entries(menu).length + menu.diagnostics.merged_occurrences);
    rows.each((_, element) => {
      const row = $(element);
      const station = clean(row.closest('.menu-category-section').find('> .accordion-header h3').first().text());
      const category = clean(row.closest('.station-list').prev('.panel-heading').find('a.sublocs').first().text());
      const name = clean(row.find('a.sublocsitem').first().text());
      const description = clean(row.find('.proI').first().text()) || null;
      const url = new URL(row.find('a.sublocsitem').first().attr('href'), 'https://hdh-web.ucsd.edu').href;
      const price = row.find('.item-price').first().text().match(/-?\d+(?:\.\d+)?/);
      const calories = Number(row.find('.cals').first().text().match(/\d+(?:\.\d+)?/)[0]);
      const tags = [...new Set(row.find('img[title]').map((_, e) => clean($(e).attr('title')).replace(/^Contains /i, '').replace(/TreeNuts/i, 'Tree Nuts').toLowerCase().replace(/\s+/g, '_')).get())].sort();
      const cents = price ? Math.round(Number(price[0]) * 100) : null;
      const item = menu.stations.find(s => s.name === station).items.find(i =>
        i.name === name && i.description === description && i.category === category && i.nutrition_url === url && i.price_cents === cents && i.calories === calories && JSON.stringify(i.tags) === JSON.stringify(tags));
      assert.ok(item, `${location.id}: ${station}/${name}`);
      const period = row.closest('.meal-category').attr('id').toLowerCase();
      assert.ok(item.meal_periods.includes(period));
      assert.equal(item.prices_by_meal_period[period], cents);
    });
  }
});

test('individual JSON files and combined JSON contain the same records', integration, () => {
  const combined = JSON.parse(fs.readFileSync(path.join(dir, 'output/web-dataset.json')));
  assert.deepEqual(combined, result.dataset);
  for (const location of combined.locations) for (const menu of location.menus) {
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'output/menus', `${location.id}-${menu.menu_date}.json`))), menu);
  }
  assert.equal(fs.readdirSync(path.join(dir, 'output/menus')).length, 10);
});

test('dedup merges equivalent meals and preserves station, category, price and calorie variants', () => {
  const rows = section() + section({ period: 'Dinner' }) + section({ station: 'Other' }) + section({ category: 'Extras' }) + section({ price: '$6.00' }) + section({ cal: '200' });
  const menu = parseMenuHtml(fixture(rows), hall, 0);
  assert.equal(entries(menu).length, 5);
  assert.deepEqual(entries(menu)[0].meal_periods, ['lunch', 'dinner']);
  assert.equal(menu.diagnostics.merged_occurrences, 1);
});

test('displayed dates remain distinct instead of being guessed from day offsets', () => {
  const local = path.join(dir, 'dates');
  fs.mkdirSync(path.join(local, 'raw/first'), { recursive: true });
  fs.mkdirSync(path.join(local, 'raw/second'), { recursive: true });
  fs.writeFileSync(path.join(local, 'raw/first/pines-day0.html'), fixture());
  fs.writeFileSync(path.join(local, 'raw/second/pines-day0.html'), fixture(section(), 'Tuesday, November 17 2026'));
  assert.equal(buildDataset(local).dataset.summary.menus, 2);
});

test('missing data is preserved as null and invalid values are reported', () => {
  const menu = parseMenuHtml(fixture(section({ price: '', name: '', id: 'bad', cal: '' })), hall, 0);
  assert.equal(entries(menu)[0].price_cents, null);
  assert.equal(entries(menu)[0].calories, null);
  assert.ok(validateMenu(menu).errors.some(e => e.includes('missing name')));
  const good = parseMenuHtml(fixture(), hall, 0);
  Object.assign(entries(good)[0], { price_cents: -1, calories: NaN, tags: ['invented'] });
  assert.ok(validateMenu(good).errors.length >= 3);
});

test('closed menus parse but unrecognized layouts and invalid dates fail visibly', () => {
  assert.equal(parseMenuHtml(fixture('<div class="meal-category">Closed today</div>'), hall, 0).stations.length, 0);
  assert.throws(() => parseMenuHtml('<p>error page</p>', hall, 0), /Unrecognized/);
  assert.throws(() => parseMenuHtml(fixture('<div class="meal-category">new layout</div>'), hall, 0), /layout/);
  assert.ok(validateMenu(parseMenuHtml(fixture(section(), 'Monday, February 30 2026'), hall, 0)).errors.length);
});

test('validation rejects incorrect nutrition hosts, paths, credentials and source IDs', () => {
  for (const url of ['https://evil.test/?id=1', 'https://hdh-web.ucsd.edu/other?id=1', 'http://hdh-web.ucsd.edu/dining/apps/diningservices/Nutrition/Nutritionfacts2?id=1', 'https://x@hdh-web.ucsd.edu/dining/apps/diningservices/Nutrition/Nutritionfacts2?id=1', null]) {
    const menu = parseMenuHtml(fixture(), hall, 0);
    entries(menu)[0].nutrition_url = url;
    assert.ok(validateMenu(menu).errors.some(e => e.includes('source item ID')));
  }
});

test('duplicate records and missing station or meal prices are detected', () => {
  const menu = parseMenuHtml(fixture(), hall, 0);
  menu.stations[0].items.push(structuredClone(entries(menu)[0]));
  assert.equal(validateMenu(menu).counts.duplicates, 1);
  delete entries(menu)[0].prices_by_meal_period.lunch;
  assert.ok(validateMenu(menu).errors.some(e => e.includes('missing meal price')));
  menu.stations[0].name = '';
  assert.ok(validateMenu(menu).errors.some(e => e.includes('station')));
});

test('malformed captures prevent overwriting a successful dataset', () => {
  const local = path.join(dir, 'invalid');
  fs.mkdirSync(path.join(local, 'raw'), { recursive: true });
  fs.writeFileSync(path.join(local, 'raw/pines-day0.html'), fixture());
  buildDataset(local);
  const before = fs.readFileSync(path.join(local, 'output/web-dataset.json'), 'utf8');
  fs.writeFileSync(path.join(local, 'raw/bistro-day0.html'), '<p>error</p>');
  const broken = buildDataset(local);
  assert.equal(broken.validation.summary.errors, 1);
  assert.equal(fs.readFileSync(path.join(local, 'output/web-dataset.json'), 'utf8'), before);
  assert.equal(buildDataset(path.join(dir, 'empty')).validation.summary.errors, 1);
});

test('rebuilds are deterministic, remove stale dated menu outputs and create no extra folders', integration, () => {
  fs.writeFileSync(path.join(dir, 'output/menus/pines-2000-01-01.json'), '{}');
  const again = buildDataset(dir);
  const prior = structuredClone(result.dataset), next = structuredClone(again.dataset);
  delete prior.generated_at;
  delete next.generated_at;
  assert.deepEqual(next, prior);
  assert.deepEqual(again.validation.summary, result.validation.summary);
  assert.equal(fs.readdirSync(path.join(dir, 'output/menus')).length, 10);
  for (const folder of ['reports', 'inputs', 'exports', 'nutrition', 'archive']) assert.equal(fs.existsSync(path.join(dir, folder)), false);
});

test('menu calories remain authoritative and no detailed nutrition is fabricated', integration, () => {
  const pines = result.dataset.locations.find(l => l.id === 'pines').menus[0];
  const sample = entries(pines).find(i => i.calories !== null);
  const $ = cheerio.load(fs.readFileSync(path.join(dir, pines.source_files[0]), 'utf8'));
  const source = $('a.sublocsitem').filter((_, e) => new URL($(e).attr('href'), 'https://hdh-web.ucsd.edu').href === sample.nutrition_url).first().closest('.menU-item-row');
  assert.equal(sample.calories, Number(source.find('.cals').first().text().match(/\d+(?:\.\d+)?/)[0]));
  for (const item of result.dataset.locations.flatMap(l => l.menus.flatMap(entries))) {
    assert.equal(item.nutrition.data, null);
    assert.equal(item.nutrition.collection_status, 'not_attempted');
    assert.equal('nutrition_audit' in item, false);
  }
});

test('symlink inputs are rejected instead of scanning outside the raw directory', () => {
  const local = path.join(dir, 'symlinks');
  fs.mkdirSync(path.join(local, 'raw'), { recursive: true });
  fs.symlinkSync(raw, path.join(local, 'raw/link'));
  assert.throws(() => buildDataset(local), /Symlink/);
});

test('descriptions preserve source text and decode entities while normalizing HTML whitespace', () => {
  const menu = parseMenuHtml(fixture(section({
    description: '  Rice &amp; beans,\n    with <em>fresh</em> herbs.\tServed&nbsp;warm.  '
  })), hall, 0);
  assert.equal(entries(menu)[0].description, 'Rice & beans, with fresh herbs. Served warm.');
});

test('absent, empty and whitespace-only descriptions remain null rather than being invented', () => {
  for (const description of [null, '', ' \n \t &nbsp; ']) {
    const menu = parseMenuHtml(fixture(section({ description })), hall, 0);
    assert.equal(entries(menu)[0].description, null);
    assert.deepEqual(validateMenu(menu).errors, []);
  }
});

test('deduplication retains normalized descriptions and does not discard distinct source text', () => {
  const menu = parseMenuHtml(fixture(
    section({ description: ' Plain   rice ' }) +
    section({ period: 'Dinner', description: 'Plain rice' }) +
    section({ description: 'Rice with herbs' })
  ), hall, 0);
  assert.equal(entries(menu).length, 2);
  assert.equal(menu.diagnostics.merged_occurrences, 1);
  assert.equal(entries(menu)[0].description, 'Plain rice');
  assert.deepEqual(entries(menu)[0].meal_periods, ['lunch', 'dinner']);
  assert.equal(entries(menu)[1].description, 'Rice with herbs');
  assert.deepEqual(validateMenu(menu).errors, []);
});

test('all 1199 food descriptions survive both combined and individual JSON outputs', integration, () => {
  let withDescription = 0, missingDescription = 0;
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'output/web-dataset.json')));
  assert.equal(saved.locations.length, 10);
  for (const location of saved.locations) for (const menu of location.menus) {
    const individual = JSON.parse(fs.readFileSync(path.join(dir, 'output/menus', `${location.id}-${menu.menu_date}.json`)));
    assert.deepEqual(entries(individual), entries(menu));
    for (const item of entries(menu)) {
      assert.ok(Object.hasOwn(item, 'description'));
      if (item.description === null) missingDescription++;
      else {
        assert.equal(typeof item.description, 'string');
        assert.ok(item.description.length > 0);
        assert.equal(item.description, clean(item.description));
        withDescription++;
      }
    }
  }
  assert.equal(withDescription, 1199);
  assert.equal(missingDescription, 0);
});

test('all 879 completed caches produce zero requests and preserve all 1199 source records', integration, async t => {
  const { nutritionUrl } = require('../src/scrapers/nutritionParser');
  const { discoverNutritionUrls, writeNutritionCache, downloadNutrition } = require('../src/scrapers/nutritionDownloader');
  const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'hdh-all-caches-'));
  t.after(() => fs.rmSync(isolated, { recursive: true, force: true }));
  fs.mkdirSync(path.join(isolated, 'raw'));
  fs.cpSync(raw, path.join(isolated, 'raw/ucsdRestaurants'), { recursive: true });
  const original = buildDataset(isolated, { write: false, enrich: false }).dataset;
  const pages = discoverNutritionUrls(original).pages;
  assert.equal(pages.length, 879);
  const samples = new Map();
  // Synthetic nutrition is confined to this temporary test cache; these values
  // are not published nutrition and never enter the real project's dataset.
  pages.forEach((page, index) => {
    const title = `Fixture recipe ${index}`;
    const html = `<h1>${title}</h1><p>Serving Size 1 oz</p><table><tr><th>Calories</th><td>10</td></tr><tr><td>Protein ${index + 1} g</td></tr><tr><td>Total Carbohydrate 2 g</td></tr><tr><td>Total Fat 3 g</td></tr><tr><td>Sodium 0 mg</td></tr></table>`;
    writeNutritionCache(isolated, page.url, html);
    samples.set(page.url, { title, protein: index + 1 });
  });
  let calls = 0;
  const networkBlocked = () => { calls++; throw new Error('Completed caches must cause zero requests'); };
  const reused = await downloadNutrition(isolated, { fetchImpl: networkBlocked });
  assert.equal(reused.summary.already_cached, 879);
  assert.equal(reused.summary.downloaded, 0);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = networkBlocked;
  let enriched;
  try { enriched = buildDataset(isolated); }
  finally { globalThis.fetch = previousFetch; }
  assert.equal(calls, 0);
  assert.equal(enriched.validation.summary.errors, 0);
  assert.equal(enriched.validation.summary.original_food_occurrences, 2037);
  assert.equal(enriched.validation.summary.merged_occurrences, 838);
  assert.equal(enriched.coverage.summary.pages_cached, 879);
  assert.equal(enriched.coverage.summary.foods_with_complete_macros, 1199);
  assert.equal(enriched.database.records_valid_for_export,1199);
  assert.deepEqual(enriched.database.withheld,[]);
  const classification=enriched.coverage.beverage_classification;
  assert.equal(classification.summary.total,1199);
  assert.equal(classification.summary.true+classification.summary.false,1199);
  assert.equal(classification.summary.explicit_category+classification.summary.high_confidence_inference+classification.summary.default,1199);
  assert.equal(classification.review.length,classification.summary.manual_review);
  assert.equal(classification.summary.default,classification.review.length);
  for(const snapshot of Object.values(enriched.database.snapshots)){
    for(const food of snapshot.Foods){
      assert.equal(typeof food.beverage,'boolean');
      assert.equal('beverage_classification' in food,false);
    }
    for(const provenance of snapshot.provenance){
      assert.equal(typeof provenance.beverage_classification.value,'boolean');
      assert.ok(provenance.beverage_classification.rule);
    }
  }
  const core = structuredClone(enriched.dataset);
  for (const location of core.locations) for (const menu of location.menus) for (const station of menu.stations) for (const food of station.items) {
    const expected = samples.get(nutritionUrl(food.nutrition_url));
    assert.equal(food.nutrition.data.title, expected.title);
    assert.equal(food.nutrition.data.nutrients.protein.value, expected.protein);
    delete food.nutrition;
  }
  delete original.generated_at;
  delete core.generated_at;
  assert.deepEqual(core, original);
});
