// Small fetch wrapper for our backend.
// The backend answers { data } on success and { error: { code, message } }
// on failure (see backend/README.md). These helpers return `data` or throw
// an ApiError, so callers only deal with the happy path + one catch.
//
// In dev, Vite proxies /api to the backend on :3001 (see vite.config.js).
// For a deployed build, set VITE_API_URL to the backend's origin.

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let res
  try {
    res = await fetch(`${BASE_URL}/api${path}`, {
      method,
      signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError("Couldn't reach the server. Is the backend running?", { code: 'network' })
  }

  const json = await res.json().catch(() => null)
  // In dev, the Vite proxy answers with a bare 5xx when the backend is down.
  if (!json && res.status >= 500) {
    throw new ApiError("Couldn't reach the server. Is the backend running?", {
      status: res.status,
      code: 'network',
    })
  }
  if (!res.ok || !json || json.error) {
    throw new ApiError(json?.error?.message ?? `Request failed (${res.status})`, {
      status: res.status,
      code: json?.error?.code,
    })
  }
  return json.data
}

export function apiGet(path, options) {
  return request(path, options)
}

export function apiPost(path, body, options) {
  return request(path, { ...options, method: 'POST', body })
}
