import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { Outlet } from "react-router-dom";

export default function DashboardLayout() {
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 flex flex-col h-screen">
        <Topbar />
        <div className="p-6 bg-gray-50 flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
