const API_URL = "http://127.0.0.1:8000";

function getToken() {
  return localStorage.getItem("token");
}

export async function apiGet(path) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  });

  if (!res.ok) {
    throw new Error("API Error");
  }

  return res.json();
}

export async function apiPost(path, data = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error("API Error");
  }

  return res.json();
}
