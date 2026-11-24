import { apiGet, apiPost } from './client'

export function getMe() {
  return apiGet('/me')
}

export function getLog(from, to) {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const query = params.toString()
  return apiGet(query ? `/me/log?${query}` : '/me/log')
}

export function getWeek(start) {
  return apiGet(start ? `/me/week?start=${start}` : '/me/week')
}

export function addMeal(date, menuItemId, servings = 1) {
  return apiPost(`/me/log/${date}/meals`, { menuItemId, servings })
}