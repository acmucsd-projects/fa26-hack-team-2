const fs = require("node:fs");
const path = require("node:path");
const { TAGS } = require("../constants/tags");

const outputDir = path.join(__dirname, "../../data/web/output");

const allowedTags = new Set(TAGS);

const args = process.argv.slice(2);

// Check command-line arguments.
if (
  args.length !== 0 &&
  (args.length !== 2 || !/^[0-6]$/.test(args[1]))
) {
  console.error(
    "Usage: node src/scrapers/validateMenu.js [<hall-id> <day 0-6>]"
  );
  process.exit(1);
}

// Check whether the output folder exists.
if (!fs.existsSync(outputDir)) {
  console.error(`Output folder not found: ${outputDir}`);
  process.exit(1);
}

// Validate one specified file, or every JSON file.
const fileNames =
  args.length === 2
    ? [`${args[0]}-day${args[1]}.json`]
    : fs
        .readdirSync(outputDir)
        .filter((name) => name.endsWith(".json"))
        .sort();

if (fileNames.length === 0) {
  console.error("No JSON menus found. Run hdhScraper.js first.");
  process.exit(1);
}

let totalErrors = 0;

for (const fileName of fileNames) {
  const filePath = path.join(outputDir, fileName);

  if (!fs.existsSync(filePath)) {
    console.error(`Missing output file: ${filePath}`);
    totalErrors++;
    continue;
  }

  let menu;

  try {
    menu = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`Could not read ${fileName}: ${error.message}`);
    totalErrors++;
    continue;
  }

  const stats = {
    foods: 0,
    missingNames: 0,
    missingPrices: 0,
    missingCalories: 0,
    detailedNutrition: 0,
    invalidTags: 0,
    invalidValues: 0,
    duplicates: 0
  };

  if (!menu.dining_hall?.name || !Array.isArray(menu.stations)) {
    console.error(`${fileName}: invalid dining hall or stations`);
    totalErrors++;
    continue;
  }

  for (const station of menu.stations) {
    if (!station.name || !Array.isArray(station.items)) {
      console.error(`${fileName}: invalid station`);
      totalErrors++;
      continue;
    }

    const seen = new Set();

    for (const food of station.items) {
      stats.foods++;

      const foodName = food?.name || "(unnamed food)";

      // Check food name.
      if (!food?.name?.trim()) {
        stats.missingNames++;
      }

      // Check price.
      if (food?.price_cents == null) {
        stats.missingPrices++;
      } else if (
        !Number.isInteger(food.price_cents) ||
        food.price_cents < 0
      ) {
        console.error(`Invalid price: ${foodName}`);
        stats.invalidValues++;
      }

      // Check calories.
      if (food?.calories == null) {
        stats.missingCalories++;
      } else if (
        typeof food.calories !== "number" ||
        !Number.isFinite(food.calories) ||
        food.calories < 0
      ) {
        console.error(`Invalid calories: ${foodName}`);
        stats.invalidValues++;
      }

      // Check allergen and dietary tags.
      if (!Array.isArray(food?.tags)) {
        console.error(`Missing tags array: ${foodName}`);
        stats.invalidTags++;
      } else {
        const invalid = food.tags.filter(
          (tag) => !allowedTags.has(tag)
        );

        if (invalid.length > 0) {
          console.error(
            `Invalid tags for ${foodName}: ${invalid.join(", ")}`
          );

          stats.invalidTags += invalid.length;
        }
      }

      // Check source information.
      if (!food?.source_item_id || !food?.nutrition_url) {
        console.error(`Missing source information: ${foodName}`);
        stats.invalidValues++;
      }

      // Check for duplicate foods in the same station.
      const key = `${food?.source_item_id}|${food?.name}|${food?.nutrition_url}`;

      if (seen.has(key)) {
        console.error(`Duplicate food: ${foodName}`);
        stats.duplicates++;
      }

      seen.add(key);

      // Check detailed nutrition.
      if (food?.nutrition) {
        const nutrition = food.nutrition;

        const values = [
          nutrition.calorie,
          nutrition.fat_cal,
          nutrition.macros?.protein,
          nutrition.macros?.carb,
          nutrition.macros?.fat,
          nutrition.sat_fat,
          nutrition.trans_fat,
          nutrition.cholesterol,
          nutrition.sodium,
          nutrition.serving_size,
          nutrition.fiber,
          nutrition.sugar
        ];

        const invalidNutrition = values.some(
          (value) =>
            value != null &&
            (
              typeof value !== "number" ||
              !Number.isFinite(value) ||
              value < 0
            )
        );

        if (invalidNutrition) {
          console.error(`Invalid nutrition: ${foodName}`);
          stats.invalidValues++;
        }

        stats.detailedNutrition++;
      }
    }
  }

  const errors =
    stats.missingNames +
    stats.invalidTags +
    stats.invalidValues +
    stats.duplicates;

  totalErrors += errors;

  console.log(`\n${fileName}`);
  console.log("-----------------------");
  console.log(`Dining hall: ${menu.dining_hall.name}`);
  console.log(`Menu day: ${menu.menu_day}`);
  console.log(`Stations: ${menu.stations.length}`);
  console.log(`Total foods: ${stats.foods}`);
  console.log(`Missing names: ${stats.missingNames}`);
  console.log(`Missing prices: ${stats.missingPrices}`);
  console.log(`Missing calories: ${stats.missingCalories}`);
  console.log(
    `Foods with detailed nutrition: ${stats.detailedNutrition}`
  );
  console.log(`Invalid tags: ${stats.invalidTags}`);
  console.log(`Invalid values: ${stats.invalidValues}`);
  console.log(`Duplicate foods: ${stats.duplicates}`);
  console.log(`Errors: ${errors}`);
}

console.log(
  `\nValidated ${fileNames.length} menu file(s); total errors: ${totalErrors}`
);

if (totalErrors > 0) {
  process.exitCode = 1;
}