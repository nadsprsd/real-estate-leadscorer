import Sidebar from "../components/Sidebar"
import { Outlet } from "react-router-dom"
import ErrorToast from "../components/ErrorToast"

export default function MainLayout() {
  return (
    <div className="flex bg-basebg text-text">
      <Sidebar />
      <main className="flex-1 min-h-screen p-8 pt-20 md:pt-8">
        <Outlet />
        <ErrorToast />
      </main>
    </div>
  )
}