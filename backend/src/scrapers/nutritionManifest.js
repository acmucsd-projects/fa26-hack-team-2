const fs = require("node:fs");
const path = require("node:path");

const { nutritionCacheFileName } = require("./nutritionCache");

const dataDir = path.join(__dirname, "../../data/web");

const outputDir = path.join(dataDir, "output");

const nutritionDir = path.join(dataDir, "nutrition");

// Check for generated JSON menus.
if (!fs.existsSync(outputDir)) {
  console.error(
    "Missing data/web/output. Run the menu scraper first."
  );

  process.exit(1);
}

// Find all generated menu files.
const jsonFiles = fs.readdirSync(outputDir)
  .filter((fileName) => fileName.endsWith(".json"))
  .sort();

if (jsonFiles.length === 0) {
  console.error("No generated menu JSON files found.");
  process.exit(1);
}

const nutritionPages = new Map();

let totalFoodEntries = 0;

// Look through every dining hall and food.
for (const fileName of jsonFiles) {
  const filePath = path.join(outputDir, fileName);

  const menu = JSON.parse(
    fs.readFileSync(filePath, "utf8")
  );

  for (const station of menu.stations) {
    for (const food of station.items) {
      totalFoodEntries++;

      const cacheFile = nutritionCacheFileName(
        food.nutrition_url
      );

      const source =
        `${menu.dining_hall.name} / ${food.name}`;

      // Store each nutrition page only once.
      if (!nutritionPages.has(cacheFile)) {
        nutritionPages.set(cacheFile, {
          cache_file: cacheFile,
          url: food.nutrition_url,
          used_by: new Set()
        });
      }

      nutritionPages.get(cacheFile).used_by.add(source);
    }
  }
}

// Check which HTML files have already been saved.
const pages = [...nutritionPages.values()]
  .map((page) => ({
    cache_file: page.cache_file,
    url: page.url,
    saved: fs.existsSync(
      path.join(nutritionDir, page.cache_file)
    ),
    used_by: [...page.used_by].sort()
  }))
  .sort((a, b) =>
    a.cache_file.localeCompare(b.cache_file)
  );

// Calculate totals.
const savedCount = pages.filter(
  (page) => page.saved
).length;

const missingCount = pages.length - savedCount;

// Build the manifest.
const manifest = {
  summary: {
    menu_files: jsonFiles.length,
    total_food_entries: totalFoodEntries,
    unique_nutrition_pages: pages.length,
    saved_pages: savedCount,
    missing_pages: missingCount
  },
  pages
};

// Save the manifest as JSON.
const manifestPath = path.join(
  dataDir,
  "nutrition-manifest.json"
);

fs.writeFileSync(
  manifestPath,
  JSON.stringify(manifest, null, 2)
);

// Print results.
console.log(`Menu files: ${jsonFiles.length}`);

console.log(`Food entries: ${totalFoodEntries}`);

console.log(
  `Unique nutrition pages: ${pages.length}`
);

console.log(`Saved HTML pages: ${savedCount}`);

console.log(`Missing HTML pages: ${missingCount}`);

console.log(`Manifest saved: ${manifestPath}`);

// Show a few missing nutrition pages.
console.log("\nFirst 5 missing nutrition pages:");

for (const page of pages.filter(
  (page) => !page.saved
).slice(0, 5)) {
  console.log(
    `  ${page.cache_file}: ${page.url}`
  );
}