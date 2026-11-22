import { request } from './client'

export function getMe() {
  return request('/me')
}

export function getLog(from, to) {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const query = params.toString()
  return request(query ? `/me/log?${query}` : '/me/log')
}

export function getWeek(start) {
  return request(start ? `/me/week?start=${start}` : '/me/week')
}

export function addMeal(date, menuItemId, servings = 1) {
  return request(`/me/log/${date}/meals`, { method: 'POST', body: { menuItemId, servings } })
}