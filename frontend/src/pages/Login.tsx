import { useState } from "react"
import { useAuthStore } from "../store/auth"
import { Link } from "react-router-dom"
import { Loader2, Eye, EyeOff, CheckCircle } from "lucide-react"

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"

export default function Login() {
  // ── ONE value per useAuthStore call — prevents infinite loop
  const setToken = useAuthStore((s) => s.setToken)
  const logout   = useAuthStore((s) => s.logout)

  const [email,         setEmail]         = useState("")
  const [password,      setPassword]      = useState("")
  const [loading,       setLoading]       = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error,         setError]         = useState("")
  const [showPassword,  setShowPassword]  = useState(false)
  const [verifiedMsg,   setVerifiedMsg]   = useState(
    // Show success toast if redirected here after email verification
    new URLSearchParams(window.location.search).get("verified") === "true"
  )

  function clearSession() {
    logout()
    localStorage.clear()
    sessionStorage.clear()
  }

    function handleGoogleLogin() {
  setGoogleLoading(true)
  clearSession()
  window.location.href = `${API}/api/v1/auth/google/login`
}

  async function handleGoogleLogin() {
    setGoogleLoading(true)
    setError("")
    try {
      clearSession()

      const res = await fetch(`${API}/api/v1/auth/google/login`)
      if (!res.ok) throw new Error(`Server error ${res.status}`)

      const data = await res.json()
      if (!data.auth_url) throw new Error("No auth URL returned from server")

      window.location.href = data.auth_url
    } catch (err: any) {
      setError(`Google login failed: ${err?.message}`)
      setGoogleLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="bg-white w-full max-w-md rounded-2xl border border-slate-200 shadow-xl p-10">

        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black tracking-tight mb-2">
            <span className="text-blue-600">Lead</span>RankerAI
          </h1>
          <p className="text-sm text-slate-500">Sign in to your dashboard</p>
        </div>

        {/* Email verified success banner */}
        {verifiedMsg && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200
            text-green-700 text-sm font-medium p-3 rounded-xl mb-4">
            <CheckCircle size={16} className="flex-shrink-0" />
            <span>Email verified! You can now sign in.</span>
            <button onClick={() => setVerifiedMsg(false)} className="ml-auto opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest ml-1 mb-1.5">
              Email
            </label>
            <input
              type="email"
              placeholder="name@agency.com"
              required
              autoComplete="email"
              className="w-full border border-slate-200 focus:border-blue-500 focus:ring-2
                focus:ring-blue-100 rounded-xl px-4 py-3 text-sm outline-none transition-all"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">
                Password
              </label>
              <Link to="/forgot-password" className="text-xs text-blue-600 hover:underline font-medium">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full border border-slate-200 focus:border-blue-500 focus:ring-2
                  focus:ring-blue-100 rounded-xl px-4 py-3 pr-11 text-sm outline-none transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200
              text-red-700 text-xs font-semibold p-3 rounded-xl">
              <span className="mt-0.5 flex-shrink-0">⚠</span>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold
              hover:bg-blue-700 transition-all shadow-lg shadow-blue-200
              disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center justify-center gap-2"
          >
            {loading
              ? <><Loader2 size={16} className="animate-spin" /> Signing in...</>
              : "Sign in"}
          </button>

        </form>

        {/* Divider */}
        <div className="flex items-center my-8">
          <div className="flex-1 border-t border-slate-200" />
          <span className="px-4 text-xs font-bold uppercase tracking-widest text-slate-400">or</span>
          <div className="flex-1 border-t border-slate-200" />
        </div>

        {/* Google */}
        <button
          onClick={handleGoogleLogin}
          disabled={googleLoading}
          className="w-full border border-slate-200 rounded-xl py-3 text-sm font-semibold
            hover:bg-slate-50 transition flex items-center justify-center gap-3 disabled:opacity-60"
        >
          {googleLoading ? (
            <><Loader2 size={16} className="animate-spin" /> Redirecting to Google...</>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        <div className="text-center mt-8 pt-6 border-t border-slate-100">
          <p className="text-sm text-slate-500">
            Don't have an account?{" "}
            <Link to="/register" className="font-bold text-blue-600 hover:underline">Create one free</Link>
          </p>
        </div>

      </div>
    </div>
  )
}