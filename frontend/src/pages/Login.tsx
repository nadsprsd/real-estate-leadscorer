import React, { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { Loader2, Mail, Lock, Eye, EyeOff } from "lucide-react"
import { useAuthStore } from "../store/authStore"
import { reportError, getFriendlyMessage } from "../lib/errorReporter"
import ErrorToast, { showErrorToast } from "../components/ErrorToast"

const API_URL = "https://api.leadrankerai.com"

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const setToken = useAuthStore((s) => s.setToken)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState({ email: "", password: "" })

  const verified = searchParams.get("verified") === "true"

  const handleGoogleLogin = async () => {
    setGoogleLoading(true)
    setError("")
    try {
      const response = await fetch(`${API_URL}/api/v1/auth/google/login`)
      const data = await response.json()
      if (data.auth_url) {
        window.location.href = data.auth_url
      } else {
        throw new Error("Could not get Google Auth URL")
      }
    } catch (err: any) {
      await reportError("Google Login", err, "Google Auth Error")
      setError("Google Login failed. Please try again.")
      setGoogleLoading(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        const err = { status: res.status, message: data.detail || "Login failed" }
        // Only report if not a simple wrong password (401)
        if (res.status !== 401) {
          await reportError("Login", err)
        }
        throw new Error(data.detail || "Login failed")
      }
      setToken(data.access_token)
      navigate("/")
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-cyan-400">LeadRankerAI</h1>
          <p className="text-slate-400 mt-2 text-sm">AI-powered lead scoring for modern teams</p>
        </div>

        <div className="bg-[#111827] border border-gray-800 rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-white">Welcome Back</h2>
            <p className="text-slate-400 mt-1 text-sm">Sign in to your account</p>
          </div>

          {verified && (
            <div className="mb-4 p-3 bg-green-900/40 border border-green-700 text-green-400 text-sm rounded-lg text-center">
              ✅ Email verified! You can now sign in.
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-900/40 border border-red-700 text-red-400 text-sm rounded-lg text-center">
              {error}
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full border border-gray-700 bg-gray-800 hover:bg-gray-700 rounded-xl py-3 transition flex items-center justify-center gap-3 font-medium text-white mb-6"
          >
            {googleLoading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                Continue with Google
              </>
            )}
          </button>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-700"></span>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-[#111827] px-2 text-slate-500">Or sign in with email</span>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 text-slate-500" size={16} />
                <input
                  type="email"
                  required
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-900 border border-gray-700 text-white rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none placeholder-slate-600"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-slate-300">Password</label>
                <Link to="/forgot-password" className="text-xs text-cyan-400 hover:text-cyan-300 hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 text-slate-500" size={16} />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  className="w-full pl-9 pr-10 py-2.5 bg-gray-900 border border-gray-700 text-white rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none placeholder-slate-600"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <button
                  type="button"
                  className="absolute right-3 top-3 text-slate-500 hover:text-slate-300"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 mt-2"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : "Sign In"}
            </button>
          </form>

          <p className="text-center mt-6 text-sm text-slate-500">
            Don't have an account?{" "}
            <Link to="/register" className="font-bold text-cyan-400 hover:underline">
              Register free
            </Link>
          </p>
        </div>

        <p className="text-center mt-4 text-xs text-slate-600">
          © 2026 LeadRankerAI ·{" "}
          <Link to="/privacy" className="hover:underline">Privacy</Link> ·{" "}
          <Link to="/terms" className="hover:underline">Terms</Link>
        </p>
      </div>
      <ErrorToast />
    </div>
  )
}