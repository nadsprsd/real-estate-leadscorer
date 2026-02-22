import {
  BrowserRouter,
  Routes,
  Route,
  Navigate
} from "react-router-dom"

import { useAuthStore } from "./store/authStore"

import Login from "./pages/Login"
import Register from "./pages/Register"
import ForgotPassword from "./pages/ForgotPassword"
import ResetPassword from "./pages/ResetPassword"
import OAuthSuccess from "./pages/OAuthSuccess"

import Dashboard from "./pages/Dashboard"
import History from "./pages/History"
import Settings from "./pages/Settings"
import Analytics from "./pages/Analytics"
import Billing from "./pages/Billing"
import ConnectionsDetail from './pages/ConnectionsDetail';

import MainLayout from "./layouts/MainLayout"

function ProtectedRoute() {

  const token = useAuthStore((s) => s.token)
  const storedToken = localStorage.getItem("token")

  if (!token && !storedToken) {
    return <Navigate to="/login" replace />
  }

  return <MainLayout />
}

export default function App() {

  return (

    <BrowserRouter>

      <Routes>

        {/* Public */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/oauth-success" element={<OAuthSuccess />} />

        {/* Protected layout wrapper */}
        <Route element={<ProtectedRoute />}>

          <Route path="/" element={<Dashboard />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/connections" element={<ConnectionsDetail />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/billing" element={<Billing />} />
          

        </Route>

        <Route path="*" element={<Navigate to="/" />} />

      </Routes>

    </BrowserRouter>

  )
}
