// Saves one eaten food to the user's log.
//
// TODO(backend): there is no endpoint for this yet. The `Food_Logs`
// collection exists in HT2_DB but the backend doesn't use it. Once a
// `POST /api/food-logs` route exists, replace the body of this function with:
//
//   import { apiPost } from './client'   // (at the top of this file)
//   return apiPost('/food-logs', entry)
//
// `entry` shape sent by AddFoodPopup:
//   {
//     date: 'YYYY-MM-DD' | null,   // the day being logged to
//     source: 'menu' | 'manual',
//     menuItemId: string | null,   // Menu_Items _id when picked from a menu
//     foodId: string | null,       // Foods _id when picked from a menu
//     locationId: string | null,
//     name: string,
//     priceCents: number | null,
//     servings: number,
//     nutrition: { calories, proteinG, carbsG, fatG }  // per serving, nulls allowed
//   }
//
// For now it just echoes the entry back with a temporary id, so the UI
// can be built and tested without the backend route.
export async function addFoodLog(entry) {
  return { id: `local-${Date.now()}`, ...entry }
}
