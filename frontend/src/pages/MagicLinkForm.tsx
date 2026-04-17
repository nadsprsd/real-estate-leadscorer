// src/pages/MagicLinkForm.tsx
// Public page — buyers fill this form, no login needed
import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"

const API = import.meta.env.VITE_API_URL || "https://api.leadrankerai.com"

interface AgentProfile {
  agent_name: string
  industry: string
  industry_label: string
  slug: string
}

const INDUSTRY_QUESTIONS: Record<string, {
  messagePlaceholder: string
  budgetPlaceholder: string
  timelinePlaceholder: string
}> = {
  real_estate: {
    messagePlaceholder: "e.g. Looking for 3BHK flat in Kochi, prefer gated community",
    budgetPlaceholder: "e.g. 50 lakhs",
    timelinePlaceholder: "e.g. Within 3 months",
  },
  logistics: {
    messagePlaceholder: "e.g. Need to ship 5 tonnes from Kochi to Dubai weekly",
    budgetPlaceholder: "e.g. ₹50,000/month",
    timelinePlaceholder: "e.g. Starting next week",
  },
  healthcare: {
    messagePlaceholder: "e.g. Need appointment for knee pain consultation",
    budgetPlaceholder: "e.g. ₹2,000",
    timelinePlaceholder: "e.g. This week",
  },
  default: {
    messagePlaceholder: "Tell us what you're looking for...",
    budgetPlaceholder: "e.g. ₹50,000",
    timelinePlaceholder: "e.g. Within 1 month",
  }
}

export default function MagicLinkForm() {
  const { slug } = useParams<{ slug: string }>()
  const navigate  = useNavigate()

  const [profile,    setProfile]    = useState<AgentProfile | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  const [error,      setError]      = useState("")
  const [result,     setResult]     = useState<any>(null)

  const [form, setForm] = useState({
    name:     "",
    phone:    "",
    message:  "",
    budget:   "",
    timeline: "",
  })

  useEffect(() => {
    if (!slug) return
    fetch(`${API}/api/v1/public/s/${slug}`)
      .then(r => r.json())
      .then(d => {
        if (d.detail) setError("This link is not available.")
        else setProfile(d)
      })
      .catch(() => setError("Could not load this page."))
      .finally(() => setLoading(false))
  }, [slug])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.phone || !form.message) {
      setError("Please fill in all required fields.")
      return
    }
    setSubmitting(true)
    setError("")
    try {
      const res = await fetch(`${API}/api/v1/public/s/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      })
    const data = await res.json()
     if (!res.ok) {
     const errMsg = Array.isArray(data.detail)
     ? data.detail[0]?.msg || "Please check your inputs"
    : data.detail || "Submission failed"
    throw new Error(errMsg)
}

      setResult(data)
      setSubmitted(true)
      // Redirect to portal after 1 second
      if (data.portal_token) {
        setTimeout(() => {
          navigate(`/portal?token=${data.portal_token}`)
        }, 1500)
      }
    } catch (err: any) {
    const msg = typeof err === "string" ? err
    : err?.message || "Something went wrong. Please try again."
    setError(msg)
}
  }

  const questions = INDUSTRY_QUESTIONS[profile?.industry || "default"] || INDUSTRY_QUESTIONS.default

  if (loading) return (
    <div style={{
      minHeight: "100vh", background: "#09090b",
      display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 40, height: 40, border: "3px solid #1c1f26",
          borderTop: "3px solid #00d4a8", borderRadius: "50%",
          animation: "spin 1s linear infinite", margin: "0 auto 16px"
        }} />
        <p style={{ color: "#52525b", fontSize: 14 }}>Loading...</p>
      </div>
    </div>
  )

  if (error && !profile) return (
    <div style={{
      minHeight: "100vh", background: "#09090b",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24
    }}>
      <div style={{ textAlign: "center", maxWidth: 400 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
        <h2 style={{ color: "#fff", fontSize: 20, marginBottom: 8 }}>Link not found</h2>
        <p style={{ color: "#71717a", fontSize: 14 }}>This link may have expired or been removed.</p>
      </div>
    </div>
  )

  if (submitted && result) return (
    <div style={{
      minHeight: "100vh", background: "#09090b",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24
    }}>
      <div style={{
        background: "#0d0e11", border: "1px solid #1c1f26",
        borderRadius: 20, padding: 40, maxWidth: 420, width: "100%", textAlign: "center"
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>
          {result.bucket === "HOT" ? "🔥" : result.bucket === "WARM" ? "🌤" : "✅"}
        </div>
        <h2 style={{ color: "#fff", fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
          Inquiry Received!
        </h2>
        <p style={{ color: "#a1a1aa", fontSize: 15, marginBottom: 24 }}>
          {profile?.agent_name} will contact you shortly.
        </p>
        <p style={{ color: "#52525b", fontSize: 12 }}>Redirecting to your result...</p>
      </div>
    </div>
  )

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        input, textarea, select {
          outline: none;
          transition: border-color 0.2s;
        }
        input:focus, textarea:focus {
          border-color: #00d4a8 !important;
        }
        .submit-btn:hover { opacity: 0.9; transform: translateY(-1px); }
        .submit-btn:active { transform: translateY(0); }
        .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#09090b", padding: "24px 16px" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>

          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "#0d0e11", border: "1px solid #1c1f26",
              borderRadius: 40, padding: "8px 16px", marginBottom: 20
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: "linear-gradient(135deg, #00d4a8, #0ea5e9)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 900, color: "#000"
              }}>LR</div>
              <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>
                LeadRanker<span style={{ color: "#00d4a8" }}>AI</span>
              </span>
            </div>

            <h1 style={{
              color: "#fff", fontSize: 26, fontWeight: 800,
              marginBottom: 8, letterSpacing: "-0.03em", lineHeight: 1.2
            }}>
              {profile?.agent_name}
            </h1>
            <p style={{ color: "#71717a", fontSize: 14 }}>
              {profile?.industry_label} Professional
            </p>
          </div>

          {/* Form card */}
          <div style={{
            background: "#0d0e11", border: "1px solid #1c1f26",
            borderRadius: 20, padding: 28
          }}>
            <h2 style={{
              color: "#fff", fontSize: 17, fontWeight: 700,
              marginBottom: 6, marginTop: 0
            }}>
              Tell us what you're looking for
            </h2>
            <p style={{ color: "#71717a", fontSize: 13, marginBottom: 24, marginTop: 0 }}>
              Fill in the details below and {profile?.agent_name?.split(" ")[0]} will get back to you.
            </p>

            {error && (
              <div style={{
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 10, padding: "10px 14px", marginBottom: 16,
                color: "#f87171", fontSize: 13
              }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Name */}
              <div>
                <label style={{ color: "#a1a1aa", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
                  Your Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Nandu Prasad"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                  style={{
                    width: "100%", padding: "12px 14px",
                    background: "#060608", border: "1px solid #1c1f26",
                    borderRadius: 10, color: "#fff", fontSize: 14
                  }}
                />
              </div>

              {/* Phone */}
              <div>
                <label style={{ color: "#a1a1aa", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
                  Phone Number *
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 7994072017"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  required
                  style={{
                    width: "100%", padding: "12px 14px",
                    background: "#060608", border: "1px solid #1c1f26",
                    borderRadius: 10, color: "#fff", fontSize: 14
                  }}
                />
              </div>

              {/* Message */}
              <div>
                <label style={{ color: "#a1a1aa", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
                  What are you looking for? *
                </label>
                <textarea
                  placeholder={questions.messagePlaceholder}
                  value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  required
                  rows={3}
                  style={{
                    width: "100%", padding: "12px 14px",
                    background: "#060608", border: "1px solid #1c1f26",
                    borderRadius: 10, color: "#fff", fontSize: 14,
                    resize: "vertical", fontFamily: "inherit"
                  }}
                />
              </div>

              {/* Budget */}
              <div>
                <label style={{ color: "#a1a1aa", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
                  Budget <span style={{ color: "#52525b", fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder={questions.budgetPlaceholder}
                  value={form.budget}
                  onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
                  style={{
                    width: "100%", padding: "12px 14px",
                    background: "#060608", border: "1px solid #1c1f26",
                    borderRadius: 10, color: "#fff", fontSize: 14
                  }}
                />
              </div>

              {/* Timeline */}
              <div>
                <label style={{ color: "#a1a1aa", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
                  When do you need it? <span style={{ color: "#52525b", fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder={questions.timelinePlaceholder}
                  value={form.timeline}
                  onChange={e => setForm(f => ({ ...f, timeline: e.target.value }))}
                  style={{
                    width: "100%", padding: "12px 14px",
                    background: "#060608", border: "1px solid #1c1f26",
                    borderRadius: 10, color: "#fff", fontSize: 14
                  }}
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                className="submit-btn"
                style={{
                  width: "100%", padding: "14px",
                  background: "#00d4a8", color: "#000",
                  border: "none", borderRadius: 12,
                  fontSize: 15, fontWeight: 800,
                  cursor: "pointer", marginTop: 8,
                  transition: "all 0.2s"
                }}
              >
                {submitting ? "Sending..." : "Send Inquiry →"}
              </button>

            </form>
          </div>

          {/* Footer */}
          <div style={{ textAlign: "center", marginTop: 24 }}>
            <p style={{ color: "#3f3f46", fontSize: 11 }}>
              Powered by{" "}
              <a href="https://leadrankerai.com" style={{ color: "#52525b" }}>
                LeadRankerAI
              </a>
              {" "}· Your data is secure and private
            </p>
          </div>

        </div>
      </div>
    </>
  )
}

