const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const LOCATIONS = [
  { id: "64-degrees", name: "64 Degrees", locId: 2, locDetID: 37 },
  { id: "bistro", name: "Bistro", locId: 13, locDetID: 27 },
  { id: "canyon-vista", name: "Canyon Vista", locId: 10, locDetID: 22 },
  { id: "cecils-faculty-club", name: "Cecil's at Faculty Club", locId: 7, locDetID: 69 },
  { id: "club-med", name: "Club Med", locId: 12, locDetID: 14 },
  { id: "foodworx", name: "Foodworx", locId: 14, locDetID: 13 },
  { id: "oceanview", name: "OceanView", locId: 8, locDetID: 8 },
  { id: "pines", name: "Pines", locId: 3, locDetID: 6 },
  { id: "sixth-college", name: "Restaurants at Sixth College", locId: 4, locDetID: 30 },
  { id: "ventanas", name: "Ventanas", locId: 9, locDetID: 52 }
];

const BASE_URL = "https://hdh-web.ucsd.edu/dining/apps/diningservices/Restaurants/Venue_V3";
const dataDir = path.join(__dirname, "../../data/web");
const rawDir = path.join(dataDir, "raw");
const outputDir = path.join(dataDir, "output");
const nutritionDir = path.join(dataDir, "nutrition");

function runLocal(script) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script)], {
    stdio: "inherit"
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${script} failed. Fix the reported error and try again.`);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[character]);
}

function menuUrl(location, day) {
  const url = new URL(BASE_URL);
  url.searchParams.set("locId", location.locId);
  url.searchParams.set("locDetID", location.locDetID);
  url.searchParams.set("dayNum", day);
  return url.href;
}

try {
  // Existing scripts only read locally saved HTML and JSON.
  runLocal("batchScrape.js");
  runLocal("nutritionManifest.js");

  const menuFiles = fs.readdirSync(outputDir)
    .filter(name => name.endsWith(".json"))
    .sort();

  const byHall = new Map();
  let foodEntries = 0;

  for (const fileName of menuFiles) {
    const menu = JSON.parse(fs.readFileSync(path.join(outputDir, fileName), "utf8"));
    const hall = menu.dining_hall;

    if (!byHall.has(hall.id)) {
      byHall.set(hall.id, {
        id: hall.id,
        name: hall.name,
        area: hall.area,
        menus: []
      });
    }

    foodEntries += menu.stations.reduce(
      (total, station) => total + station.items.length, 0
    );

    byHall.get(hall.id).menus.push({
      menu_day: menu.menu_day,
      menu_date: menu.menu_date,
      menu_date_label: menu.menu_date_label,
      stations: menu.stations
    });
  }

  const locations = [...byHall.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const location of locations) {
    location.menus.sort((a, b) => (a.menu_date || "").localeCompare(b.menu_date || ""));
  }

  const dataset = {
    source: "hdh-web",
    collection_method: "saved-html-only",
    generated_at: new Date().toISOString(),
    summary: {
      locations: locations.length,
      menus: menuFiles.length,
      food_entries: foodEntries
    },
    locations
  };

  const datasetPath = path.join(dataDir, "web-dataset.json");
  fs.writeFileSync(datasetPath, JSON.stringify(dataset, null, 2));

  const nutritionManifest = JSON.parse(
    fs.readFileSync(path.join(dataDir, "nutrition-manifest.json"), "utf8")
  );

  const menuRows = [];
  let savedMenuCount = 0;

  for (const location of LOCATIONS) {
    for (let day = 0; day < 7; day++) {
      const fileName = `${location.id}-day${day}.html`;
      const saved = fs.existsSync(path.join(rawDir, fileName));
      if (saved) savedMenuCount++;

      menuRows.push(`<tr>
        <td>${escapeHtml(location.name)}</td>
        <td>${day}</td>
        <td>${saved ? "Saved" : "Missing"}</td>
        <td><a target="_blank" rel="noopener noreferrer" href="${escapeHtml(menuUrl(location, day))}">Open menu</a></td>
        <td><code>${escapeHtml(fileName)}</code></td>
      </tr>`);
    }
  }

  const nutritionRows = nutritionManifest.pages.map(page => {
    const saved = fs.existsSync(path.join(nutritionDir, page.cache_file));
    const url = new URL(page.url);
    const isHdh = url.protocol === "https:" && url.hostname === "hdh-web.ucsd.edu";

    return `<tr>
      <td>${saved ? "Saved" : "Missing"}</td>
      <td>${isHdh ? `<a target="_blank" rel="noopener noreferrer" href="${escapeHtml(url.href)}">Open nutrition</a>` : "Invalid URL"}</td>
      <td><code>${escapeHtml(page.cache_file)}</code></td>
      <td>${escapeHtml(page.used_by.slice(0, 2).join(", "))}</td>
    </tr>`;
  });

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HDH One-Time Capture Checklist</title>
  <style>
    body { font: 15px system-ui, sans-serif; color: #1d2939; max-width: 1100px; margin: 2rem auto; padding: 0 1rem; }
    h1, h2 { color: #12345b; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
    th, td { padding: .55rem; border: 1px solid #ccd4dd; text-align: left; }
    th { background: #e9f1fa; position: sticky; top: 0; }
    tr:nth-child(even) { background: #f7f9fc; }
    code { font-size: 12px; word-break: break-all; }
    a { color: #0563ba; }
  </style>
</head>
<body>
  <h1>HDH One-Time Capture Checklist</h1>
  <p>This file does not fetch anything automatically. Open a link manually and save HTML to the exact filename under <code>backend/data/web/raw/</code> or <code>backend/data/web/nutrition/</code>.</p>
  <p>Menu pages saved: <strong>${savedMenuCount}/70</strong>. Nutrition pages saved: <strong>${nutritionManifest.summary.saved_pages}/${nutritionManifest.summary.unique_nutrition_pages}</strong>.</p>
  <p>Some locations may be closed or have no published web menu on particular days. Do not treat missing allergen icons as proof an item is allergen-free.</p>
  <h2>Menus (save into data/web/raw/)</h2>
  <table><thead><tr><th>Location</th><th>Day</th><th>Status</th><th>Page</th><th>Save as</th></tr></thead><tbody>
  ${menuRows.join("\n")}
  </tbody></table>
  <h2>Nutrition (save into data/web/nutrition/)</h2>
  <table><thead><tr><th>Status</th><th>Page</th><th>Save as</th><th>Used by</th></tr></thead><tbody>
  ${nutritionRows.join("\n")}
  </tbody></table>
</body>
</html>`;

  const checklistPath = path.join(dataDir, "capture-checklist.html");
  fs.writeFileSync(checklistPath, html);

  console.log(`\nSaved master dataset: ${datasetPath}`);
  console.log(`Saved clickable checklist: ${checklistPath}`);
  console.log(`Locations with data: ${locations.length}/${LOCATIONS.length}`);
  console.log(`Menu HTML files: ${savedMenuCount}/70`);
  console.log(`Food entries: ${foodEntries}`);
  console.log(`Nutrition HTML files: ${nutritionManifest.summary.saved_pages}/${nutritionManifest.summary.unique_nutrition_pages}`);
  console.log("No HTTP requests were made by this script.");
} catch (error) {
  console.error(`Build failed: ${error.message}`);
  process.exitCode = 1;
}
