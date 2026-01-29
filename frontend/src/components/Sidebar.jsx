import { LayoutDashboard, History, CreditCard, Settings, Zap } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

const items = [
  { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { name: "Score Lead", path: "/score", icon: Zap },
  { name: "History", path: "/history", icon: History },
  { name: "Billing", path: "/billing", icon: CreditCard },
  { name: "Settings", path: "/settings", icon: Settings },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <div className="w-64 bg-slate-900 text-white h-screen p-4">
      <div className="text-2xl font-bold mb-8">LeadScorer</div>

      <nav className="space-y-2">
        {items.map((item) => {
          const active = location.pathname.startsWith(item.path);
          return (
            <Link
              key={item.name}
              to={item.path}
              className={`flex items-center gap-3 p-3 rounded-lg ${
                active ? "bg-slate-700" : "hover:bg-slate-800"
              }`}
            >
              <item.icon size={20} />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
