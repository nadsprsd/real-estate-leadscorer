import {
  BrowserRouter,
  Routes,
  Route,
  Navigate
} from "react-router-dom"

import { useAuthStore } from "./store/authStore"

// Public pages
import Login          from "./pages/Login"
import Register       from "./pages/Register"
import ForgotPassword from "./pages/ForgotPassword"
import ResetPassword  from "./pages/ResetPassword"
import OAuthSuccess   from "./pages/OAuthSuccess"
import TermsOfService from "./pages/TermsOfService"
import PrivacyPolicy  from "./pages/PrivacyPolicy"
import LeadPortal     from "./pages/LeadPortal"   // ← PUBLIC: leads land here, no login needed

// Protected pages
import Dashboard         from "./pages/Dashboard"
import History           from "./pages/History"
import Settings          from "./pages/Settings"
import Analytics         from "./pages/Analytics"
import Billing           from "./pages/Billing"
import ConnectionsDetail from "./pages/ConnectionsDetail"

import MainLayout from "./layouts/MainLayout"
import Ranky      from "./components/Ranky"

// ── Protected route wrapper ────────────────────────────────────────────────
// Ranky is rendered HERE — so it only appears when the user is logged in,
// on every protected page (Dashboard, History, Settings, etc.)
function ProtectedRoute() {
  const token       = useAuthStore((s) => s.token)
  const storedToken = localStorage.getItem("token")

  if (!token && !storedToken) {
    return <Navigate to="/login" replace />
  }

  return (
    <>
      <MainLayout />
      <Ranky />   {/* floats on all dashboard pages, invisible on public pages */}
    </>
  )
}

// ── App ───────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* ── FULLY PUBLIC — no login required ──────────────────────────
            These must be OUTSIDE ProtectedRoute.
            /portal  → leads land here after form submission (no account)
            /terms   → legal pages must be publicly accessible
            /privacy → same
            Ranky does NOT appear on any of these pages.
        ──────────────────────────────────────────────────────────────── */}
        <Route path="/login"           element={<Login />} />
        <Route path="/register"        element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/oauth-success"   element={<OAuthSuccess />} />
        <Route path="/portal"          element={<LeadPortal />} />
        <Route path="/terms"           element={<TermsOfService />} />
        <Route path="/privacy"         element={<PrivacyPolicy />} />

        {/* ── PROTECTED — must be logged in ─────────────────────────── */}
        {/* Ranky bubble appears on ALL of these pages automatically     */}
        <Route element={<ProtectedRoute />}>
          <Route path="/"            element={<Dashboard />} />
          <Route path="/dashboard"   element={<Dashboard />} />
          <Route path="/history"     element={<History />} />
          <Route path="/settings"    element={<Settings />} />
          <Route path="/connections" element={<ConnectionsDetail />} />
          <Route path="/analytics"   element={<Analytics />} />
          <Route path="/billing"     element={<Billing />} />
        </Route>

        {/* ── Catch-all ─────────────────────────────────────────────── */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </BrowserRouter>
  )
}