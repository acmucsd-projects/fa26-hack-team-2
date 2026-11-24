import { apiPost } from './client'

export function register(name, email, password) {
  return apiPost('/auth/register', { name, email, password })
}

export function login(email, password) {
  return apiPost('/auth/login', { email, password })
}

export function logout() {
  return apiPost('/auth/logout')
}