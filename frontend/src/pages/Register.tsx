import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Loader2, Eye, EyeOff, CheckCircle, Mail } from "lucide-react"

const API_URL = "https://api.leadrankerai.com"

export default function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    email:          "",
    password:       "",
    brokerage_name: "",
    industry:       "real_estate",
  })
  const [loading,      setLoading]      = useState(false)
  const [done,         setDone]         = useState(false)
  const [error,        setError]        = useState("")
  const [showPassword, setShowPassword] = useState(false)

  function set(field: keyof typeof form, value: string) {
    setForm((p) => ({ ...p, [field]: value }))
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/register`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.detail || `Registration failed (${res.status})`)
      setDone(true)
    } catch (err: any) {
      setError(err?.message || "Registration failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const strength = (() => {
    const p = form.password
    if (!p) return null
    if (p.length < 6)  return { label: "Too short", color: "bg-red-400",    w: "w-1/4" }
    if (p.length < 8)  return { label: "Weak",      color: "bg-amber-400",  w: "w-2/4" }
    if (!/[0-9]/.test(p) || !/[A-Z]/.test(p))
                       return { label: "Fair",       color: "bg-yellow-400", w: "w-3/4" }
    return               { label: "Strong",     color: "bg-green-500",  w: "w-full" }
  })()

  if (done) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center px-4">
        <div className="bg-[#111827] border border-gray-800 w-full max-w-md rounded-2xl shadow-2xl p-10 text-center">
          <div className="w-20 h-20 bg-cyan-900/40 rounded-full flex items-center justify-center mx-auto mb-6">
            <Mail size={36} className="text-cyan-400" />
          </div>
          <h2 className="text-2xl font-black text-white mb-2">Check Your Inbox</h2>
          <p className="text-slate-400 text-sm mb-2">We sent a verification email to</p>
          <p className="font-bold text-cyan-400 mb-6">{form.email}</p>
          <div className="bg-cyan-900/20 border border-cyan-800 rounded-2xl p-4 text-left text-sm text-cyan-300 space-y-2 mb-6">
            <p className="font-bold">What to do next:</p>
            <p>1. Open the email from LeadRankerAI</p>
            <p>2. Click the <strong>"Verify Email"</strong> button</p>
            <p>3. You'll be redirected back to login</p>
          </div>
          <p className="text-xs text-slate-500 mb-6">
            Didn't get it? Check your spam folder or{" "}
            <button onClick={() => setDone(false)} className="text-cyan-400 hover:underline font-medium">
              try again
            </button>
          </p>
          <button
            onClick={() => navigate("/login")}
            className="w-full bg-cyan-500 hover:bg-cyan-400 text-black py-3 rounded-xl font-bold transition flex items-center justify-center gap-2"
          >
            <CheckCircle size={16} /> Go to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-cyan-400">LeadRankerAI</h1>
          <p className="text-slate-400 mt-2 text-sm">AI-powered lead scoring for modern teams</p>
        </div>

        <div className="bg-[#111827] border border-gray-800 rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-white">Create Free Account</h2>
            <p className="text-slate-400 mt-1 text-sm">50 free leads/month · No credit card needed</p>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                Brokerage / Company Name
              </label>
              <input
                type="text"
                placeholder="Sunrise Properties Ltd."
                required
                autoComplete="organization"
                className="w-full bg-gray-900 border border-gray-700 text-white focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 rounded-xl px-4 py-3 text-sm outline-none transition-all placeholder-slate-600"
                value={form.brokerage_name}
                onChange={(e) => set("brokerage_name", e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                Industry
              </label>
              <select
                className="w-full bg-gray-900 border border-gray-700 text-white focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 rounded-xl px-4 py-3 text-sm outline-none transition-all"
                value={form.industry}
                onChange={(e) => set("industry", e.target.value)}
              >
                <option value="real_estate">Real Estate</option>
                <option value="logistics">Logistics</option>
                <option value="brokerage">Brokerage</option>
                <option value="insurance">Insurance</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                Work Email
              </label>
              <input
                type="email"
                placeholder="you@agency.com"
                required
                autoComplete="email"
                className="w-full bg-gray-900 border border-gray-700 text-white focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 rounded-xl px-4 py-3 text-sm outline-none transition-all placeholder-slate-600"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full bg-gray-900 border border-gray-700 text-white focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 rounded-xl px-4 py-3 pr-11 text-sm outline-none transition-all placeholder-slate-600"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                />
                <button type="button" tabIndex={-1}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {strength && (
                <div className="mt-2 space-y-1">
                  <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${strength.color} ${strength.w}`} />
                  </div>
                  <p className={`text-xs font-medium ${
                    strength.label === "Strong" ? "text-green-400"
                    : strength.label === "Fair"  ? "text-yellow-400"
                    : "text-red-400"}`}>
                    {strength.label}
                  </p>
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-900/40 border border-red-700 text-red-400 text-xs font-semibold p-3 rounded-xl">
                <span className="mt-0.5 flex-shrink-0">⚠</span>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !form.email || !form.password || !form.brokerage_name}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black py-3.5 rounded-xl font-bold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> Creating account...</>
                : "Create Free Account →"}
            </button>

            <p className="text-xs text-slate-500 text-center">
              By registering you agree to our{" "}
              <a href="/terms" className="text-cyan-400 hover:underline">Terms</a> &{" "}
              <a href="/privacy" className="text-cyan-400 hover:underline">Privacy Policy</a>
            </p>
          </form>

          <div className="text-center mt-6 pt-6 border-t border-gray-800">
            <p className="text-sm text-slate-500">
              Already have an account?{" "}
              <Link to="/login" className="font-bold text-cyan-400 hover:underline">Sign in</Link>
            </p>
          </div>
        </div>

        <p className="text-center mt-4 text-xs text-slate-600">
          © 2026 LeadRankerAI ·{" "}
          <Link to="/privacy" className="hover:underline">Privacy</Link> ·{" "}
          <Link to="/terms" className="hover:underline">Terms</Link>
        </p>
      </div>
    </div>
  )
}