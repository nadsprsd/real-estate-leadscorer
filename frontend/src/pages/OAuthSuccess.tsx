import { useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useAuthStore } from "../store/authStore"

export default function OAuthSuccess() {

  const navigate = useNavigate()
  const [params] = useSearchParams()

  const setToken = useAuthStore((s) => s.setToken)

  useEffect(() => {

    const token = params.get("token")

    if (!token) {
      navigate("/login")
      return
    }

    // Save token properly in Zustand + localStorage
    setToken(token)

    // Redirect
    navigate("/")

  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-sm text-gray-500">
        Signing you in...
      </div>
    </div>
  )
}
