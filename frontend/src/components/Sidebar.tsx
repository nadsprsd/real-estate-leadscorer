import { NavLink, useNavigate } from "react-router-dom"
import { useAuthStore } from "../store/authStore"
import { api } from "../lib/api"




export default function Sidebar() {

  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate("/login")
  }

  const navItems = [
    { name: "Dashboard", path: "/" },
    { name: "Lead Center", path: "/history" },
    { name: "Connections", path: "/connections" },
    { name: "Analytics", path: "/analytics" },
    { name: "Billing", path: "/billing" },
    { name: "Settings", path: "/settings" },
  ]

  return (
    <div className="w-64 h-screen bg-black text-white flex flex-col justify-between">

      <div>
        <div className="p-6 text-xl font-bold text-cyan-400">
          LeadRankerAI
        </div>

        <nav className="flex flex-col gap-2 p-4">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `px-4 py-2 rounded-lg transition ${
                  isActive
                    ? "bg-gray-800 text-cyan-400"
                    : "text-gray-300 hover:bg-gray-800 hover:text-white"
                }`
              }
            >
              {item.name}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="p-4">
        <button
          onClick={handleLogout}
          className="w-full bg-red-600 hover:bg-red-700 p-2 rounded-lg"
        >
          Logout
        </button>
      </div>

    </div>
  )
}
