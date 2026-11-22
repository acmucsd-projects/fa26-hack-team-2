import { request } from './client'

export function getMenu(locationId) {
  return request(`/menus?location=${locationId}`)
}