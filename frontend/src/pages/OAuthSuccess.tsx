import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useAuthStore } from "../store/authStore"   // ← your original import path, unchanged
import { Loader2, CheckCircle, XCircle } from "lucide-react"

export default function OAuthSuccess() {
  const navigate    = useNavigate()
  const [params]    = useSearchParams()
  const setToken    = useAuthStore((s) => s.setToken)
  const logout      = useAuthStore((s) => s.logout)
  const [status,  setStatus]  = useState<"loading" | "success" | "error">("loading")
  const [errorMsg, setErrorMsg] = useState("")

  useEffect(() => {
    // 1. Wipe any previous user session
    logout()
    localStorage.removeItem("token")
    sessionStorage.clear()

    const token = params.get("token")

    if (!token) {
      setStatus("error")
      setErrorMsg("No token received from Google. Please try again.")
      return
    }

    // 2. Store the new token
    setToken(token)
    setStatus("success")

    // 3. Hard navigate — forces full remount with fresh state
    setTimeout(() => { window.location.href = "/dashboard" }, 800)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-12 text-center max-w-sm w-full">

        {status === "loading" && (
          <>
            <Loader2 size={40} className="animate-spin text-blue-600 mx-auto mb-4" />
            <p className="font-bold text-slate-800">Signing you in with Google...</p>
            <p className="text-slate-500 text-sm mt-2">Just a moment</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle size={40} className="text-green-500 mx-auto mb-4" />
            <p className="font-bold text-slate-800">Signed in successfully!</p>
            <p className="text-slate-500 text-sm mt-2">Redirecting to dashboard...</p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle size={40} className="text-red-500 mx-auto mb-4" />
            <p className="font-bold text-slate-800">Sign-in failed</p>
            <p className="text-red-600 text-sm mt-2">{errorMsg}</p>
            <button
              onClick={() => navigate("/login")}
              className="mt-6 w-full bg-blue-600 text-white py-3 rounded-xl font-bold
                hover:bg-blue-700 transition">
              Back to Login
            </button>
          </>
        )}

      </div>
    </div>
  )
}