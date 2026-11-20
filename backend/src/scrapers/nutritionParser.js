const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const cheerio = require('cheerio');

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const CACHE_DIR = 'nutrition-cache';
const ORIGIN = 'https://hdh-web.ucsd.edu';
const NUTRITION_PATH = '/dining/apps/diningservices/Nutrition/Nutritionfacts2';

function nutritionUrl(value) {
  const url = new URL(value);
  if (url.origin !== ORIGIN || url.username || url.password || url.hash ||
      url.pathname !== NUTRITION_PATH || !/^\d+$/.test(url.searchParams.get('id') || '')) {
    throw new Error(`Unsupported nutrition URL: ${value}`);
  }
  const keys = [...url.searchParams.keys()];
  if (keys.some(k => !['id', 'recId'].includes(k)) || new Set(keys).size !== keys.length) throw new Error('Unexpected or duplicate nutrition query parameter');
  const recId = url.searchParams.get('recId');
  if (recId !== null && (recId.length > 256 || /[\u0000-\u001f\u007f]/.test(recId))) throw new Error('Invalid recipe parameter');
  // Sorting parameter order deduplicates equivalent links. Empty and absent
  // recId remain distinct; spaces, slashes, commas and recipe names are observed
  // in the actual saved menus and are retained rather than guessed or split.
  url.search = '';
  url.searchParams.set('id', new URL(value).searchParams.get('id'));
  if (recId !== null) url.searchParams.set('recId', recId);
  return url.href;
}
function cacheKey(url) { return createHash('sha256').update(nutritionUrl(url)).digest('hex'); }
function hashHtml(html) { return createHash('sha256').update(html).digest('hex'); }

const LABELS = [
  ['fat_cal', /^calories?\s+from\s+fat\b/i],
  ['calorie', /^(?:total\s+)?calories?\b/i],
  ['fat', /^total\s+fat\b/i],
  ['sat_fat', /^(?:sat\.?|saturated)\s+fat\b/i],
  ['trans_fat', /^trans\s+fat\b/i],
  ['cholesterol', /^cholesterol\b/i],
  ['sodium', /^sodium\b/i],
  ['carb', /^(?:tot\.?\s*carb\.?|total\s+carbohydrates?|carbohydrates?)(?=\s|:|$)/i],
  ['fiber', /^(?:dietary\s+fi(?:ber|bre)|fi(?:ber|bre))\b/i],
  ['sugar', /^(?:total\s+)?sugars?\b/i],
  ['protein', /^protein\b/i]
];
const MASS_UNITS = { g: 'g', gram: 'g', grams: 'g', mg: 'mg', milligram: 'mg', milligrams: 'mg', mcg: 'mcg', 'µg': 'mcg', 'μg': 'mcg', kg: 'kg' };
function quantity(text, defaultUnit = null) {
  const raw = clean(text);
  const m = raw.match(/^(?:[:=]\s*)?([<>≤≥~]?)\s*(-?(?:\d[\d,]*(?:\.\d+)?|\.\d+))\s*([a-zµμ]+(?:\s+oz)?|%)?/i);
  if (!m || m[3] === '%') return null;
  const value = Number(m[2].replace(/,/g, ''));
  const originalUnit = m[3] || null;
  const unitText = (originalUnit || '').toLowerCase();
  const unit = MASS_UNITS[unitText] || ({ ounce:'oz', ounces:'oz', oz:'oz', lb:'lb', lbs:'lb', pound:'lb', pounds:'lb', kcal:'kcal', calories:'kcal', calorie:'kcal', cal:'kcal', kj:'kJ' })[unitText] || originalUnit || defaultUnit;
  return { value, unit, original_unit: originalUnit, qualifier: m[1] || null, raw };
}
const TAG_NAMES = {
  dairy:'dairy', milk:'dairy', eggs:'eggs', egg:'eggs', fish:'fish', shellfish:'shellfish', 'shell fish':'shellfish',
  treenuts:'tree_nuts', 'tree nuts':'tree_nuts', peanuts:'peanuts', peanut:'peanuts', soy:'soy', wheat:'wheat', sesame:'sesame', gluten:'gluten',
  vegan:'vegan', vegetarian:'vegetarian', wellness:'wellness', sustainability:'sustainability', 'sustainably sourced':'sustainability'
};
function parseNutrition(html) {
  const $ = cheerio.load(html);
  const observations = {};
  const seenLabels = new Set();
  const unparsed = new Set();
  const issues = [];
  // Match labels, not column offsets. Ignore %DV cells and parent cells which
  // contain nested tables, so nested/repeated labels do not double-count values.
  $('table tr').each((_, element) => {
    const cells = $(element).children('th,td').toArray().filter(e => !$(e).find('table').length).map(e => clean($(e).text()));
    cells.forEach((text, index) => {
      for (const [field, label] of LABELS) {
        const match = text.match(label);
        if (!match) continue;
        seenLabels.add(field);
        const remainder = clean(text.slice(match[0].length));
        const q = quantity(remainder || cells[index + 1], ['calorie', 'fat_cal'].includes(field) ? 'kcal' : null);
        if (q) {
          (observations[field] ||= []).push(q);
          if (q.value < 0 || !Number.isFinite(q.value)) issues.push(`Invalid nutrient quantity for ${field}`);
        } else if (!/^(?:|n\/?a|not available|--|-)$/i.test(remainder || cells[index + 1] || '')) {
          unparsed.add(field);
          issues.push(`Could not identify quantity for ${field}`);
        }
        break;
      }
    });
  });
  const nutrients = {};
  for (const [field, values] of Object.entries(observations)) {
    const distinct = new Map(values.map(q => [JSON.stringify([q.value, q.unit, q.qualifier]), q]));
    if (distinct.size === 1) nutrients[field] = [...distinct.values()][0];
    else issues.push(`Conflicting repeated values for ${field}`);
  }
  const servingText = $('p,td,th,.serving-size').toArray().map(e => clean($(e).text())).find(t => /^serving\s+size\b/i.test(t));
  const servingSize = servingText ? quantity(servingText.replace(/^serving\s+size\s*:*/i, '')) : null;
  const ingredientHeading = $('h1,h2,h3,h4').filter((_, e) => /^ingredients?\s*:*/i.test(clean($(e).text())) && /^ingredients?\s*:?$/i.test(clean($(e).text()))).first();
  const ingredientParts = [];
  ingredientHeading.nextUntil('h1,h2,h3,h4').each((_, e) => {
    const text = clean($(e).text());
    if (!text) return;
    if (/^(for specific nutritional|contact |disclaimer|percent daily)/i.test(text)) return false;
    ingredientParts.push(text);
  });
  const ingredientsText = ingredientParts.join('\n') || null;
  let labelScope = $();
  $('h1,h2,h3,h4').filter((_, e) => /^(allergens?|dietary (?:information|labels)|dietary)\s*:?$/i.test(clean($(e).text()))).each((_, e) => {
    labelScope = labelScope.add($(e).nextUntil('h1,h2,h3,h4'));
  });
  labelScope = labelScope.add($('.allergens,.dietary-labels,[data-allergens]'));
  const labels = [];
  labelScope.find('img').add(labelScope.filter('img')).each((_, e) => {
    const label = $(e).attr('title') || $(e).attr('alt');
    if (label) labels.push(clean(label));
  });
  labelScope.find('p,li,span').add(labelScope.filter('p,li,span')).each((_, e) => labels.push(clean($(e).text())));
  const tags = new Set();
  const flags = {};
  for (const label of labels) {
    const normalized = label.toLowerCase().replace(/^legend:\s*/, '').replace(/\s+icon$/, '').replace(/^contains\s+/, '').trim();
    const tag = TAG_NAMES[normalized];
    if (tag) tags.add(tag);
    const negative = normalized.match(/^not (vegan|vegetarian|wellness|sustainability)$/);
    if (negative) flags[negative[1]] = false;
  }
  for (const tag of tags) if (['vegan', 'vegetarian', 'wellness', 'sustainability'].includes(tag)) {
    if (flags[tag] === false) {
      issues.push(`Conflicting dietary labels for ${tag}`);
      flags[tag] = null;
      tags.delete(tag);
    } else flags[tag] = true;
  }
  const recognized = Object.keys(observations).length > 0 || ingredientHeading.length > 0 ||
    $('table').toArray().some(e => /nutrition values|amount per serving/i.test($(e).attr('summary') || $(e).find('caption').text()));
  return {
    title: clean($('h1').first().text()) || null, recognized,
    field_status: Object.fromEntries(LABELS.map(([field]) => [field, nutrients[field] ? 'present' : observations[field] ? 'conflicting_labels' : unparsed.has(field) ? 'parser_unrecognized' : seenLabels.has(field) ? 'source_empty' : recognized ? 'source_not_published' : 'parser_unrecognized'])),
    nutrients, observations, serving_size: servingSize, serving_size_text: servingText || null,
    ingredients_text: ingredientsText, ingredients: ingredientsText ? [ingredientsText] : [],
    tags: [...tags].sort(), flags, labels: [...new Set(labels.filter(Boolean))], issues
  };
}

function readCachedNutrition(dataDir, url, { parse = true } = {}) {
  const key = cacheKey(url);
  const base = path.join(dataDir, CACHE_DIR, key);
  const exists = suffix => fs.existsSync(base + suffix);
  if (!['.html', '.json', '.html.tmp', '.json.tmp'].some(exists)) return null;
  // The checksum-bearing pending metadata proves that a full response was
  // written. Recover a completed transaction after interruption at either rename.
  // An incomplete temporary write is never accepted as a successful download.
  const candidates = [
    ['.html.tmp', '.json.tmp'], ['.html', '.json.tmp'], ['.html', '.json']
  ];
  let lastError = 'Incomplete cache; explicit refresh is required';
  for (const [htmlSuffix, metaSuffix] of candidates) {
    if (!exists(htmlSuffix) || !exists(metaSuffix)) continue;
    try {
      const html = fs.readFileSync(base + htmlSuffix, 'utf8');
      const metadata = JSON.parse(fs.readFileSync(base + metaSuffix, 'utf8'));
      if (metadata.url !== nutritionUrl(url) || metadata.sha256 !== hashHtml(html) ||
          typeof metadata.retrieved_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(metadata.retrieved_at) ||
          !Number.isFinite(Date.parse(metadata.retrieved_at))) throw new Error('Cache metadata/hash mismatch');
      if (htmlSuffix !== '.html') fs.renameSync(base + htmlSuffix, base + '.html');
      if (metaSuffix !== '.json') fs.renameSync(base + metaSuffix, base + '.json');
      let data = null, parser_error = null;
      if (parse) {
        try { data = parseNutrition(html); }
        catch (error) { parser_error = error.message; }
      }
      return { html, metadata, data, parser_error, cache_file: `${CACHE_DIR}/${key}.html` };
    } catch (error) { lastError = error.message; }
  }
  if (!exists('.html') && !exists('.json')) return null;
  return { error: lastError, cache_file: `${CACHE_DIR}/${key}.html` };
}
function calorieValue(q) {
  if (!q || q.qualifier || !Number.isFinite(q.value) || q.value < 0) return null;
  return q.unit === 'kcal' ? q.value : q.unit === 'kJ' ? q.value / 4.184 : null;
}
function enrichMenus(menus, dataDir) {
  let attempts = {};
  try { attempts = JSON.parse(fs.readFileSync(path.join(dataDir, CACHE_DIR, 'download-state.json'), 'utf8')).pages || {}; } catch { /* no downloads yet */ }
  const cache = new Map();
  for (const menu of menus) for (const station of menu.stations) for (const item of station.items) {
    let url;
    try { url = nutritionUrl(item.nutrition_url); }
    catch (error) { item.nutrition = { collection_status: 'unsupported_link', verification_status: 'unavailable', error: error.message, data: null }; continue; }
    if (!cache.has(url)) cache.set(url, readCachedNutrition(dataDir, url));
    const saved = cache.get(url);
    const attempted = attempts[url];
    const collection = !saved ? ['downloaded', 'cached'].includes(attempted?.status) ? 'invalid_cache' : attempted?.status || 'not_attempted' : saved.error ? 'invalid_cache' : !saved.data?.recognized ? 'parser_unrecognized' : 'cached';
    const snapshotCalories = calorieValue(saved?.data?.nutrients.calorie);
    const conflict = item.calories != null && snapshotCalories != null && Math.abs(item.calories - snapshotCalories) > 1e-9;
    item.nutrition = {
      source_url: url, cache_file: saved?.cache_file || null,
      cached: Boolean(saved && !saved.error),
      retrieved_at: saved?.metadata?.retrieved_at || attempted?.retrieved_at || null,
      collection_status: collection,
      verification_status: conflict ? 'calorie_conflict' : saved?.data?.field_status.calorie === 'conflicting_labels' ? 'snapshot_ambiguous' : saved?.data?.recognized ? 'no_known_calorie_conflict_date_unverified' : 'unavailable',
      conflict: conflict ? { menu_date: menu.menu_date, menu_calories: item.calories, snapshot_calories: snapshotCalories, source_url: item.nutrition_url, retrieved_at: saved.metadata.retrieved_at } : null,
      error: saved?.error || saved?.parser_error || attempted?.error || null,
      data: saved?.data || null
    };
  }
}
module.exports = { CACHE_DIR, ORIGIN, NUTRITION_PATH, nutritionUrl, cacheKey, hashHtml, quantity, parseNutrition, readCachedNutrition, calorieValue, enrichMenus };

function nutritionCoverage(menus, database, dataDir) {
  const summary = {
    total_original_foods: 0, total_unique_nutrition_urls: 0, pages_cached: 0,
    successfully_downloaded_last_run: 0, already_cached_last_run: 0, failed_downloads: 0,
    pages_not_attempted: 0, foods_with_complete_macros: 0, foods_with_usable_macros: 0,
    foods_with_protein: 0, foods_with_carbohydrates: 0, foods_with_fat: 0, foods_with_sodium: 0,
    pages_parser_unrecognized: 0, pages_invalid_cache: 0,
    foods_with_partial_nutrition: 0, foods_with_no_detailed_nutrition: 0,
    foods_with_ingredients: 0, foods_with_nutrition_page_allergens: 0, foods_with_published_allergens: 0,
    calorie_conflicts: 0, missing_prices: 0, missing_or_unsupported_links: 0,
    records_valid_for_database_export: database.records_valid_for_export,
    records_withheld_from_database_export: database.withheld.length
  };
  const rows = [], conflicts = [], pages = new Map(), cachedUrls = new Set(), collectionCounts = {};
  const allergenTags = ['eggs','gluten','tree_nuts','fish','wheat','sesame','soy','peanuts','dairy','shellfish'];
  for (const menu of menus) for (const station of menu.stations) for (const item of station.items) {
    const detail = item.nutrition;
    const data = detail?.data;
    summary.total_original_foods++;
    if (item.price_cents == null) summary.missing_prices++;
    const hasMass = f => {
      const q = data?.nutrients[f];
      return Boolean(q && !q.qualifier && ['g','mg','mcg','kg'].includes(q.unit) && Number.isFinite(q.value) && q.value >= 0);
    };
    for (const [field, count] of [['protein', 'foods_with_protein'], ['carb', 'foods_with_carbohydrates'], ['fat', 'foods_with_fat'], ['sodium', 'foods_with_sodium']]) {
      if (hasMass(field)) summary[count]++;
    }
    const complete = ['protein','carb','fat'].every(hasMass);
    if (complete) {
      summary.foods_with_complete_macros++;
      if (!['calorie_conflict', 'snapshot_ambiguous'].includes(detail.verification_status)) summary.foods_with_usable_macros++;
    } else if (data && Object.keys(data.nutrients).length) summary.foods_with_partial_nutrition++;
    else summary.foods_with_no_detailed_nutrition++;
    if (data?.ingredients_text) summary.foods_with_ingredients++;
    if (data?.tags.some(t => allergenTags.includes(t))) summary.foods_with_nutrition_page_allergens++;
    if ([...item.tags, ...(data?.tags || [])].some(t => allergenTags.includes(t))) summary.foods_with_published_allergens++;
    const status = detail?.collection_status || 'not_attempted';
    if (status === 'unsupported_link') summary.missing_or_unsupported_links++;
    collectionCounts[status] = (collectionCounts[status] || 0) + 1;
    if (detail?.source_url) pages.set(detail.source_url, status);
    if (detail?.source_url && detail.cached) cachedUrls.add(detail.source_url);
    const context = { restaurant: menu.dining_hall.id, date: menu.menu_date, station: station.name, name: item.name,
      source_url: item.nutrition_url, retrieved_at: detail?.retrieved_at || null };
    if (detail?.conflict) conflicts.push({ ...context, ...detail.conflict });
    rows.push({ ...context, collection_status: status, verification_status: detail?.verification_status || 'unavailable',
      complete_macros: complete, cached: detail?.cached || false, source_field_status: data?.field_status || {},
      parser_issues: data?.issues || [], error: detail?.error || null });
  }
  summary.total_unique_nutrition_urls = pages.size;
  summary.pages_cached = cachedUrls.size;
  summary.pages_parser_unrecognized = [...pages.values()].filter(s => s === 'parser_unrecognized').length;
  summary.pages_invalid_cache = [...pages.values()].filter(s => s === 'invalid_cache').length;
  summary.pages_not_attempted = [...pages.values()].filter(s => s === 'not_attempted').length;
  summary.calorie_conflicts = conflicts.length;
  let state = null;
  try { state = JSON.parse(fs.readFileSync(path.join(dataDir, CACHE_DIR, 'download-state.json'), 'utf8')); } catch { /* no downloader run */ }
  summary.successfully_downloaded_last_run = state?.summary?.downloaded || 0;
  summary.already_cached_last_run = state?.summary?.already_cached || 0;
  summary.failed_downloads = [...pages.keys()].filter(url => ['failed','blocked','rate_limited','not_found','blocked_redirect','invalid_response'].includes(state?.pages?.[url]?.status)).length;
  return { summary, access: state?.access || { status: 'not_checked', reason: 'Downloader not run; no access permission assumed.' },
    collection_status_counts: collectionCounts, conflicts, foods: rows, withheld: database.withheld, conversion_issues: database.issues,
    beverage_classification: database.beverage_classification,
    limitations: ['Matching calories do not prove the nutrition snapshot matches the captured menu date.',
      'No known source value is replaced with zero. Missing cache pages do not prove the website lacks nutrition.',
      'Beverage classifications use source categories and conservative contextual rules; unresolved cases default to false and are listed for manual review.'] };
}
module.exports.nutritionCoverage = nutritionCoverage;
