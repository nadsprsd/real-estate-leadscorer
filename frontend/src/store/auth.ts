import { create } from "zustand"
import axios from "axios"

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"

interface AuthState {
  token:      string | null
  user:       any | null
  setToken:   (token: string) => void
  fetchUser:  () => Promise<void>
  logout:     () => void
  clearToken: () => void
}

export const useAuthStore = create<AuthState>((set) => ({

  token: localStorage.getItem("token"),
  user:  null,

  setToken: (token: string) => {
    localStorage.setItem("token", token)
    set({ token })
  },

  fetchUser: async () => {
    const token = localStorage.getItem("token")
    if (!token) return
    try {
      const res = await axios.get(`${API}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      set({ user: res.data })
    } catch {
      localStorage.removeItem("token")
      set({ token: null, user: null })
    }
  },

  logout: () => {
    localStorage.removeItem("token")
    sessionStorage.clear()
    set({ token: null, user: null })
  },

  // Same as logout — exists so any component can call clearToken()
  clearToken: () => {
    localStorage.removeItem("token")
    sessionStorage.clear()
    set({ token: null, user: null })
  },

}))