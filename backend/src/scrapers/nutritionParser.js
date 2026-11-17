const cheerio = require("cheerio");
const { parseNumber } = require("./menuParser");

function parseNutrition(html) {

  // Load the nutrition page
  const $ = cheerio.load(html);

  // Extract the first number from some text
  function numberFrom(text) {
    return parseNumber(text);
  }

  // Extract calories from the first table
  function getSummary(label) {

    const row = $(
      'table[summary="Amount per serving"] tbody tr'
    ).filter((index, element) => {
      return $(element)
        .find("th")
        .first()
        .text()
        .trim() === label;
    }).first();

    return numberFrom(row.find("td").first().text());
  }

  // Get the nutrition cells from the second table
  const cells = $(
    'table[summary="Nutrition Values per serving size"] tbody td'
  ).map((index, element) => {
    return $(element).text().replace(/\s+/g, " ").trim();
  }).get();

  // Find a nutrition value by its label
  function getNutrient(label) {

    const cell = cells.find(text =>
      text.startsWith(`${label} `)
    );

    return cell ? numberFrom(cell.slice(label.length)) : null;
  }

  // Extract serving size
  const servingText = $("p").filter((index, element) => {
    return $(element)
      .text()
      .trim()
      .startsWith("Serving Size");
  }).first().text();

  // Return the nutrition information
  return {
    calorie: getSummary("Calories"),

    fat_cal: getSummary("Calories from Fat"),

    macros: {
      protein: getNutrient("Protein"),
      carb: getNutrient("Tot. Carb."),
      fat: getNutrient("Total Fat")
    },

    sat_fat: getNutrient("Sat. Fat"),
    trans_fat: getNutrient("Trans Fat"),
    cholesterol: getNutrient("Cholesterol"),
    sodium: getNutrient("Sodium"),
    serving_size: /\boz\b/i.test(servingText) ? numberFrom(servingText) : null,
    serving_size_text: servingText.trim() || null,
    ingredients: $("h2").filter((_, e) => $(e).text().trim() === "Ingredients").first().next("p").text().trim() || null,
    fiber: getNutrient("Dietary Fiber"),
    sugar: getNutrient("Sugars")
  };
}

function nutritionCacheFileName(nutritionUrl) {
  const url = new URL(nutritionUrl);

  // Only accept URLs from HDH's nutrition website.
  if (
    url.protocol !== "https:" ||
    url.hostname !== "hdh-web.ucsd.edu" ||
    !/^\/dining\/apps\/diningservices\/Nutrition\/Nutritionfacts2$/i.test(url.pathname) || url.username || url.password || url.port
  ) {
    throw new Error(
      `Unexpected nutrition website: ${nutritionUrl}`
    );
  }

  const itemId = url.searchParams.get("id");
  const recId = url.searchParams.get("recId");

  if (!/^\d+$/.test(itemId || "")) {
    throw new Error(
      `Invalid nutrition item ID: ${nutritionUrl}`
    );
  }

  // Encode special characters so filenames are safe.
  return recId
    ? `${itemId}-${encodeURIComponent(recId)}.html`
    : `${itemId}.html`;
}

// A URL/item ID does not prove a saved snapshot matches a particular menu date.
function nutritionConflict(item) {
  const menuCalories = item.calories;
  const snapshotCalories = item.nutrition?.calorie;
  if (menuCalories == null || snapshotCalories == null || menuCalories === snapshotCalories) return null;
  return {
    reason: 'calorie_mismatch',
    menu_calories: menuCalories,
    snapshot_calories: snapshotCalories
  };
}

// Recheck the values here as well as the status so callers cannot accidentally
// export a conflicting snapshot just because it has not been annotated yet.
function usableNutrition(item) {
  return item.nutrition_status === 'unverified' || nutritionConflict(item) ? null : item.nutrition;
}

module.exports = { parseNutrition, nutritionCacheFileName, nutritionConflict, usableNutrition };