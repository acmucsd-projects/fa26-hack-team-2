const fs = require("node:fs");
const path = require("node:path");

const { TAGS } = require("../constants/tags");

// Find the generated JSON
const filePath = path.join(
  __dirname,
  "../../data/web/pines-preview.json"
);

// Read and parse JSON
const menu = JSON.parse(
  fs.readFileSync(filePath, "utf8")
);

// Counters
let totalFoods = 0;
let missingNames = 0;
let missingPrices = 0;
let missingCalories = 0;
let detailedNutrition = 0;
let invalidTags = 0;

// Check every station
for (const station of menu.stations) {

  // Check every food
  for (const food of station.items) {

    totalFoods++;

    // Check name
    if (!food.name) {
      missingNames++;
    }

    // Check price
    if (
      !Number.isInteger(food.price_cents) ||
      food.price_cents < 0
    ) {
      missingPrices++;
    }

    // Check calories
    if (
      !Number.isFinite(food.calories) ||
      food.calories < 0
    ) {
      missingCalories++;
    }

    // Check detailed nutrition
    if (food.nutrition) {
      detailedNutrition++;
    }

    // Check tag names against Victor's allowed tags
    const unknownTags = (food.tags || []).filter(
      tag => !TAGS.includes(tag)
    );

    if (unknownTags.length > 0) {

      invalidTags += unknownTags.length;

      console.warn(
        `Invalid tags for ${food.name}: ${unknownTags.join(", ")}`
      );

    }

  }

}

// Display results
console.log("\nMenu Validation Results");
console.log("-----------------------");

console.log("Dining hall:", menu.dining_hall.name);
console.log("Stations:", menu.stations.length);
console.log("Total foods:", totalFoods);

console.log("Missing names:", missingNames);
console.log("Missing prices:", missingPrices);
console.log("Missing calories:", missingCalories);

console.log("Foods with detailed nutrition:", detailedNutrition);
console.log("Invalid tags:", invalidTags);