import { addMeal } from './me'

// Saves one eaten food to the user's log, using the backend's
// POST /api/me/log/:date/meals route (through addMeal in me.js).
//
// `entry` is the shape AddFoodPopup sends:
//   { date: 'YYYY-MM-DD', source: 'menu' | 'manual', menuItemId, servings, ... }
//
// The backend can only log meals picked from a menu for now, so manual
// entries throw an error until the backend supports them.
export async function addFoodLog(entry) {
  if (!entry.date) {
    throw new Error('No day selected to add this meal to.')
  }
  if (entry.source !== 'menu' || !entry.menuItemId) {
    throw new Error("Manual meals can't be saved yet. For now, pick a meal from a dining hall menu.")
  }
  return addMeal(entry.date, entry.menuItemId, entry.servings ?? 1)
}