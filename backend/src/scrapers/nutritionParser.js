const cheerio = require("cheerio");

function parseNutrition(html) {

  // Load the nutrition page
  const $ = cheerio.load(html);

  // Extract the first number from some text
  function numberFrom(text) {
    const match = text.match(/\d+(?:\.\d+)?/);

    return match ? Number(match[0]) : null;
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
    serving_size: numberFrom(servingText),
    fiber: getNutrient("Dietary Fiber"),
    sugar: getNutrient("Sugars")
  };
}

module.exports = { parseNutrition };