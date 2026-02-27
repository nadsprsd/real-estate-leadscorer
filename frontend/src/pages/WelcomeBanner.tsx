// WelcomeBanner.tsx
// Add this component at the TOP of your Dashboard page.
// It shows a personalized greeting + free tier upgrade nudge.

import { useState, useEffect } from "react"
import { useAuthStore } from "../store/authStore"
import { X, Zap, ArrowRight } from "lucide-react"
import { useNavigate } from "react-router-dom"

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"

interface UserInfo {
  brokerage_name: string
  email: string
  plan: string
  usage: number
  limit: number
}

export default function WelcomeBanner() {
  const navigate   = useNavigate()
  const token      = useAuthStore((s) => s.token)
  const [user,     setUser]     = useState<UserInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [isNew,    setIsNew]    = useState(false)

  useEffect(() => {
    if (!token) return

    // Check if this is a fresh login/registration
    const lastSeen = localStorage.getItem("lastSeenAt")
    const now      = Date.now()
    if (!lastSeen || now - parseInt(lastSeen) > 24 * 60 * 60 * 1000) {
      setIsNew(true)
    }
    localStorage.setItem("lastSeenAt", String(now))

    const load = async () => {
      try {
        const [meRes, billingRes] = await Promise.allSettled([
          fetch(`${API}/api/v1/auth/me`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          fetch(`${API}/api/v1/billing/status`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
        ])

        let name = "", email = "", plan = "trial"
        let usage = 0, limit = 50

        if (meRes.status === "fulfilled" && meRes.value.ok) {
          const d = await meRes.value.json()
          name  = d.brokerage_name || d.email?.split("@")[0] || "there"
          email = d.email || ""
          plan  = d.plan || "trial"
        }

        if (billingRes.status === "fulfilled" && billingRes.value.ok) {
          const d = await billingRes.value.json()
          usage = d.usage || 0
          limit = d.limit || 50
        }

        setUser({ brokerage_name: name, email, plan, usage, limit })
      } catch { /* silent — banner is non-critical */ }
    }
    load()
  }, [token])

  if (!user || dismissed) return null

  const usedPercent = Math.round((user.usage / user.limit) * 100)
  const isNearLimit = usedPercent >= 70
  const isTrial     = user.plan === "trial"

  // Get first name from brokerage name or email
  const firstName = user.brokerage_name?.split(" ")[0] || user.email?.split("@")[0] || "there"

  return (
    <div className="space-y-3">

      {/* Greeting card */}
      {isNew && (
        <div className="relative bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-5
          text-white shadow-lg shadow-blue-200 overflow-hidden">
          <div className="absolute right-0 top-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-blue-200 text-sm font-medium mb-1">Welcome back 👋</p>
              <h2 className="text-2xl font-black mb-2">Good to see you, {firstName}!</h2>
              <p className="text-blue-100 text-sm">
                Your AI lead scoring engine is ready.
                {user.usage === 0
                  ? " Score your first lead to get started."
                  : ` You've scored ${user.usage} leads this month.`}
              </p>
            </div>
            <button onClick={() => setDismissed(true)}
              className="flex-shrink-0 text-blue-300 hover:text-white transition-colors p-1">
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Trial upgrade nudge */}
      {isTrial && (
        <div className={`flex items-center justify-between flex-wrap gap-4 p-4 rounded-2xl border-2
          ${isNearLimit
            ? "bg-amber-50 border-amber-300 text-amber-900"
            : "bg-slate-50 border-slate-200 text-slate-700"}`}>

          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
              ${isNearLimit ? "bg-amber-500" : "bg-blue-600"}`}>
              <Zap size={18} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-sm">
                {isNearLimit
                  ? `⚠️ Almost out of leads! Used ${user.usage} of ${user.limit} this month.`
                  : `Free Trial — ${user.usage} of ${user.limit} leads used this month`}
              </p>
              <p className={`text-xs mt-0.5 ${isNearLimit ? "text-amber-700" : "text-slate-500"}`}>
                {isNearLimit
                  ? "Upgrade now to avoid interruption to your lead scoring."
                  : "Upgrade to Starter (₹1,599/mo) for 1,000 leads/month."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Usage bar */}
            <div className="hidden sm:block w-28">
              <div className="h-2 bg-white/60 rounded-full overflow-hidden border border-slate-200">
                <div
                  className={`h-full rounded-full transition-all ${
                    usedPercent >= 90 ? "bg-red-500"
                    : usedPercent >= 70 ? "bg-amber-500"
                    : "bg-blue-500"
                  }`}
                  style={{ width: `${Math.min(usedPercent, 100)}%` }}
                />
              </div>
              <p className="text-xs text-center mt-1 font-medium">{usedPercent}% used</p>
            </div>

            <button
              onClick={() => navigate("/billing")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-sm
                transition-all flex-shrink-0
                ${isNearLimit
                  ? "bg-amber-500 text-white hover:bg-amber-600 shadow-md shadow-amber-200"
                  : "bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-200"}`}>
              Upgrade <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}