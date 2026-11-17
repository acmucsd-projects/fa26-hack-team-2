const { TAGS } = require('../constants/tags');
const { nutritionCacheFileName, nutritionConflict } = require('./nutritionParser');
const validAmount = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
function validDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date;
}
function validateMenu(menu) {
  const errors = [], warnings = [], seen = new Set();
  const counts = { foods: 0, missing_prices: 0, missing_calories: 0, missing_nutrition: 0, detailed_nutrition: 0, unverified_nutrition: 0, duplicates: 0, merged_occurrences: menu.diagnostics?.merged_occurrences || 0 };
  if (!menu.dining_hall?.id || !menu.dining_hall?.name) errors.push('Missing restaurant identity');
  if (!validDate(menu.menu_date)) errors.push('Missing or invalid calendar date');
  if (!Number.isInteger(menu.menu_day) || menu.menu_day < 0 || menu.menu_day > 6) errors.push('Invalid menu day');
  if (validDate(menu.menu_date) && menu.menu_date_heading) {
    const weekday = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(menu.menu_date+'T12:00:00Z').getUTCDay()];
    if (!menu.menu_date_heading.startsWith(weekday+',')) errors.push('Heading weekday does not match calendar date');
  }
  if (!menu.hours) warnings.push('Missing/unrecognized location hours; database location will be withheld');
  if (!Array.isArray(menu.stations)) return { errors: [...errors,'Missing stations array'], warnings, counts };
  if (!menu.stations.length) warnings.push('Explicitly empty/closed menu');
  for (const station of menu.stations) {
    if (!station.id || !station.name || !Array.isArray(station.items)) { errors.push('Missing station identity/items'); continue; }
    for (const food of station.items) {
      counts.foods++;
      const label = `${station.name} / ${food.name || '(unnamed)'}`;
      if (!food.name?.trim()) errors.push(`${label}: missing name`);
      if (!food.category) warnings.push(`${label}: missing category`);
      if (food.price_cents == null) counts.missing_prices++;
      else if (!Number.isInteger(food.price_cents) || food.price_cents < 0) errors.push(`${label}: invalid price`);
      if (food.calories == null) counts.missing_calories++;
      else if (!validAmount(food.calories)) errors.push(`${label}: invalid calories`);
      if (!Array.isArray(food.tags) || food.tags.some(t => !TAGS.includes(t))) errors.push(`${label}: invalid tags`);
      try {
        nutritionCacheFileName(food.nutrition_url);
        if (new URL(food.nutrition_url).searchParams.get('id') !== food.source_item_id) throw new Error('ID mismatch');
      } catch { errors.push(`${label}: invalid nutrition URL or source item ID`); }
      if (!/^\d+$/.test(food.source_item_id || '')) errors.push(`${label}: missing/invalid source item ID`);
      if (!Array.isArray(food.meal_periods) || !food.meal_periods.length) errors.push(`${label}: missing meal periods`);
      for (const value of Object.values(food.prices_by_meal_period || {})) if (value !== null && (!Number.isInteger(value) || value < 0)) errors.push(`${label}: invalid meal price`);
      const key = JSON.stringify([menu.dining_hall.id,menu.menu_date,station.id,food.category,food.name,food.nutrition_url,food.price_cents,food.calories,food.tags]);
      if (seen.has(key)) { counts.duplicates++; errors.push(`${label}: duplicate offering`); }
      seen.add(key);
      if (!food.nutrition) counts.missing_nutrition++;
      else {
        if (nutritionConflict(food) || food.nutrition_status === 'unverified') counts.unverified_nutrition++;
        else counts.detailed_nutrition++;
        const { macros, ingredients, serving_size_text, ...amounts } = food.nutrition;
        if (Object.values({ ...amounts, ...macros }).some(n => n !== null && !validAmount(n))) errors.push(`${label}: invalid detailed nutrition`);
        if (nutritionConflict(food)) warnings.push(`${label}: menu/detail calorie mismatch; menu calories retained, snapshot unverified and excluded from database nutrition`);
      }
      if (food.nutrition_status === 'invalid') warnings.push(`${label}: saved nutrition has no usable data`);
    }
  }
  for (const field of ['missing_prices','missing_calories','missing_nutrition']) if (counts[field]) warnings.push(`${field}: ${counts[field]}`);
  return { errors, warnings, counts };
}
module.exports = { validateMenu, validDate };
