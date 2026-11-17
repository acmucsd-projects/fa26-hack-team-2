const fs = require('node:fs');
const path = require('node:path');
const { parseMenuHtml } = require('./menuParser');
const { validateMenu } = require('./validateMenu');

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

function htmlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symlink input is not allowed: ${file}`);
      return entry.isDirectory() ? htmlFiles(file) : /\.html?$/i.test(entry.name) ? [file] : [];
    });
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function buildDataset(dataDir = path.join(__dirname, '../../data/web')) {
  const files = htmlFiles(path.join(dataDir, 'raw'));
  const failures = [], checks = [];
  const byMenu = new Map();
  let duplicateCaptures = 0;
  let duplicateRows = 0;

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
      const check = validateMenu(menu);
      if (check.errors.length) throw new Error(check.errors.join('; '));

      const key = `${hall.id}|${menu.menu_date}`;
      const old = byMenu.get(key);
      if (old) {
        if (JSON.stringify(old.stations) !== JSON.stringify(menu.stations) || JSON.stringify(old.hours) !== JSON.stringify(menu.hours)) {
          throw new Error('Conflicting captures for restaurant/date');
        }
        old.source_files.push(relative);
        duplicateCaptures++;
        duplicateRows += menu.diagnostics.rows;
      } else {
        byMenu.set(key, menu);
        checks.push({ file: relative, ...check });
      }
    } catch (error) {
      failures.push({ file: relative, error: error.message });
    }
  }
  if (!files.length) failures.push({ error: 'No saved restaurant HTML found in data/web/raw/' });

  const menus = [...byMenu.values()].sort((a, b) =>
    `${a.dining_hall.id}|${a.menu_date}`.localeCompare(`${b.dining_hall.id}|${b.menu_date}`));
  const sum = field => checks.reduce((n, check) => n + check.counts[field], 0);
  const locations = LOCATIONS.filter(h => menus.some(m => m.dining_hall.id === h.id)).map(h => ({
    id: h.id, name: h.name, area: h.area, menus: menus.filter(m => m.dining_hall.id === h.id)
  }));
  const dataset = {
    source: 'hdh-web', collection_method: 'saved-html-only', generated_at: new Date().toISOString(),
    summary: { input_files: files.length, menus: menus.length, locations: locations.length, food_entries: sum('foods') },
    locations
  };
  const missingLocations = LOCATIONS.filter(h => !locations.some(l => l.id === h.id)).map(h => h.id);
  // Validation stays active, but results are printed rather than saved as reports.
  const validation = {
    summary: {
      ...dataset.summary, errors: failures.length,
      warnings: checks.reduce((n, check) => n + check.warnings.length, 0) + (missingLocations.length ? 1 : 0),
      missing_prices: sum('missing_prices'), missing_calories: sum('missing_calories'),
      original_food_occurrences: menus.reduce((n, m) => n + m.diagnostics.rows, 0),
      merged_occurrences: sum('merged_occurrences'), duplicates: sum('duplicates'),
      duplicate_captures: duplicateCaptures, duplicate_capture_rows: duplicateRows
    },
    failures, menus: checks, missing_locations: missingLocations
  };

  // Do not replace a successful output with partial data after a parse failure.
  if (!validation.summary.errors) {
    const menuDir = path.join(dataDir, 'output/menus');
    const expected = new Set(menus.map(m => `${m.dining_hall.id}-${m.menu_date}.json`));
    if (fs.existsSync(menuDir)) {
      for (const name of fs.readdirSync(menuDir)) {
        if (LOCATIONS.some(h => name.startsWith(`${h.id}-`)) && /^.+-\d{4}-\d{2}-\d{2}\.json$/.test(name) && !expected.has(name)) {
          fs.unlinkSync(path.join(menuDir, name));
        }
      }
    }
    for (const menu of menus) writeJson(path.join(menuDir, `${menu.dining_hall.id}-${menu.menu_date}.json`), menu);
    writeJson(path.join(dataDir, 'output/web-dataset.json'), dataset);
  }
  return { dataset, validation };
}

if (require.main === module) {
  try {
    const { validation } = buildDataset();
    console.log(JSON.stringify(validation.summary, null, 2));
    for (const failure of validation.failures) console.error(`${failure.file || 'Inputs'}: ${failure.error}`);
    for (const check of validation.menus) for (const warning of check.warnings) console.warn(`${check.file}: ${warning}`);
    if (validation.missing_locations.length) console.warn(`Missing locations: ${validation.missing_locations.join(', ')}`);
    if (validation.summary.errors) process.exitCode = 1;
    else console.log('Saved data/web/output/web-dataset.json and individual menu JSON. No HTTP requests or database writes.');
  } catch (error) {
    console.error(`Build failed: ${error.message}`);
    process.exitCode = 1;
  }
}
module.exports = { buildDataset, LOCATIONS };
