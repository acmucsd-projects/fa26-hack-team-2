import { apiGet } from './client'

// GET /api/menus?location=<id>&exclude=...&diet=...&sort=...
// → [{ id, foodId, name, stationName, priceCents, nutrition: { calories, proteinG, carbsG, fatG, ... }, ... }]
export function fetchMenuItems(locationId, { exclude = [], diet, sort, signal } = {}) {
  const params = new URLSearchParams({ location: locationId })
  if (exclude.length) params.set('exclude', exclude.join(','))
  if (diet) params.set('diet', diet)
  if (sort) params.set('sort', sort)
  return apiGet(`/menus?${params}`, { signal })
}
