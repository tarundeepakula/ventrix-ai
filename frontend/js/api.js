
const API_BASE_URL = "http://localhost:4000/api/v1";

async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error || data.message || `Request failed (${response.status})`
    );
  }

  return data;
}

const VentrixAPI = {
  get(endpoint) {
    return apiRequest(endpoint, { method: "GET" });
  },

  post(endpoint, body) {
    return apiRequest(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  put(endpoint, body) {
    return apiRequest(endpoint, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },

  delete(endpoint) {
    return apiRequest(endpoint, { method: "DELETE" });
  },
};

window.VentrixAPI = VentrixAPI;
