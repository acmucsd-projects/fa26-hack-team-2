const { TAGS } = require('../constants/tags');
const validAmount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function validDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}

function validateMenu(menu) {
  const errors = [], warnings = [], seen = new Set();
  const counts = { foods: 0, missing_prices: 0, missing_calories: 0, duplicates: 0, merged_occurrences: menu.diagnostics?.merged_occurrences || 0 };
  if (!menu.dining_hall?.id || !menu.dining_hall?.name) errors.push('Missing restaurant identity');
  if (!validDate(menu.menu_date)) errors.push('Missing or invalid calendar date');
  if (!Number.isInteger(menu.menu_day) || menu.menu_day < 0 || menu.menu_day > 6) errors.push('Invalid menu day');
  if (validDate(menu.menu_date) && menu.menu_date_heading) {
    const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(menu.menu_date + 'T12:00:00Z').getUTCDay()];
    if (!menu.menu_date_heading.startsWith(weekday + ',')) errors.push('Heading weekday does not match calendar date');
  }
  if (!menu.hours) warnings.push('Missing/unrecognized restaurant hours');
  if (!Array.isArray(menu.stations)) return { errors: [...errors, 'Missing stations array'], warnings, counts };
  if (!menu.stations.length) warnings.push('Explicitly empty/closed menu');
  for (const station of menu.stations) {
    if (!station.id || !station.name || !Array.isArray(station.items)) {
      errors.push('Missing station identity/items');
      continue;
    }
    for (const food of station.items) {
      counts.foods++;
      const label = `${station.name} / ${food.name || '(unnamed)'}`;
      if (!food.name?.trim()) errors.push(`${label}: missing name`);
      if (food.description != null && typeof food.description !== 'string') errors.push(`${label}: invalid description`);
      if (!food.category) warnings.push(`${label}: missing category`);
      if (food.price_cents == null) counts.missing_prices++;
      else if (!Number.isInteger(food.price_cents) || food.price_cents < 0) errors.push(`${label}: invalid price`);
      if (food.calories == null) counts.missing_calories++;
      else if (!validAmount(food.calories)) errors.push(`${label}: invalid calories`);
      if (!Array.isArray(food.tags) || food.tags.some(tag => !TAGS.includes(tag))) errors.push(`${label}: invalid tags`);
      try {
        const url = new URL(food.nutrition_url);
        if (url.protocol !== 'https:' || url.hostname !== 'hdh-web.ucsd.edu' || url.username || url.password || url.port ||
            !/^\/dining\/apps\/diningservices\/Nutrition\/Nutritionfacts2$/i.test(url.pathname) ||
            !/^\d+$/.test(food.source_item_id || '') || url.searchParams.get('id') !== food.source_item_id) throw new Error('Invalid source');
      } catch { errors.push(`${label}: invalid nutrition URL or source item ID`); }
      if (!Array.isArray(food.meal_periods) || !food.meal_periods.length) errors.push(`${label}: missing meal periods`);
      for (const period of food.meal_periods || []) {
        if (!Object.hasOwn(food.prices_by_meal_period || {}, period)) errors.push(`${label}: missing meal price`);
      }
      for (const value of Object.values(food.prices_by_meal_period || {})) {
        if (value !== null && (!Number.isInteger(value) || value < 0)) errors.push(`${label}: invalid meal price`);
      }
      const key = JSON.stringify([menu.dining_hall.id, menu.menu_date, station.id, food.category, food.name, food.nutrition_url, food.price_cents, food.calories, food.tags, food.description]);
      if (seen.has(key)) { counts.duplicates++; errors.push(`${label}: duplicate offering`); }
      seen.add(key);
    }
  }
  for (const field of ['missing_prices', 'missing_calories']) if (counts[field]) warnings.push(`${field}: ${counts[field]}`);
  return { errors, warnings, counts };
}
module.exports = { validateMenu, validDate };
