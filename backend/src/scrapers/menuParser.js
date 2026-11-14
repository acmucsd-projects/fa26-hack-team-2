const cheerio = require("cheerio");

// Extract the first number from text.
function parseNumber(text) {
  const match = text.match(/\d+(?:\.\d+)?/);

  return match ? Number(match[0]) : null;
}

// Convert HTML into structured dining hall data.
function parseMenuHtml(html, hall, dayNumber) {
  const $ = cheerio.load(html);

  const uniqueFoods = new Map();

  // Select desktop food entries.
  const foodRows = $(
    ".meal-category .menu-category-section .accordion1 .station-list > .d-none.d-lg-block > .menU-item-row"
  );

  if (foodRows.length === 0) {
    throw new Error(
      "No food rows found. Check that this is an HDH menu page."
    );
  }

  // Process each food entry.
  foodRows.each((_, element) => {
    const row = $(element);

    const link = row.find("a.sublocsitem").first();

    const name = link.text().trim();

    const href = link.attr("href");

    if (!name || !href || href === "#") {
      return;
    }

    // Extract the nutrition URL and HDH food ID.
    const nutritionUrl = new URL(
      href,
      "https://hdh-web.ucsd.edu"
    );

    const sourceItemId = nutritionUrl.searchParams.get("id");

    if (!sourceItemId) {
      return;
    }

    // Extract the station name.
    const station = row
      .closest(".menu-category-section")
      .find("> .accordion-header h3")
      .first()
      .text()
      .trim();

    // Extract the food category.
    const category = row
      .closest(".station-list")
      .prev(".panel-heading")
      .find("a.sublocs")
      .first()
      .text()
      .trim();

    // Extract the meal period.
    const mealPeriod =
      row
        .closest(".meal-category")
        .attr("id")
        ?.toLowerCase() ?? "unknown";

    // Extract the price.
    const priceDollars = parseNumber(
      row.find(".item-price").first().text()
    );

    const priceCents =
      priceDollars === null
        ? null
        : Math.round(priceDollars * 100);

    // Extract calories.
    const calories = parseNumber(
      row.find(".cals").first().text()
    );

    // Extract allergen and dietary tags.
    const tags = row
      .find("img[title]")
      .map((_, image) =>
        $(image)
          .attr("title")
          .replace(/^Contains /, "")
          .replace(/TreeNuts/i, "Tree Nuts")
          .toLowerCase()
          .replace(/\s+/g, "_")
      )
      .get();

    // Identify duplicate foods.
    const key = `${station}|${name}|${nutritionUrl.href}`;

    const existing = uniqueFoods.get(key);

    if (existing) {
      // Keep track of every meal period.
      if (!existing.meal_periods.includes(mealPeriod)) {
        existing.meal_periods.push(mealPeriod);
      }

      existing.prices_by_meal_period[mealPeriod] = priceCents;

      // Fill in a missing price when another period has one.
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

    // Save the food.
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

  // Organize foods into their stations.
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

  // Extract the displayed date label.
  const dateLabel =
    $(`#buta${dayNumber}`)
      .text()
      .replace(/\s+/g, " ")
      .trim() || null;

  // Extract the actual dining hall name.
  const hallName =
    $("h1").first().text().trim() || hall.name;

  // Find the full menu date.
  const dateHeading = $("h2")
    .toArray()
    .map((element) =>
      $(element)
        .text()
        .replace(/\s+/g, " ")
        .trim()
    )
    .find((value) =>
      /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),/.test(
        value
      )
    );

  // Extract month, day, and year.
  const dateParts = dateHeading?.match(
    /^[A-Za-z]+, ([A-Za-z]+) (\d{1,2}) (\d{4})$/
  );

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];

  const monthIndex = dateParts
    ? months.indexOf(dateParts[1])
    : -1;

  // Convert the date into YYYY-MM-DD format.
  const menuDate =
    monthIndex >= 0
      ? `${dateParts[3]}-${String(monthIndex + 1).padStart(2, "0")}-${dateParts[2].padStart(2, "0")}`
      : null;

  // Return the complete dining hall JSON structure.
  return {
    dining_hall: {
      id: hall.id,
      name: hallName,
      type: "dining_hall",
      area: hall.area
    },
    source: "hdh-web",
    menu_day: dayNumber,
    menu_date_label: dateLabel,
    menu_date: menuDate,
    stations: [...stations.values()]
  };
}

module.exports = { parseMenuHtml };