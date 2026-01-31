import { Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";

export default function DashboardLayout() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const email = localStorage.getItem("user_email") || "User";
  const firstLetter = email.charAt(0).toUpperCase();

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user_email");
    navigate("/");
  }

  return (
    <div className="flex min-h-screen bg-gray-100">

      {/* Sidebar */}
      <div className="w-60 bg-slate-900 text-white p-4 space-y-4">
        <h1 className="text-2xl font-bold">Lead Ranker</h1>

        <NavItem to="/dashboard">Dashboard</NavItem>
        <NavItem to="/score">Score Lead</NavItem>
        <NavItem to="/history">History</NavItem>
        <NavItem to="/billing">Billing</NavItem>
        <NavItem to="/settings">Settings</NavItem>
      </div>

      {/* Main */}
      <div className="flex-1">

        {/* Top Bar */}
        <div className="bg-white p-4 shadow flex justify-between items-center">

          <h2 className="font-semibold text-lg">
            Real Estate Lead Scoring
          </h2>

          {/* Avatar */}
          <div className="relative">

            <div
              onClick={() => setOpen(!open)}
              className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold cursor-pointer"
            >
              {firstLetter}
            </div>

            {/* Dropdown */}
            {open && (
              <div className="absolute right-0 mt-2 w-48 bg-white border rounded shadow">

                <div className="p-3 text-sm border-b">
                  {email}
                </div>

                <button
                  onClick={() => navigate("/settings")}
                  className="w-full text-left px-4 py-2 hover:bg-gray-100"
                >
                  ⚙️ Settings
                </button>

                <button
                  onClick={logout}
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 text-red-600"
                >
                  🚪 Logout
                </button>
              </div>
            )}

          </div>

        </div>

        {/* Page Content */}
        <div className="p-6">
          <Outlet />
        </div>

      </div>
    </div>
  );
}


function NavItem({ to, children }) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(to)}
      className="cursor-pointer px-3 py-2 rounded hover:bg-slate-700"
    >
      {children}
    </div>
  );
}
