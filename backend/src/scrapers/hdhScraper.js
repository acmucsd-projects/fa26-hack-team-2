const fs = require("node:fs");
const path = require("node:path");

const { parseMenuHtml } = require("./menuParser");
const { parseNutrition } = require("./nutritionParser");

// Known dining hall locations.
const KNOWN_AREAS = {
  pines: "Muir College",
  "64-degrees": "Revelle College"
};

// Read the dining hall and day from the terminal command.
const [hallId, dayInput] = process.argv.slice(2);

const dayNumber = Number(dayInput);

// Validate the command arguments.
if (
  !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(hallId || "") ||
  !/^[0-6]$/.test(dayInput || "")
) {
  console.error(
    "Usage: node src/scrapers/hdhScraper.js <hall-id> <day 0-6>"
  );

  process.exit(1);
}

// Find the saved HTML file.
const dataDir = path.join(__dirname, "../../data/web");

const inputPath = path.join(
  dataDir,
  "raw",
  `${hallId}-day${dayNumber}.html`
);

// Make sure the HTML file exists.
if (!fs.existsSync(inputPath)) {
  console.error(`Missing saved HTML: ${inputPath}`);
  process.exit(1);
}

// Read the HTML.
const html = fs.readFileSync(inputPath, "utf8");

// Create dining hall information.
const hall = {
  id: hallId,
  name: hallId,
  area: KNOWN_AREAS[hallId] || "unknown"
};

// Extract food information using Cheerio.
const menu = parseMenuHtml(html, hall, dayNumber);

// Add detailed nutrition when a saved nutrition page exists.
let enrichedCount = 0;

for (const station of menu.stations) {
  for (const food of station.items) {
    const nutritionUrl = new URL(food.nutrition_url);

    const recId = nutritionUrl.searchParams.get("recId");

    const cacheName = recId
      ? `${food.source_item_id}-${recId}.html`
      : `${food.source_item_id}.html`;

    const nutritionPath = path.join(
      dataDir,
      "nutrition",
      cacheName
    );

    // Skip foods without saved nutrition HTML.
    if (!fs.existsSync(nutritionPath)) {
      continue;
    }

    // Parse nutrition information.
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

    // Attach detailed nutrition to the food.
    food.nutrition = nutrition;

    enrichedCount++;

    // Check for differences in calorie information.
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

// Create the output folder if necessary.
const outputDir = path.join(dataDir, "output");

fs.mkdirSync(outputDir, { recursive: true });

// Save the JSON file.
const outputPath = path.join(
  outputDir,
  `${hallId}-day${dayNumber}.json`
);

fs.writeFileSync(
  outputPath,
  JSON.stringify(menu, null, 2)
);

// Count foods across all stations.
const foodCount = menu.stations.reduce(
  (count, station) => count + station.items.length,
  0
);

// Print results.
console.log(
  `${menu.dining_hall.name}, day ${dayNumber} (${menu.menu_date_label ?? "date unknown"})`
);

console.log(`Stations: ${menu.stations.length}`);

console.log(`Unique foods: ${foodCount}`);

console.log(
  `Foods with detailed nutrition: ${enrichedCount}/${foodCount}`
);

console.log(`Saved: ${outputPath}`);