const fs = require("node:fs");
const path = require("node:path");

const { parseMenuHtml } = require("./menuParser");
const { parseNutrition } = require("./nutritionParser");

// --------------------------------------------------
// 1. Configure dining halls
// --------------------------------------------------

const HALLS = {

  pines: {
    id: "pines",
    name: "Pines",
    area: "Muir College"
  },

  "64-degrees": {
    id: "64-degrees",
    name: "64 Degrees",
    area: "Revelle College"
  }

};

// --------------------------------------------------
// 2. Read command-line arguments
// --------------------------------------------------

const [hallId, dayInput] = process.argv.slice(2);

const dayNumber = Number(dayInput);

if (
  !HALLS[hallId] ||
  !Number.isInteger(dayNumber) ||
  dayNumber < 0 ||
  dayNumber > 6
) {

  console.error(
    "Usage: node src/scrapers/hdhScraper.js <pines|64-degrees> <day 0-6>"
  );

  process.exit(1);

}

// --------------------------------------------------
// 3. Read the saved HTML
// --------------------------------------------------

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

const html = fs.readFileSync(inputPath, "utf8");

// --------------------------------------------------
// 4. Parse the menu
// --------------------------------------------------

const menu = parseMenuHtml(
  html,
  HALLS[hallId],
  dayNumber
);

// --------------------------------------------------
// 5. Add detailed nutrition
// --------------------------------------------------

let enrichedCount = 0;

for (const station of menu.stations) {

  for (const food of station.items) {

    const nutritionUrl = new URL(food.nutrition_url);

    const recId = nutritionUrl.searchParams.get("recId");

    // Create the filename for the saved nutrition page
    const cacheName = recId
      ? `${food.source_item_id}-${recId}.html`
      : `${food.source_item_id}.html`;

    const nutritionPath = path.join(
      dataDir,
      "nutrition",
      cacheName
    );

    // Skip foods without a saved nutrition file
    if (!fs.existsSync(nutritionPath)) {
      continue;
    }

    // Read and parse nutrition
    const nutritionHtml = fs.readFileSync(
      nutritionPath,
      "utf8"
    );

    const nutrition = parseNutrition(nutritionHtml);

    const hasData =
      nutrition.calorie !== null ||
      Object.values(nutrition.macros).some(
        value => value !== null
      );

    if (!hasData) {

      console.warn(
        `No detailed nutrition found for ${food.name}`
      );

      continue;

    }

    // Attach nutrition
    food.nutrition = nutrition;

    enrichedCount++;

    // Check for calorie inconsistencies
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

// --------------------------------------------------
// 6. Save the JSON
// --------------------------------------------------

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

// --------------------------------------------------
// 7. Print results
// --------------------------------------------------

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