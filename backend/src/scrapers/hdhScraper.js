const fs = require("node:fs");
const path = require("node:path");
const cheerio = require("cheerio");

const { parseNutrition } = require("./nutritionParser");

// --------------------------------------------------
// 1. Read the downloaded menu HTML
// --------------------------------------------------

const dataDir = path.join(__dirname, "../../data/web");

const menuPath = path.join(dataDir, "pines-day0.html");

const html = fs.readFileSync(menuPath, "utf8");

const $ = cheerio.load(html);


// --------------------------------------------------
// 2. Extract food information
// --------------------------------------------------

const foods = new Map();

// Select desktop food listings only
const foodRows = $(
  ".meal-category .menu-category-section .accordion1 .station-list > .d-none.d-lg-block > .menU-item-row"
);

foodRows.each((index, element) => {

  const row = $(element);

  // Food name
  const link = row.find("a.sublocsitem").first();

  const name = link.text().trim();

  const href = link.attr("href");

  if (!name || !href || href === "#") {
    return;
  }

  // HDH food identifier
  const nutritionUrl = new URL(
    href,
    "https://hdh-web.ucsd.edu"
  );

  const sourceItemId = nutritionUrl.searchParams.get("id");

  if (!sourceItemId) {
    return;
  }

  // Station name
  const station = row
    .closest(".menu-category-section")
    .find("> .accordion-header h3")
    .first()
    .text()
    .trim();

  // Food category
  const category = row
    .closest(".station-list")
    .prev(".panel-heading")
    .find("a.sublocs")
    .first()
    .text()
    .trim();

  // Meal period
  const mealPeriod = row
    .closest(".meal-category")
    .attr("id")
    ?.toLowerCase() ?? "unknown";

  // Price
  const priceText = row
    .find(".item-price")
    .first()
    .text()
    .trim();

  const priceValue = priceText
    ? parseFloat(priceText.replace("$", ""))
    : null;

  const priceCents = Number.isFinite(priceValue)
    ? Math.round(priceValue * 100)
    : null;

  // Calories
  const calorieText = row
    .find(".cals")
    .first()
    .text()
    .trim();

  const calorieValue = calorieText
    ? parseFloat(calorieText)
    : null;

  const calories = Number.isFinite(calorieValue)
    ? calorieValue
    : null;

  // Allergen and dietary tags
  const tags = row
  .find("img[title]")
  .map((index, img) => {

    return $(img)
      .attr("title")
      .replace(/^Contains /, "")
      .replace(/TreeNuts/i, "Tree Nuts")
      .toLowerCase()
      .replace(/\s+/g, "_");

  })
  .get();

  // Unique identifier for this food at this station
  const key = `${station}|${sourceItemId}|${name}`;

  // If the food already exists, preserve its meal period
  if (foods.has(key)) {

    const existingFood = foods.get(key);

    if (!existingFood.meal_periods.includes(mealPeriod)) {
      existingFood.meal_periods.push(mealPeriod);
    }

    return;
  }

  // Save the food
  foods.set(key, {

    name,
    station,
    category,

    price_cents: priceCents,
    calories,
    tags,

    source_item_id: sourceItemId,
    nutrition_url: nutritionUrl.href,

    meal_periods: [mealPeriod]

  });

});

console.log("Desktop food entries:", foodRows.length);
console.log("Unique foods:", foods.size);


// --------------------------------------------------
// 3. Add detailed nutrition information
// --------------------------------------------------

const nutritionDir = path.join(dataDir, "nutrition");

let enrichedCount = 0;

// Check every unique food
for (const food of foods.values()) {

  // Find its saved nutrition HTML file
  const nutritionPath = path.join(
    nutritionDir,
    `${food.source_item_id}.html`
  );

  // Skip foods without a saved nutrition page
  if (!fs.existsSync(nutritionPath)) {
    continue;
  }

  // Read the nutrition HTML
  const nutritionHtml = fs.readFileSync(
    nutritionPath,
    "utf8"
  );

  // Parse the nutrition information
  const nutrition = parseNutrition(nutritionHtml);

  // Check that the page contained useful nutrition data
  const hasNutrition =
    nutrition.calorie !== null ||
    Object.values(nutrition.macros).some(
      value => value !== null
    );

  if (!hasNutrition) {

    console.warn(
      `Nutrition unavailable for ${food.name}`
    );

    continue;
  }

  // Attach nutrition to the food
  food.nutrition = nutrition;

  enrichedCount++;

  // Warn if menu calories and nutrition calories differ
  if (
    food.calories !== null &&
    nutrition.calorie !== null &&
    food.calories !== nutrition.calorie
  ) {

    console.warn(
      `Calorie mismatch for ${food.name}`
    );

  }

}

console.log(
  `Foods with detailed nutrition: ${enrichedCount}/${foods.size}`
);


// --------------------------------------------------
// 4. Organize foods by station
// --------------------------------------------------

const stationsByName = new Map();

for (const food of foods.values()) {

  if (!stationsByName.has(food.station)) {

    const stationId = "pines-" + food.station
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    stationsByName.set(food.station, {

      id: stationId,
      name: food.station,
      hours: null,
      items: []

    });

  }

  // Remove station from the individual food object
  const { station, ...foodData } = food;

  // Add food to its station
  stationsByName.get(station).items.push(foodData);

}


// --------------------------------------------------
// 5. Create JSON in Victor's format
// --------------------------------------------------

const result = {

  dining_hall: {

    id: "pines",
    name: "Pines",
    type: "dining_hall",
    area: "Muir College"

  },

  stations: [...stationsByName.values()]

};


// --------------------------------------------------
// 6. Save JSON to data/web
// --------------------------------------------------

const outputPath = path.join(
  dataDir,
  "pines-preview.json"
);

fs.writeFileSync(
  outputPath,
  JSON.stringify(result, null, 2)
);

console.log("JSON file saved successfully!");
console.log("Stations:", result.stations.length);
console.log("Foods:", foods.size);