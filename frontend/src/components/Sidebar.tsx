import { NavLink, useNavigate } from "react-router-dom"
import { useAuthStore } from "../store/authStore"
import { useState } from "react"

export default function Sidebar() {
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

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
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-black flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <span className="text-cyan-400 text-lg font-bold">LeadRankerAI</span>
        <button
          onClick={() => setOpen(!open)}
          className="text-white focus:outline-none"
        >
          {open ? (
            // X icon
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            // Hamburger icon
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black bg-opacity-60"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar — desktop always visible, mobile slide-in */}
      <div
        className={`
          fixed md:static z-40 top-0 left-0 h-screen w-64 bg-black text-white flex flex-col justify-between
          transform transition-transform duration-300
          ${open ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0
        `}
      >
        <div>
          <div className="p-6 text-xl font-bold text-cyan-400 hidden md:block">
            LeadRankerAI
          </div>
          {/* Spacer on mobile for top bar */}
          <div className="h-14 md:hidden" />
          <nav className="flex flex-col gap-2 p-4">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setOpen(false)}
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
    </>
  )
}