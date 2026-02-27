import { useEffect, useState, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useAuthStore } from "../store/auth"
import {
  User, Shield, Bell, HelpCircle, Trash2, PlayCircle,
  Fingerprint, ChevronRight, Loader2, CheckCircle, XCircle,
  AlertTriangle, Camera, Building2, Briefcase, Lock,
  Eye, EyeOff, ExternalLink, BookOpen, FileText,
  LifeBuoy, ChevronDown, ChevronUp, Key, LogOut, Upload,
} from "lucide-react"

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"

type Toast = { type: "success" | "error" | "warning"; message: string }

interface Profile {
  email: string
  brokerage_name: string
  industry: string
  role: string
  notification_threshold: number
  email_alerts: boolean
  hot_lead_only: boolean
  avatar_url?: string | null
}

interface Connections { email_forwarding: string; webhook_url: string }

const INDUSTRIES = [
  { value: "real_estate", label: "Real Estate" },
  { value: "logistics",   label: "Logistics" },
  { value: "brokerage",   label: "Brokerage" },
  { value: "insurance",   label: "Insurance" },
  { value: "other",       label: "Other" },
]
const ROLES = ["Manager", "Agent", "Admin", "Developer"]

export default function Settings() {
  const navigate    = useNavigate()
  const logout      = useAuthStore((s) => s.logout)
  const token       = useAuthStore((s) => s.token)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [profile,      setProfile]      = useState<Profile>({
    email: "", brokerage_name: "", industry: "real_estate",
    role: "Manager", notification_threshold: 80,
    email_alerts: true, hot_lead_only: false,
  })
  const [connections,  setConnections]  = useState<Connections | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)

  const [showPassword, setShowPassword] = useState(false)
  const [pwForm,       setPwForm]       = useState({ current: "", next: "", confirm: "" })
  const [showPw,       setShowPw]       = useState({ current: false, next: false, confirm: false })
  const [pwLoading,    setPwLoading]    = useState(false)

  const [showConnections, setShowConnections] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirm,   setDeleteConfirm]   = useState("")
  const [deleting,        setDeleting]        = useState(false)

  const [toast, setToast] = useState<Toast | null>(null)

  // ── Auth header helper ─────────────────────
  const authHeaders = useCallback(() => ({
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token || localStorage.getItem("token") || ""}`
  }), [token])

  // ── Toast ──────────────────────────────────
  const showToast = useCallback((type: Toast["type"], message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 5000)
  }, [])

  // ── Load profile ───────────────────────────
  useEffect(() => {
    if (!token) { navigate("/login"); return }

    const load = async () => {
      setLoading(true)
      try {
        const [profileRes, connRes] = await Promise.allSettled([
          fetch(`${API}/api/v1/auth/me`, { headers: authHeaders() }),
          fetch(`${API}/settings/connections`,  { headers: authHeaders() }),
        ])

        if (profileRes.status === "fulfilled" && profileRes.value.ok) {
          const d = await profileRes.value.json()
          setProfile({
            email:                  d.email         || "",
            brokerage_name:         d.brokerage_name || "",
            industry:               d.industry      || "real_estate",
            role:                   d.role          || "Manager",
            notification_threshold: d.notification_threshold ?? 80,
            email_alerts:           d.email_alerts  ?? true,
            hot_lead_only:          d.hot_lead_only ?? false,
            avatar_url:             d.avatar_url    || null,
          })
        } else if (profileRes.status === "fulfilled" && profileRes.value.status === 401) {
          // Token expired — force re-login
          logout(); navigate("/login"); return
        }

        if (connRes.status === "fulfilled" && connRes.value.ok) {
          const d = await connRes.value.json()
          setConnections(d.data || d)
        }
      } catch (err) {
        console.warn("Settings load failed:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save profile ───────────────────────────
  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`${API}/api/v1/auth/me`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          brokerage_name:         profile.brokerage_name,
          industry:               profile.industry,
          role:                   profile.role,
          notification_threshold: profile.notification_threshold,
          email_alerts:           profile.email_alerts,
          hot_lead_only:          profile.hot_lead_only,
        }),
      })

      if (res.status === 401) { logout(); navigate("/login"); return }
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d?.detail || "Save failed")
      }

      showToast("success", "✅ Profile saved successfully")
    } catch (err: any) {
      showToast("error", err?.message || "Failed to save profile")
    } finally {
      setSaving(false)
    }
  }

  // ── Avatar upload ──────────────────────────
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate
    if (!file.type.startsWith("image/")) {
      showToast("error", "Please select an image file (PNG, JPG, WebP)")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("error", "Image must be under 5MB")
      return
    }

    setAvatarUploading(true)
    try {
      // Show local preview immediately
      const reader = new FileReader()
      reader.onload = (ev) => {
        setProfile(p => ({ ...p, avatar_url: ev.target?.result as string }))
      }
      reader.readAsDataURL(file)

      // Upload to backend
      // Backend /api/v1/auth/avatar currently returns 501 until you configure cloud storage.
      // The local preview still works — avatar_url is just stored locally until backend is wired.
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch(`${API}/api/v1/auth/avatar`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token || localStorage.getItem("token") || ""}` },
        body: formData,
      })

      if (res.status === 501) {
        // Expected until cloud storage is configured — preview still shows
        showToast("warning", "Avatar preview saved locally. Cloud storage not configured yet.")
        return
      }
      if (!res.ok) throw new Error("Upload failed")

      const d = await res.json()
      if (d.avatar_url) setProfile(p => ({ ...p, avatar_url: d.avatar_url }))
      showToast("success", "✅ Avatar updated!")

    } catch (err: any) {
      if (!err?.message?.includes("501")) {
        showToast("error", err?.message || "Avatar upload failed")
      }
    } finally {
      setAvatarUploading(false)
    }
  }

  // ── Change password ────────────────────────
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pwForm.next !== pwForm.confirm) {
      showToast("error", "New passwords don't match")
      return
    }
    if (pwForm.next.length < 8) {
      showToast("error", "Password must be at least 8 characters")
      return
    }
    setPwLoading(true)
    try {
      const res = await fetch(`${API}/api/v1/auth/change-password`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ current_password: pwForm.current, new_password: pwForm.next }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.detail || "Failed")
      showToast("success", "✅ Password updated!")
      setPwForm({ current: "", next: "", confirm: "" })
      setShowPassword(false)
    } catch (err: any) {
      showToast("error", err?.message || "Failed to change password")
    } finally {
      setPwLoading(false)
    }
  }

  // ── Delete account ─────────────────────────
  const handleDelete = async () => {
    if (deleteConfirm !== "DELETE") {
      showToast("error", 'You must type "DELETE" exactly to confirm')
      return
    }
    setDeleting(true)
    try {
      const res = await fetch(`${API}/api/v1/auth/account`, {
        method: "DELETE",
        headers: authHeaders(),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d?.detail || "Delete failed")
      }
      logout()
      localStorage.clear()
      sessionStorage.clear()
      window.location.href = "/"
    } catch (err: any) {
      showToast("error", err?.message || "Delete failed. Contact support.")
      setDeleting(false)
      setShowDeleteModal(false)
    }
  }

  const avatarInitials = (profile.brokerage_name || profile.email || "?")
    .split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 size={28} className="animate-spin" />
          <p className="text-sm font-medium">Loading settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto p-5 md:p-8 space-y-6">

        {/* Toast */}
        {toast && (
          <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-4
            rounded-2xl shadow-2xl text-white text-sm font-semibold max-w-sm
            ${toast.type === "success" ? "bg-green-600"
              : toast.type === "error"   ? "bg-red-600" : "bg-amber-500"}`}>
            {toast.type === "success" && <CheckCircle size={18} />}
            {toast.type === "error"   && <XCircle     size={18} />}
            {toast.type === "warning" && <AlertTriangle size={18} />}
            <span>{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-auto opacity-70 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-black text-slate-900">Settings</h1>
            <p className="text-slate-500 text-sm mt-1">Manage your profile and preferences</p>
          </div>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5
              rounded-xl font-bold text-sm hover:bg-blue-700 transition-all disabled:opacity-60">
            {saving
              ? <><Loader2 size={16} className="animate-spin" /> Saving...</>
              : <><CheckCircle size={16} /> Save Changes</>}
          </button>
        </div>

        {/* ═══ PAGE 6: USER & TEAM PROFILE ══════ */}
        <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 p-6 border-b border-slate-100">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <User size={18} className="text-white" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-lg">User & Team Profile</h2>
              <p className="text-xs text-slate-500">Identity, role, and brokerage information</p>
            </div>
          </div>

          <div className="p-6 space-y-6">

            {/* Avatar */}
            <div className="flex items-center gap-5">
              <div className="relative">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="Avatar"
                    className="w-20 h-20 rounded-2xl object-cover border-2 border-slate-200" />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600
                    flex items-center justify-center text-white text-2xl font-black select-none">
                    {avatarInitials}
                  </div>
                )}
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="absolute -bottom-2 -right-2 w-8 h-8 bg-white border-2 border-slate-200
                    rounded-xl flex items-center justify-center hover:bg-blue-50 transition-all
                    shadow-sm disabled:opacity-60"
                  title="Upload avatar"
                >
                  {avatarUploading
                    ? <Loader2 size={13} className="animate-spin text-blue-600" />
                    : <Camera size={13} className="text-slate-600" />}
                </button>
              </div>
              <div>
                <p className="font-bold text-slate-800 text-lg">{profile.brokerage_name || "Your Brokerage"}</p>
                <p className="text-slate-500 text-sm">{profile.email}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
                    {profile.role}
                  </span>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-blue-600 hover:underline font-medium"
                  >
                    Change photo
                  </button>
                </div>
              </div>
            </div>

            {/* Form fields */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500
                  uppercase tracking-widest mb-1.5">
                  <Building2 size={12} /> Brokerage Name
                </label>
                <input type="text"
                  className="w-full border border-slate-200 focus:border-blue-500 focus:ring-2
                    focus:ring-blue-100 rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                  value={profile.brokerage_name}
                  onChange={e => setProfile(p => ({ ...p, brokerage_name: e.target.value }))}
                  placeholder="Sunrise Properties Ltd." />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500
                  uppercase tracking-widest mb-1.5">
                  <Briefcase size={12} /> Your Role
                </label>
                <select
                  className="w-full border border-slate-200 focus:border-blue-500 focus:ring-2
                    focus:ring-blue-100 rounded-xl px-4 py-2.5 text-sm outline-none transition-all bg-white"
                  value={profile.role}
                  onChange={e => setProfile(p => ({ ...p, role: e.target.value }))}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                  Industry
                </label>
                <select
                  className="w-full border border-slate-200 focus:border-blue-500 focus:ring-2
                    focus:ring-blue-100 rounded-xl px-4 py-2.5 text-sm outline-none transition-all bg-white"
                  value={profile.industry}
                  onChange={e => setProfile(p => ({ ...p, industry: e.target.value }))}>
                  {INDUSTRIES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <input type="email" disabled
                    className="w-full border border-slate-100 rounded-xl px-4 py-2.5 text-sm
                      bg-slate-50 text-slate-400 cursor-not-allowed"
                    value={profile.email} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400
                    bg-slate-100 px-1.5 py-0.5 rounded font-medium">Locked</span>
                </div>
              </div>
            </div>

            {/* Security & Preferences */}
            <div className="pt-2 border-t border-slate-100 space-y-4">
              <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                <Shield size={15} className="text-slate-500" /> Notifications & Security
              </h3>

              {/* Note about biometric */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 flex gap-2">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Biometric lock</strong> will be available in the iOS/Android app (Q3 2026).
                  On web, your session is secured by JWT tokens that expire automatically.
                </span>
              </div>

              {[
                {
                  key: "email_alerts" as const,
                  icon: <Bell size={18} className="text-slate-600" />,
                  title: "Email Alerts",
                  desc: "Receive email notifications for new scored leads"
                },
                {
                  key: "hot_lead_only" as const,
                  icon: <span className="text-base">🔥</span>,
                  title: "HOT Leads Only",
                  desc: "Only send alerts when a lead is scored HOT (≥80)"
                },
              ].map(({ key, icon, title, desc }) => (
                <div key={key} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-white rounded-xl border border-slate-200 flex items-center justify-center">
                      {icon}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-slate-800">{title}</p>
                      <p className="text-xs text-slate-500">{desc}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setProfile(p => ({ ...p, [key]: !p[key] }))}
                    className={`w-12 h-6 rounded-full transition-all duration-200 relative flex-shrink-0
                      ${profile[key] ? "bg-blue-600" : "bg-slate-300"}`}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200
                      ${profile[key] ? "left-7" : "left-1"}`} />
                  </button>
                </div>
              ))}

              {/* Score threshold */}
              <div className="p-4 bg-slate-50 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-white rounded-xl border border-slate-200 flex items-center justify-center">
                      <Bell size={18} className="text-purple-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-slate-800">Alert Score Threshold</p>
                      <p className="text-xs text-slate-500">Only alert for leads scoring above this value</p>
                    </div>
                  </div>
                  <span className="font-black text-blue-600 text-2xl tabular-nums w-12 text-right">
                    {profile.notification_threshold}
                  </span>
                </div>
                <input type="range" min="0" max="100"
                  value={profile.notification_threshold}
                  onChange={e => setProfile(p => ({ ...p, notification_threshold: parseInt(e.target.value) }))}
                  className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-600" />
                <div className="flex justify-between text-xs text-slate-400 font-medium">
                  <span>0 — All leads</span>
                  <span>100 — Perfect only</span>
                </div>
              </div>

              {/* Remember to save */}
              <p className="text-xs text-slate-400 text-center">
                ↑ Click <strong>Save Changes</strong> at the top to apply these settings
              </p>
            </div>

            {/* Change password */}
            <div className="pt-2 border-t border-slate-100">
              <button onClick={() => setShowPassword(!showPassword)}
                className="flex items-center gap-2 text-sm font-semibold text-slate-600
                  hover:text-blue-600 transition-colors">
                <Key size={15} />
                Change Password
                {showPassword ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showPassword && (
                <form onSubmit={handlePasswordChange} className="mt-4 space-y-3">
                  {(["current", "next", "confirm"] as const).map(f => {
                    const labels = { current: "Current Password", next: "New Password", confirm: "Confirm New" }
                    return (
                      <div key={f}>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                          {labels[f]}
                        </label>
                        <div className="relative">
                          <input
                            type={showPw[f] ? "text" : "password"}
                            required minLength={f !== "current" ? 8 : undefined}
                            className="w-full border border-slate-200 focus:border-blue-500 focus:ring-2
                              focus:ring-blue-100 rounded-xl px-4 py-2.5 pr-10 text-sm outline-none transition-all"
                            value={pwForm[f]}
                            onChange={e => setPwForm(p => ({ ...p, [f]: e.target.value }))} />
                          <button type="button" tabIndex={-1}
                            onClick={() => setShowPw(p => ({ ...p, [f]: !p[f] }))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                            {showPw[f] ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  <button type="submit" disabled={pwLoading}
                    className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5
                      rounded-xl font-bold text-sm hover:bg-slate-700 transition-all disabled:opacity-60">
                    {pwLoading
                      ? <><Loader2 size={15} className="animate-spin" /> Updating...</>
                      : <><Lock size={15} /> Update Password</>}
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>

        {/* ═══ PAGE 7: HELP & LEGAL ═════════════ */}
        <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 p-6 border-b border-slate-100">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
              <HelpCircle size={18} className="text-white" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-lg">Help & Legal</h2>
              <p className="text-xs text-slate-500">Resources, compliance, and account actions</p>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <div className="grid md:grid-cols-2 gap-3">
              {[
                { icon: <PlayCircle size={20} className="text-white" />, bg: "bg-blue-600",
                  title: "Quick-Start Guide", desc: "30-second video walkthrough",
                  href: `${window.location.origin}/docs/quickstart` },
                { icon: <BookOpen size={20} className="text-white" />, bg: "bg-slate-800",
                  title: "Documentation", desc: "API & integration reference",
                  href: `${API}/docs` },
                { icon: <Shield size={20} className="text-white" />, bg: "bg-emerald-600",
                  title: "Privacy Policy", desc: "How we handle your data",
                  href: "/privacy" },
                { icon: <FileText size={20} className="text-white" />, bg: "bg-slate-600",
                  title: "Terms of Service", desc: "Usage terms and conditions",
                  href: "/terms" },
                { icon: <LifeBuoy size={20} className="text-white" />, bg: "bg-purple-600",
                  title: "Contact Support", desc: "hello@leadrankerai.com",
                  href: "mailto:hello@leadrankerai.com" },
              ].map(({ icon, bg, title, desc, href }) => (
                <a key={title} href={href}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl
                    border border-slate-200 group hover:border-blue-200 transition-all">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                      {icon}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-slate-800">{title}</p>
                      <p className="text-xs text-slate-500">{desc}</p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-400 transition-colors" />
                </a>
              ))}

              {/* Sign out */}
              <button
                onClick={() => { logout(); localStorage.clear(); window.location.href = "/login" }}
                className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl
                  border border-slate-200 group hover:border-red-200 transition-all text-left">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-200 rounded-xl flex items-center justify-center flex-shrink-0">
                    <LogOut size={20} className="text-slate-600" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-slate-800">Sign Out</p>
                    <p className="text-xs text-slate-500">End your current session</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-300 group-hover:text-red-400 transition-colors" />
              </button>
            </div>

            {/* AI data note */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex gap-3">
              <Shield size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm text-blue-800">How we use your data</p>
                <p className="text-xs text-blue-700 mt-1 leading-relaxed">
                  Your lead data is processed <strong>only to generate scores for your brokerage</strong>.
                  We never sell, share, or use it for advertising. All data is encrypted at rest (AES-256)
                  and in transit (TLS 1.3). Compliant with Indian IT Act 2000, GDPR (EU clients),
                  and Kerala state data protection guidelines. You can request full deletion at any time.
                </p>
              </div>
            </div>

            {/* Danger zone */}
            <div className="border-2 border-red-200 bg-red-50 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={18} className="text-red-600" />
                <h3 className="font-black text-red-800 text-sm uppercase tracking-widest">Danger Zone</h3>
              </div>
              <p className="text-red-600 text-xs mb-4 leading-relaxed">
                Permanently delete your account and all data — leads, scores, referrals, billing history.
                <strong> This cannot be undone. No refunds for unused subscription time.</strong>
              </p>
              <button onClick={() => setShowDeleteModal(true)}
                className="flex items-center gap-2 bg-white text-red-600 border-2 border-red-200
                  px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-red-600 hover:text-white
                  hover:border-red-600 transition-all">
                <Trash2 size={16} /> Delete Account & Wipe All Data
              </button>
            </div>
          </div>
        </section>

        {/* System Connections */}
        {connections && (
          <section className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
            <button onClick={() => setShowConnections(!showConnections)}
              className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                </div>
                <div className="text-left">
                  <h3 className="font-bold text-slate-800">System Connections</h3>
                  <p className="text-xs text-slate-500">Email forwarding & webhook endpoints</p>
                </div>
              </div>
              {showConnections ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
            </button>

            {showConnections && (
              <div className="bg-slate-900 px-6 pb-6 space-y-4">
                {[
                  { label: "Email Forwarding", value: connections.email_forwarding },
                  { label: "Webhook Endpoint", value: connections.webhook_url },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-slate-500 text-xs mb-1 uppercase tracking-widest font-medium">{label}</p>
                    <div className="flex items-center gap-2">
                      <p className="bg-slate-800 text-slate-300 p-3 rounded-xl border border-slate-700
                        font-mono text-xs break-all flex-1">{value}</p>
                      <button
                        onClick={() => { navigator.clipboard.writeText(value); showToast("success", "Copied!") }}
                        className="text-slate-400 hover:text-white p-2 transition-colors flex-shrink-0"
                        title="Copy">
                        📋
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

      </div>

      {/* Delete modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center">
                <Trash2 size={22} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-black text-slate-900">Delete Account</h3>
                <p className="text-xs text-red-600 font-medium">Permanent — cannot be undone</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-5 text-sm text-red-700">
              This will permanently delete:
              <ul className="mt-2 space-y-1 text-xs list-disc list-inside">
                <li>All lead scores and history</li>
                <li>All referrals and earned credits</li>
                <li>Your brokerage profile</li>
                <li>Active subscription (no refund)</li>
              </ul>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                Type <span className="text-red-600 font-black">DELETE</span> to confirm
              </label>
              <input type="text" autoFocus
                className="w-full border-2 border-red-200 focus:border-red-500 rounded-xl
                  px-4 py-3 text-sm outline-none font-mono font-bold"
                placeholder="DELETE"
                value={deleteConfirm}
                onChange={e => setDeleteConfirm(e.target.value)} />
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setShowDeleteModal(false); setDeleteConfirm("") }}
                className="flex-1 py-3 rounded-xl border-2 border-slate-200 font-bold text-sm
                  text-slate-600 hover:bg-slate-50 transition-all">
                Cancel
              </button>
              <button onClick={handleDelete}
                disabled={deleting || deleteConfirm !== "DELETE"}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold text-sm
                  hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all
                  flex items-center justify-center gap-2">
                {deleting
                  ? <><Loader2 size={15} className="animate-spin" /> Deleting...</>
                  : <><Trash2 size={15} /> Delete Forever</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}