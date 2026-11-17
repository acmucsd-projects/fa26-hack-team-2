const fs = require('node:fs');
const path = require('node:path');
const { parseMenuHtml } = require('./menuParser');
const { parseNutrition, nutritionCacheFileName, nutritionConflict } = require('./nutritionParser');
const { validateMenu } = require('./validateMenu');
const { extractArchive, htmlFiles, packageDataset } = require('./localFiles');
const { transformMenus, validateDatabase } = require('./databaseTransform');

const LOCATIONS = [
  ['64-degrees', '64degrees', '64 Degrees', 'Revelle College'],
  ['bistro', 'bistro', 'Bistro'],
  ['canyon-vista', 'canyonVista', 'Canyon Vista Marketplace'],
  ['cecils-faculty-club', 'cecilsAtFacultyClub', "Cecil's at Faculty Club"],
  ['club-med', 'clubMed', 'Club Med'],
  ['foodworx', 'foodworx', 'Foodworx'],
  ['oceanview', 'oceanView', 'OceanView'],
  ['pines', 'pines', 'Pines', 'Muir College'],
  ['sixth-college', 'sixth', 'Restaurants at Sixth College'],
  ['ventanas', 'ventanas', 'Ventanas']
].map(([id, alias, name, area]) => ({ id, alias, name, area: area || 'unknown' }));

function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

function attachNutrition(menu, dataDir, cache, pages) {
  for (const station of menu.stations) {
    for (const item of station.items) {
      const cacheFile = nutritionCacheFileName(item.nutrition_url);
      const saved = path.join(dataDir, 'nutrition', cacheFile);
      if (!cache.has(cacheFile)) {
        let nutrition = null;
        if (fs.existsSync(saved)) {
          const parsed = parseNutrition(fs.readFileSync(saved, 'utf8'));
          const { macros, ingredients, serving_size_text, ...values } = parsed;
          if (Object.values({ ...values, ...macros }).some(v => v !== null) || ingredients) nutrition = parsed;
        }
        cache.set(cacheFile, nutrition);
      }
      item.nutrition = cache.get(cacheFile);
      const conflict = nutritionConflict(item);
      item.nutrition_status = conflict ? 'unverified' : item.nutrition ? 'available' : fs.existsSync(saved) ? 'invalid' : 'missing';
      if (conflict) {
        item.nutrition_audit = {
          ...conflict,
          menu_date: menu.menu_date,
          snapshot_file: `nutrition/${cacheFile}`,
          policy: 'Menu calories take precedence; all conflicting snapshot nutrients and ingredients are excluded from database output.'
        };
      }
      if (!pages.has(cacheFile)) {
        pages.set(cacheFile, { cache_file: cacheFile, url: item.nutrition_url, saved: fs.existsSync(saved), used_by: [] });
      }
      pages.get(cacheFile).used_by.push(`${menu.dining_hall.id}/${menu.menu_date}/${station.name}/${item.name}`);
    }
  }
}

function buildDataset(dataDir = path.join(__dirname, '../../data/web')) {
  // The ZIP already contains a ucsdRestaurants/ directory. Extract directly
  // under raw/ so all active restaurant HTML has one source of truth.
  extractArchive(path.join(dataDir, 'inputs/ucsdRestaurants.zip'), path.join(dataDir, 'raw'));
  const files = htmlFiles(path.join(dataDir, 'raw'));
  const failures = [], captures = [], duplicateCaptures = [];
  const byMenu = new Map(), nutritionPages = new Map(), nutritionCache = new Map();

  for (const file of files) {
    const relative = path.relative(dataDir, file);
    try {
      const match = path.basename(file).match(/^(.+)-day([0-6])\.html$/i);
      if (!match) throw new Error('Expected <location>-day0..6.html filename');
      const hall = LOCATIONS.find(h => [h.id, h.alias].some(a => a.toLowerCase() === match[1].toLowerCase()));
      if (!hall) throw new Error(`Unconfigured restaurant alias: ${match[1]}`);
      const menu = parseMenuHtml(fs.readFileSync(file, 'utf8'), hall, Number(match[2]));
      if (menu.dining_hall.name !== hall.name) throw new Error(`Restaurant heading does not match filename: ${menu.dining_hall.name}`);
      menu.source_files = [relative];
      const preliminary = validateMenu(menu);
      if (preliminary.errors.length) throw new Error(preliminary.errors.join('; '));

      const key = `${hall.id}|${menu.menu_date}`;
      const old = byMenu.get(key);
      if (old && (JSON.stringify(old.stations) !== JSON.stringify(menu.stations) || JSON.stringify(old.hours) !== JSON.stringify(menu.hours))) {
        throw new Error('Conflicting captures for restaurant/date; both originals preserved');
      }
      captures.push({
        file: relative, restaurant: hall.id, date: menu.menu_date, day: menu.menu_day,
        stations: menu.stations.map(s => s.name), foods: preliminary.counts.foods, rows: menu.diagnostics.rows
      });
      if (old) {
        duplicateCaptures.push({ file: relative, same_menu_as: old.source_files[0], rows: menu.diagnostics.rows });
        old.source_files.push(relative);
      } else {
        byMenu.set(key, menu);
      }
    } catch (error) {
      failures.push({ file: relative, error: error.message });
    }
  }

  const menus = [...byMenu.values()].sort((a, b) =>
    `${a.dining_hall.id}|${a.menu_date}`.localeCompare(`${b.dining_hall.id}|${b.menu_date}`));
  const validations = [], generatedFiles = [];
  const save = (relative, data) => {
    write(path.join(dataDir, relative), data);
    generatedFiles.push(relative);
  };
  for (const menu of menus) {
    attachNutrition(menu, dataDir, nutritionCache, nutritionPages);
    validations.push({ restaurant: menu.dining_hall.id, date: menu.menu_date, ...validateMenu(menu) });
    save(`output/menus/${menu.dining_hall.id}-${menu.menu_date}.json`, menu);
  }

  const sum = field => validations.reduce((n, v) => n + v.counts[field], 0);
  const locations = LOCATIONS.filter(h => menus.some(m => m.dining_hall.id === h.id)).map(h => ({
    id: h.id, name: h.name, area: h.area, menus: menus.filter(m => m.dining_hall.id === h.id)
  }));
  const summary = { input_files: files.length, menus: menus.length, locations: locations.length, food_entries: sum('foods') };
  const dataset = { source: 'hdh-web', collection_method: 'saved-html-only', generated_at: new Date().toISOString(), summary, locations };
  const database = transformMenus(menus);
  const databaseErrors = validateDatabase(database);
  const report = {
    database_errors: databaseErrors,
    summary: {
      ...summary,
      errors: databaseErrors.length + failures.length + validations.reduce((n, v) => n + v.errors.length, 0),
      warnings: validations.reduce((n, v) => n + v.warnings.length, 0) + database.warnings.length,
      duplicate_captures: duplicateCaptures.length,
      duplicates: sum('duplicates'),
      merged_occurrences: sum('merged_occurrences'),
      original_food_occurrences: menus.reduce((n, m) => n + m.diagnostics.rows, 0),
      duplicate_capture_rows: duplicateCaptures.reduce((n, c) => n + c.rows, 0),
      unverified_nutrition: sum('unverified_nutrition')
    },
    failures, captures, duplicate_captures: duplicateCaptures, menus: validations,
    coverage: LOCATIONS.map(h => ({
      restaurant: h.id,
      dates: menus.filter(m => m.dining_hall.id === h.id).map(m => m.menu_date),
      saved_day_offsets: [...new Set(menus.filter(m => m.dining_hall.id === h.id).map(m => m.menu_day))],
      missing_day_offsets: [0, 1, 2, 3, 4, 5, 6].filter(d => !menus.some(m => m.dining_hall.id === h.id && m.menu_day === d))
    })),
    database_warnings: database.warnings,
    withheld_database_locations: database.withheld,
    limitations: [
      'Missing day offsets do not prove closure; only saved pages were processed.',
      'Area unknown unless supported by existing project data. No coordinates inferred.',
      'Absent allergen icons do not prove allergen absence.',
      'Current backend models/importer predate Wes PDF: do not import these exports through db:import.',
      'Each database snapshot is independent: Menu_Items has no calendar date field.',
      'Conflicting detailed snapshots are preserved for audit but excluded from database nutrition and ingredients.'
    ]
  };
  if (!files.length) {
    report.failures.push({ error: 'No saved HTML input files' });
    report.summary.errors++;
  }
  if (locations.length < LOCATIONS.length) report.limitations.push(`Only ${locations.length}/10 configured restaurants have captures.`);

  save('output/web-dataset.json', dataset);
  for (const [date, snapshot] of Object.entries(database.snapshots)) {
    for (const collection of ['Locations', 'Foods', 'Menu_Items', 'provenance']) {
      save(`output/mongodb/${date}/${collection}.json`, snapshot[collection]);
    }
  }
  save('reports/validation-report.json', report);
  const pages = [...nutritionPages.values()].sort((a, b) => a.cache_file.localeCompare(b.cache_file));
  save('reports/nutrition-manifest.json', {
    summary: { unique_nutrition_pages: pages.length, saved_pages: pages.filter(p => p.saved).length, missing_pages: pages.filter(p => !p.saved).length },
    pages
  });
  const manifestPath = 'reports/output-manifest.json';
  const manifest = {
    generated_files: [...generatedFiles, manifestPath],
    combined_dataset: 'output/web-dataset.json',
    menus: generatedFiles.filter(f => f.startsWith('output/menus/')),
    database_dates: Object.keys(database.snapshots),
    shareable_export: report.summary.errors ? null : 'exports/hdh-web-validated.zip'
  };
  save(manifestPath, manifest);
  if (!report.summary.errors) packageDataset(dataDir, generatedFiles);
  return { dataset, report, database };
}

if (require.main === module) {
  try {
    const { report } = buildDataset();
    console.log(JSON.stringify(report.summary, null, 2));
    console.log('Offline build complete. Dataset: data/web/output/web-dataset.json. Report: data/web/reports/validation-report.json.');
    if (report.summary.errors) process.exitCode = 1;
  } catch (error) {
    console.error(`Build failed: ${error.message}`);
    process.exitCode = 1;
  }
}
module.exports = { buildDataset, LOCATIONS };
