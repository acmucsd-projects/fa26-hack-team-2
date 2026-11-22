import { request } from './client'

export function register(name, email, password) {
  return request('/auth/register', { method: 'POST', body: { name, email, password } })
}

export function login(email, password) {
  return request('/auth/login', { method: 'POST', body: { email, password } })
}

export function logout() {
  return request('/auth/logout', { method: 'POST' })
}