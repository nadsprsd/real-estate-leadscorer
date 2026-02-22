import { create } from "zustand"
import axios from "axios"

interface AuthState {
  token: string | null
  user: any | null

  setToken: (token: string) => void
  fetchUser: () => Promise<void>
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({

  token: localStorage.getItem("token"),
  user: null,

  setToken: (token) => {
    localStorage.setItem("token", token)
    set({ token })
  },

  fetchUser: async () => {
    try {

      const token = localStorage.getItem("token")

      if (!token) return

      const res = await axios.get(
        "http://127.0.0.1:8000/api/v1/auth/me",
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      set({ user: res.data })

    } catch (err) {

      console.log("Not logged in")

      localStorage.removeItem("token")

      set({
        token: null,
        user: null
      })
    }
  },

  logout: () => {

    localStorage.removeItem("token")

    set({
      token: null,
      user: null
    })

  }

}))
