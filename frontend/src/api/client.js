export async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  let json = {}
  try {
    json = await response.json()
  } catch {
    json = {}
  }

  if (!response.ok) {
    const error = new Error(json.error?.message ?? `Couldn't reach the server (status ${response.status})`)
    error.status = response.status
    throw error
  }

  return json.data
}