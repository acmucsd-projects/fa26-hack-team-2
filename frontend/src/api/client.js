export async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const json = await response.json()

  if (!response.ok) {
    const error = new Error(json.error?.message ?? 'Something went wrong')
    error.status = response.status
    throw error
  }

  return json.data
}