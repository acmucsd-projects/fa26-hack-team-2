import { request } from './client'

export function getLocations() {
  return request('/locations')
}