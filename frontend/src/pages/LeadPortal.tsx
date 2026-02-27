// LeadPortal.tsx — Route: /portal
// Public page — no login required.
// Lead lands here after form submission. Shows their AI score.

import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"

interface PortalData {
  score:          number
  bucket:         "HOT" | "WARM" | "COLD" | "IGNORE"
  recommendation: string
  name:           string
  email:          string
}

export default function LeadPortal() {
  const [params]  = useSearchParams()
  const [data,    setData]    = useState<PortalData | null>(null)
  const [error,   setError]   = useState("")
  const [loading, setLoading] = useState(true)
  const [shown,   setShown]   = useState(false)

  useEffect(() => {
    const token = params.get("token")
    if (!token) { setError("Invalid link — no token provided."); setLoading(false); return }

    fetch(`${API}/api/v1/ingest/portal-data?token=${encodeURIComponent(token)}`)
      .then(r => {
        if (!r.ok) throw new Error("Link expired or invalid")
        return r.json()
      })
      .then(d => {
        setData(d)
        setLoading(false)
        setTimeout(() => setShown(true), 100)
      })
      .catch(e => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  if (loading) return <PortalShell><LoadingState /></PortalShell>
  if (error)   return <PortalShell><ErrorState message={error} /></PortalShell>
  if (!data)   return null

  const isHot  = data.bucket === "HOT"
  const isWarm = data.bucket === "WARM"
  const isCold = data.bucket === "COLD"

  const bucketConfig = {
    HOT:  { color: "#ef4444", glow: "rgba(239,68,68,.35)",  emoji: "🔥", label: "High Priority",   ring: "#ef444466" },
    WARM: { color: "#f59e0b", glow: "rgba(245,158,11,.3)",  emoji: "⭐", label: "Good Prospect",   ring: "#f59e0b66" },
    COLD: { color: "#64748b", glow: "rgba(100,116,139,.2)", emoji: "❄️", label: "Early Stage",     ring: "#64748b44" },
  }[data.bucket] || { color: "#64748b", glow: "rgba(100,116,139,.2)", emoji: "•", label: "Reviewed", ring: "#64748b44" }

  const scoreAngle = (data.score / 100) * 283 // circumference of r=45 circle

  return (
    <PortalShell>
      <div style={{
        opacity:    shown ? 1 : 0,
        transform:  shown ? "translateY(0)" : "translateY(24px)",
        transition: "all .6s cubic-bezier(.16,1,.3,1)",
      }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 13, letterSpacing: ".15em", color: "#64748b",
            textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>
            ⚡ LeadRanker AI
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: "#0f172a", margin: "0 0 6px",
            letterSpacing: "-1px" }}>
            {data.name ? `Hi ${data.name.split(" ")[0]}!` : "Your Lead Score"}
          </h1>
          <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>
            We've analysed your enquiry. Here's what our AI found.
          </p>
        </div>

        {/* Score ring */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
          <div style={{ position: "relative", width: 160, height: 160 }}>
            <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
              {/* Track */}
              <circle cx="50" cy="50" r="45" fill="none" stroke="#e2e8f0" strokeWidth="8" />
              {/* Progress */}
              <circle
                cx="50" cy="50" r="45" fill="none"
                stroke={bucketConfig.color} strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${scoreAngle} 283`}
                style={{
                  filter: `drop-shadow(0 0 8px ${bucketConfig.glow})`,
                  transition: "stroke-dasharray 1.5s cubic-bezier(.16,1,.3,1) .3s",
                }}
              />
            </svg>
            {/* Centre */}
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: 36, fontWeight: 900, color: bucketConfig.color,
                lineHeight: 1, letterSpacing: "-2px" }}>
                {data.score}
              </span>
              <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700,
                textTransform: "uppercase", letterSpacing: ".1em" }}>
                / 100
              </span>
            </div>
          </div>
        </div>

        {/* Bucket badge */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: `${bucketConfig.color}15`,
            border: `1.5px solid ${bucketConfig.ring}`,
            borderRadius: 100, padding: "8px 20px",
          }}>
            <span style={{ fontSize: 18 }}>{bucketConfig.emoji}</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: bucketConfig.color,
              letterSpacing: ".05em", textTransform: "uppercase" }}>
              {data.bucket}
            </span>
            <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>
              — {bucketConfig.label}
            </span>
          </div>
        </div>

        {/* AI Recommendation */}
        {data.recommendation && (
          <div style={{
            background: "#f8fafc", border: "1px solid #e2e8f0",
            borderLeft: `4px solid ${bucketConfig.color}`,
            borderRadius: "0 12px 12px 0", padding: 20, marginBottom: 24,
          }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8",
              textTransform: "uppercase", letterSpacing: ".12em", margin: "0 0 8px" }}>
              AI Recommendation
            </p>
            <p style={{ fontSize: 15, color: "#1e293b", margin: 0, lineHeight: 1.6 }}>
              {data.recommendation}
            </p>
          </div>
        )}

        {/* What happens next */}
        <div style={{
          background: "#0f172a", borderRadius: 16, padding: 24, marginBottom: 24,
        }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: "#38bdf8",
            textTransform: "uppercase", letterSpacing: ".12em", margin: "0 0 16px" }}>
            What happens next?
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              isHot  && "🔥 Your enquiry has been flagged as HIGH PRIORITY. An agent will contact you very soon.",
              isWarm && "⭐ You're a great match! An agent will reach out shortly to discuss your requirements.",
              isCold && "✅ Your enquiry has been received. An agent will review your details and be in touch.",
            ].filter(Boolean).map((msg, i) => (
              <p key={i} style={{ color: "#cbd5e1", fontSize: 14, margin: 0, lineHeight: 1.6 }}>{msg}</p>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p style={{ textAlign: "center", fontSize: 11, color: "#94a3b8", margin: 0 }}>
          Powered by{" "}
          <a href="https://leadrankerai.com" target="_blank" rel="noreferrer"
            style={{ color: "#38bdf8", textDecoration: "none", fontWeight: 700 }}>
            LeadRanker AI
          </a>
          {" "}· This score is for informational purposes only.
        </p>
      </div>
    </PortalShell>
  )
}

// ── Shell & states ─────────────────────────────────────────────────────────
function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg,#f0f9ff 0%,#f8fafc 50%,#fdf4ff 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px 16px",
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    }}>
      <div style={{
        background: "#fff", borderRadius: 24,
        border: "1px solid #e2e8f0",
        boxShadow: "0 20px 60px rgba(0,0,0,.08)",
        padding: "40px 32px", width: "100%", maxWidth: 460,
      }}>
        {children}
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div style={{ textAlign: "center", padding: "40px 0" }}>
      <div style={{
        width: 44, height: 44, margin: "0 auto 16px",
        border: "3px solid #e2e8f0", borderTopColor: "#2563eb",
        borderRadius: "50%", animation: "spin .8s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <p style={{ color: "#64748b", fontSize: 14, margin: 0, fontWeight: 600 }}>
        Loading your score...
      </p>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 0" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
      <h2 style={{ color: "#dc2626", margin: "0 0 8px", fontSize: 18 }}>Link Expired</h2>
      <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>{message}</p>
    </div>
  )
}