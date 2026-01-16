import { Link, Outlet } from "react-router-dom";

export default function DashboardLayout() {
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4 text-xl font-bold border-b border-gray-700">
          LeadScorer AI
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <Link className="block p-2 rounded hover:bg-gray-700" to="/dashboard">Dashboard</Link>
          <Link className="block p-2 rounded hover:bg-gray-700" to="/score">Score Lead</Link>
          <Link className="block p-2 rounded hover:bg-gray-700" to="/history">History</Link>
        </nav>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Topbar */}
        <div className="h-14 bg-white shadow flex items-center justify-between px-4">
          <div className="font-semibold">Real Estate Lead Scoring SaaS</div>
          <button
            onClick={() => {
              localStorage.removeItem("token");
              window.location.href = "/";
            }}
            className="text-red-600 font-semibold"
          >
            Logout
          </button>
        </div>

        {/* Page content */}
        <div className="p-6 overflow-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
