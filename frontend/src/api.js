const API_BASE = "http://127.0.0.1:8000";

export function getToken() {
  return localStorage.getItem("token");
}

export async function apiGet(path) {
  const res = await fetch(API_BASE + path, {
    headers: {
      "Authorization": "Bearer " + getToken(),
      "Content-Type": "application/json"
    }
  });

  if (!res.ok) {
    throw new Error("API error");
  }

  return res.json();
}
