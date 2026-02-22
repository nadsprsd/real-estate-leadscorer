const BASE_URL = "http://127.0.0.1:8000"

function getToken() {
  return localStorage.getItem("token")
}

async function request(
  endpoint: string,
  method: string = "GET",
  body?: any
) {
  const headers: any = {
    "Content-Type": "application/json"
  }

  const token = getToken()
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.detail || "Request failed")
  }

  return res.json()
}

export const api = {
  get: (endpoint: string) => request(endpoint, "GET"),
  post: (endpoint: string, body: any) =>
    request(endpoint, "POST", body)
}
