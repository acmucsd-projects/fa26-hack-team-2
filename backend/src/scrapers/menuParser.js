const cheerio = require("cheerio");

// Extract a number from text
function parseNumber(text) {
  const match = text.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

// Parse a dining hall's menu HTML
function parseMenuHtml(html, hall, dayNumber) {

  const $ = cheerio.load(html);

  const uniqueFoods = new Map();

  // Select desktop food entries
  const foodRows = $(
    ".meal-category .menu-category-section .accordion1 .station-list > .d-none.d-lg-block > .menU-item-row"
  );

  foodRows.each((index, element) => {

    const row = $(element);

    // Food name and nutrition link
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

    // Breakfast, lunch, dinner, brunch, etc.
    const mealPeriod = row
      .closest(".meal-category")
      .attr("id")
      ?.toLowerCase() ?? "unknown";

    // Price
    const priceDollars = parseNumber(
      row.find(".item-price").first().text()
    );

    const priceCents = priceDollars === null
      ? null
      : Math.round(priceDollars * 100);

    // Calories
    const calories = parseNumber(
      row.find(".cals").first().text()
    );

    // Allergen and dietary tags
    const tags = row
      .find("img[title]")
      .map((index, image) => {

        return $(image)
          .attr("title")
          .replace(/^Contains /, "")
          .replace(/TreeNuts/i, "Tree Nuts")
          .toLowerCase()
          .replace(/\s+/g, "_");

      })
      .get();

    // Identify duplicates
    const key = `${station}|${name}|${nutritionUrl.href}`;

    const existing = uniqueFoods.get(key);

    if (existing) {

      // Preserve all meal periods
      if (!existing.meal_periods.includes(mealPeriod)) {
        existing.meal_periods.push(mealPeriod);
      }

      // Preserve the price listed for each meal period
      existing.prices_by_meal_period[mealPeriod] = priceCents;

      // Use an available price if the previous one was missing
      if (
        existing.price_cents === null &&
        priceCents !== null
      ) {

        existing.price_cents = priceCents;

      } else if (
        existing.price_cents !== null &&
        priceCents !== null &&
        existing.price_cents !== priceCents
      ) {

        console.warn(
          `Different prices for ${station} / ${name}`
        );

      }

      return;
    }

    // Store new food
    uniqueFoods.set(key, {

      station,
      category,
      name,

      price_cents: priceCents,
      calories,
      tags,

      source_item_id: sourceItemId,
      nutrition_url: nutritionUrl.href,

      meal_periods: [mealPeriod],

      prices_by_meal_period: {
        [mealPeriod]: priceCents
      }

    });

  });

  // Group foods by station
  const stations = new Map();

  for (const food of uniqueFoods.values()) {

    if (!stations.has(food.station)) {

      const slug = food.station
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      stations.set(food.station, {

        id: `${hall.id}-${slug}`,
        name: food.station,
        hours: null,
        items: []

      });

    }

    const { station, ...item } = food;

    stations.get(station).items.push(item);

  }

  // Find the date label displayed by HDH
  const dateLabel = $(`#buta${dayNumber}`)
    .text()
    .replace(/\s+/g, " ")
    .trim() || null;

  // Return JSON in our staging format
  return {

    dining_hall: {
      id: hall.id,
      name: hall.name,
      type: "dining_hall",
      area: hall.area
    },

    source: "hdh-web",
    menu_day: dayNumber,
    menu_date_label: dateLabel,

    stations: [...stations.values()]

  };

}

module.exports = { parseMenuHtml };