const { parseNutrition } = require("./nutritionParser");

const fs = require("node:fs");
const path = require("node:path");
const cheerio = require("cheerio");

// Step 1: Read the downloaded HTML
const filePath = path.join(
  __dirname,
  "../../data/web/pines-day0.html"
);

const html = fs.readFileSync(filePath, "utf8");

// Step 2: Load HTML into Cheerio
const $ = cheerio.load(html);

// Step 3: Store unique foods
const foods = new Map();

// Step 4: Select desktop food entries
const foodRows = $(
  ".meal-category .menu-category-section .accordion1 .station-list > .d-none.d-lg-block > .menU-item-row"
);

foodRows.each((index, element) => {

  const row = $(element);

  // Extract food name
  const link = row.find("a.sublocsitem").first();
  const name = link.text().trim();

  // Extract nutrition URL
  const href = link.attr("href");

  if (!name || !href || href === "#") {
    return;
  }

  // Extract food ID
  const sourceItemId = new URL(
    href,
    "https://hdh-web.ucsd.edu"
  ).searchParams.get("id");

  // Extract station
  const station = row
    .closest(".menu-category-section")
    .find("> .accordion-header h3")
    .first()
    .text()
    .trim();

  // Extract category
  const category = row
    .closest(".station-list")
    .prev(".panel-heading")
    .find("a.sublocs")
    .first()
    .text()
    .trim();

  // Extract price
  const priceText = row
    .find(".item-price")
    .first()
    .text()
    .trim();

  const priceCents = priceText
    ? Math.round(parseFloat(priceText.replace("$", "")) * 100)
    : null;

  // Extract calories
  const calorieText = row
    .find(".cals")
    .first()
    .text()
    .trim();

  const calories = calorieText
    ? parseFloat(calorieText)
    : null;

  // Extract allergens and dietary tags
  const tags = row.find("img[title]")
    .map((index, img) => {
      return $(img)
        .attr("title")
        .replace(/^Contains /, "")
        .toLowerCase()
        .replace(/\s+/g, "_");
    })
    .get();

  // Identify duplicates
  const key = `${station}|${sourceItemId}|${name}`;

  if (foods.has(key)) {
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
    nutrition_url: new URL(
      href,
      "https://hdh-web.ucsd.edu"
    ).href
  });

});

// Step 5: Display results
console.log("Desktop food entries:", foodRows.length);
console.log("Unique foods:", foods.size);

// Display one example
const koreanChicken = [...foods.values()].find(
  food => food.name === "Korean Fried Chicken Sandwich"
);

// Read the saved nutrition HTML
const nutritionPath = path.join(
  __dirname,
  "../../data/web/pines-nutrition-6352.html"
);

const nutritionHtml = fs.readFileSync(
  nutritionPath,
  "utf8"
);

// Extract the nutrition information
const nutrition = parseNutrition(nutritionHtml);

// Attach nutrition to the matching food
if (koreanChicken) {

  koreanChicken.nutrition = nutrition;

  console.log("Updated food:");
  console.log(koreanChicken);

} else {

  console.log("Korean Fried Chicken Sandwich not found");

}

// Group foods by station
const stationsByName = new Map();

for (const food of foods.values()) {

  // Create a station if it doesn't exist
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

  // Separate station from food information
  const { station, ...foodData } = food;

  // Add food to its station
  stationsByName.get(station).items.push(foodData);
}

// Create JSON matching Victor's structure
const result = {

  dining_hall: {
    id: "pines",
    name: "Pines",
    type: "dining_hall",
    area: "Muir College"
  },

  stations: [...stationsByName.values()]
};

// Save the JSON file
const outputPath = path.join(
  __dirname,
  "../../data/web/pines-preview.json"
);

fs.writeFileSync(
  outputPath,
  JSON.stringify(result, null, 2)
);

console.log("JSON file saved successfully!");
console.log("Stations:", result.stations.length);
console.log("Foods:", foods.size);