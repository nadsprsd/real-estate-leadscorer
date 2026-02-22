import Sidebar from "../components/Sidebar"
import { Outlet } from "react-router-dom"

export default function MainLayout() {

  return (

    <div className="flex bg-basebg text-text">

      <Sidebar />

      <main className="flex-1 min-h-screen p-8">

        <Outlet />

      </main>

    </div>

  )
}
