import { apiGet } from './client'

// GET /api/locations → [{ id, name, type, area, geo }]
export function fetchLocations({ signal } = {}) {
  return apiGet('/locations', { signal })
}

// GET /api/locations/:id/stations → [{ id, name, hours, notes, isOpenNow }]
export function fetchStations(locationId, { signal } = {}) {
  return apiGet(`/locations/${encodeURIComponent(locationId)}/stations`, { signal })
}
