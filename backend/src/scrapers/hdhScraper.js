const fs = require("node:fs");
const path = require("node:path");

const { parseMenuHtml } = require("./menuParser");
const { parseNutrition } = require("./nutritionParser");
const { nutritionCacheFileName } = require("./nutritionCache");

const KNOWN_AREAS = {
  pines: "Muir College",
  "64-degrees": "Revelle College"
};

const [hallId, dayInput] = process.argv.slice(2);

const dayNumber = Number(dayInput);

// Validate command arguments.
if (
  !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(hallId || "") ||
  !/^[0-6]$/.test(dayInput || "")
) {
  console.error(
    "Usage: node src/scrapers/hdhScraper.js <hall-id> <day 0-6>"
  );

  process.exit(1);
}

// Locate the saved HTML.
const dataDir = path.join(__dirname, "../../data/web");

const inputPath = path.join(
  dataDir,
  "raw",
  `${hallId}-day${dayNumber}.html`
);

if (!fs.existsSync(inputPath)) {
  console.error(`Missing saved HTML: ${inputPath}`);
  process.exit(1);
}

// Parse the dining hall menu.
const html = fs.readFileSync(inputPath, "utf8");

const hall = {
  id: hallId,
  name: hallId,
  area: KNOWN_AREAS[hallId] || "unknown"
};

const menu = parseMenuHtml(html, hall, dayNumber);

// Attach detailed nutrition when saved HTML exists.
let enrichedCount = 0;

for (const station of menu.stations) {
  for (const food of station.items) {
    const cacheName = nutritionCacheFileName(
      food.nutrition_url
    );

    const nutritionPath = path.join(
      dataDir,
      "nutrition",
      cacheName
    );

    if (!fs.existsSync(nutritionPath)) {
      continue;
    }

    const nutritionHtml = fs.readFileSync(
      nutritionPath,
      "utf8"
    );

    const nutrition = parseNutrition(nutritionHtml);

    const hasData =
      nutrition.calorie !== null ||
      Object.values(nutrition.macros).some(
        (value) => value !== null
      );

    if (!hasData) {
      console.warn(
        `No detailed nutrition found for ${food.name}`
      );

      continue;
    }

    food.nutrition = nutrition;

    enrichedCount++;

    if (
      food.calories !== null &&
      nutrition.calorie !== null &&
      food.calories !== nutrition.calorie
    ) {
      console.warn(
        `Calorie mismatch for ${station.name} / ${food.name}`
      );
    }
  }
}

// Save the output JSON.
const outputDir = path.join(dataDir, "output");

fs.mkdirSync(outputDir, { recursive: true });

const outputPath = path.join(
  outputDir,
  `${hallId}-day${dayNumber}.json`
);

fs.writeFileSync(
  outputPath,
  JSON.stringify(menu, null, 2)
);

// Print results.
const foodCount = menu.stations.reduce(
  (count, station) => count + station.items.length,
  0
);

console.log(
  `${menu.dining_hall.name}, day ${dayNumber} (${menu.menu_date_label ?? "date unknown"})`
);

console.log(`Stations: ${menu.stations.length}`);

console.log(`Unique foods: ${foodCount}`);

console.log(
  `Foods with detailed nutrition: ${enrichedCount}/${foodCount}`
);

console.log(`Saved: ${outputPath}`);