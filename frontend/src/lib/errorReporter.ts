const API_URL = "https://api.leadrankerai.com"

interface ErrorPayload {
  error_type: string
  page: string
  action: string
  message: string
  user_email?: string
}

// Get current user email from localStorage/token if available
function getUserEmail(): string | null {
  try {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")
    if (!token) return null
    const payload = JSON.parse(atob(token.split(".")[1]))
    return payload.email || payload.sub || null
  } catch {
    return null
  }
}

// Main reporter function — call this anywhere an error occurs
export async function reportError(
  error_type: string,
  action: string,
  message: string,
  user_email?: string
): Promise<void> {
  try {
    const page = window.location.pathname
    const email = user_email || getUserEmail() || undefined
    await fetch(`${API_URL}/api/v1/report-error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error_type, page, action, message, user_email: email }),
    })
  } catch {
    // Silent fail — never block the user for this
  }
}

// Friendly user-facing messages per error type
export function getFriendlyMessage(error_type: string): string {
  const messages: Record<string, string> = {
    "Plugin Download Failed":     "Plugin download failed. Our team has been notified and will fix this shortly.",
    "Login Failed":               "Login failed. If this keeps happening, our team has been notified.",
    "Google Login Failed":        "Google login is temporarily unavailable. Our team has been notified.",
    "Registration Failed":        "Registration failed. Our team has been notified and will fix this shortly.",
    "Lead Scoring Failed":        "Lead scoring is temporarily unavailable. Our team has been alerted.",
    "Billing Error":              "There was a billing issue. Our team has been notified — you won't be charged.",
    "API Key Error":              "Could not load your API key. Our team has been notified.",
    "Dashboard Load Failed":      "Dashboard failed to load. Our team has been notified.",
    "Password Reset Failed":      "Password reset failed. Our team has been notified.",
    "Default":                    "Something went wrong. Our team has been notified and will fix this shortly.",
  }
  return messages[error_type] || messages["Default"]
}