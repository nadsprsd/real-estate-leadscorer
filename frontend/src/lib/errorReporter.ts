// src/lib/errorReporter.ts
const API_URL = "https://api.leadrankerai.com"

interface ErrorPayload {
  error_type: string
  page: string
  action: string
  message: string
  user_email?: string
}

function getUserEmail(): string | null {
  try {
    const token = localStorage.getItem("token") || localStorage.getItem("auth_token")
    if (!token) return null
    const payload = JSON.parse(atob(token.split(".")[1]))
    return payload?.email || payload?.sub || null
  } catch {
    return null
  }
}

function getCurrentPage(): string {
  return window.location.pathname
}

function extractMessage(error: any): string {
  if (typeof error === "string") return error
  if (error?.message) return error.message
  if (error?.detail) return error.detail
  if (error?.error) return error.error
  return JSON.stringify(error)?.slice(0, 200) || "Unknown error"
}

// Usage: reportError("action description", errorObject, "Optional Error Type")
export async function reportError(
  action: string,
  error: any,
  errorType?: string
): Promise<void> {
  try {
    const payload: ErrorPayload = {
      error_type: errorType || classifyError(error),
      page: getCurrentPage(),
      action,
      message: extractMessage(error),
      user_email: getUserEmail() || undefined,
    }

    await fetch(`${API_URL}/api/v1/report-error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  } catch {
    // Never let error reporting crash the app
  }
}

function classifyError(error: any): string {
  if (!error) return "Unknown Error"
  const msg = extractMessage(error).toLowerCase()
  const status = error?.status || error?.statusCode
  if (status === 500 || msg.includes("500")) return "Server Error (500)"
  if (status === 401 || msg.includes("unauthorized")) return "Auth Error (401)"
  if (status === 403 || msg.includes("forbidden")) return "Permission Error (403)"
  if (status === 404 || msg.includes("404")) return "Not Found (404)"
  if (msg.includes("failed to fetch") || msg.includes("network")) return "Network Error"
  if (msg.includes("stripe") || msg.includes("payment")) return "Payment Error"
  if (msg.includes("google") || msg.includes("oauth")) return "Google Auth Error"
  if (msg.includes("plugin") || msg.includes("download")) return "Plugin Download Error"
  return "Application Error"
}

export function getFriendlyMessage(error: any): string {
  const type = classifyError(error)
  switch (type) {
    case "Server Error (500)":
      return "Something went wrong on our end. Our team has been notified and will fix it shortly."
    case "Auth Error (401)":
      return "Your session has expired. Please sign in again."
    case "Network Error":
      return "Connection failed. Please check your internet and try again."
    case "Payment Error":
      return "Payment processing failed. Our team has been notified."
    case "Google Auth Error":
      return "Google sign-in failed. Please try again or use email/password."
    case "Plugin Download Error":
      return "Plugin download failed. Our team has been notified and will fix it shortly."
    default:
      return "Something went wrong. Our team has been notified."
  }
}