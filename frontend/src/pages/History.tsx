import { useEffect, useState } from 'react'
import { api } from '../lib/api'

const API = import.meta.env.VITE_API_URL || "https://api.leadrankerai.com"

interface Lead {
  id: string
  name: string
  email: string
  phone: string
  message: string
  score: number
  bucket: string
  recommendation: string
  created_at: string
  converted?: boolean | null
}

export default function History() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<string>("HOT")
  const [converting, setConverting] = useState<string | null>(null)

  useEffect(() => {
    api.get("/leads/history")
      .then((res) => {
        const arr = Array.isArray(res.data) ? res.data : res.data?.data || res || []
        setLeads(Array.isArray(arr) ? arr : [])
      })
      .catch(() => setLeads([]))
      .finally(() => setLoading(false))
  }, [])

  const filteredLeads = leads.filter(lead =>
    activeTab === "ALL" ? true : lead.bucket === activeTab
  )

  const getStatusColor = (bucket: string) => {
    switch (bucket) {
      case "HOT":  return "#f87171"
      case "WARM": return "#fbbf24"
      case "COLD": return "#60a5fa"
      default:     return "#4b5563"
    }
  }

  // ── Conversion feedback ──────────────────────
  const markConversion = async (leadId: string, converted: boolean) => {
    setConverting(leadId)
    try {
      await api.post(`/leads/${leadId}/conversion`, { converted })
      setLeads(prev => prev.map(l =>
        l.id === leadId ? { ...l, converted } : l
      ))
    } catch (e) {
      // Fallback — store in localStorage if API not ready
      const key = `lead_converted_${leadId}`
      localStorage.setItem(key, String(converted))
      setLeads(prev => prev.map(l =>
        l.id === leadId ? { ...l, converted } : l
      ))
    } finally {
      setConverting(null)
    }
  }

  // Load conversions from localStorage as fallback
  useEffect(() => {
    setLeads(prev => prev.map(l => {
      const stored = localStorage.getItem(`lead_converted_${l.id}`)
      if (stored !== null) return { ...l, converted: stored === 'true' }
      return l
    }))
  }, [leads.length])

  const counts = {
    HOT:     leads.filter(l => l.bucket === "HOT").length,
    WARM:    leads.filter(l => l.bucket === "WARM").length,
    COLD:    leads.filter(l => l.bucket === "COLD").length,
    IGNORED: leads.filter(l => l.bucket === "IGNORE" || l.bucket === "IGNORED").length,
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: '#f1f5f9', margin: 0 }}>
          Lead Center
        </h1>
        <p style={{ color: '#f1f5f9', fontSize: 13, marginTop: 4 }}>
          Track, act, and mark conversions to improve AI accuracy
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {(["HOT", "WARM", "COLD", "IGNORED"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 16px',
              borderRadius: 10,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 13,
              background: activeTab === tab ? getStatusColor(tab) : '#1e293b',
              color: activeTab === tab ? '#000' : '#94a3b8',
              transition: 'all 0.2s',
            }}
          >
            {tab === "HOT" ? `🔥 Hot (${counts.HOT})`
              : tab === "WARM" ? `🌤 Warm (${counts.WARM})`
              : tab === "COLD" ? `❄️ Cold (${counts.COLD})`
              : `Ignored (${counts.IGNORED})`}
          </button>
        ))}
      </div>

      {/* Lead Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading ? (
          <p style={{ color: '#64748b' }}>Loading leads...</p>
        ) : filteredLeads.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#4b5563' }}>
            <p style={{ fontSize: 32, margin: 0 }}>
              {activeTab === "HOT" ? "🔥" : activeTab === "WARM" ? "🌤" : "❄️"}
            </p>
            <p style={{ marginTop: 8 }}>No {activeTab.toLowerCase()} leads yet</p>
          </div>
        ) : (
          filteredLeads.map((lead) => (
            <div
              key={lead.id}
              style={{
                backgroundColor: "#111827",
                border: `1px solid ${getStatusColor(lead.bucket)}`,
                borderRadius: 16,
                padding: 20,
                position: 'relative',
              }}
            >
              {/* Converted badge */}
              {lead.converted === true && (
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  background: '#22c55e', color: '#000',
                  fontSize: 10, fontWeight: 800, padding: '3px 8px',
                  borderRadius: 6,
                }}>
                  ✓ CONVERTED
                </div>
              )}
              {lead.converted === false && (
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  background: '#374151', color: '#9ca3af',
                  fontSize: 10, fontWeight: 800, padding: '3px 8px',
                  borderRadius: 6,
                }}>
                  ✗ NOT CONVERTED
                </div>
              )}

              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <h3 style={{ fontSize: 20, fontWeight: 800, color: '#e2e8f0', margin: 0 }}>
                    {lead.name || "Unknown"}
                  </h3>
                  <p style={{ fontSize: 13, color: '#94a3b8', margin: '2px 0 0' }}>
                    {lead.email || "No Email"}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 28, fontWeight: 900, color: getStatusColor(lead.bucket) }}>
                    {lead.score || 0}
                  </span>
                  <p style={{ fontSize: 10, color: '#64748b', margin: 0 }}>/100</p>
                </div>
              </div>

              {/* AI Insight */}
              <div style={{
                backgroundColor: 'rgba(56,189,248,0.1)',
                padding: '10px 12px',
                borderRadius: 10,
                marginBottom: 12,
                borderLeft: '3px solid #38bdf8'
              }}>
                <p style={{ fontSize: 10, fontWeight: 800, color: '#38bdf8', margin: '0 0 4px' }}>
                  ✨ AI RECOMMENDATION
                </p>
                <p style={{ fontSize: 13, fontStyle: 'italic', margin: 0, color: '#cbd5e1' }}>
                  {lead.recommendation || "Follow up with this lead"}
                </p>
              </div>

              {/* Message */}
              <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16, lineHeight: 1.5 }}>
                "{lead.message}"
              </p>

              {/* Action buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
                <a href={lead.phone ? `tel:${lead.phone}` : "#"}
                  style={actionButtonStyle(lead.phone ? '#38bdf8' : '#334155')}>
                  📞 Call
                </a>
                <a
                  href={lead.phone
                    ? `https://wa.me/${lead.phone.replace(/\D/g,'')}?text=Hi ${lead.name}, I saw your inquiry...`
                    : "#"}
                  target="_blank"
                  style={actionButtonStyle(lead.phone ? '#22c55e' : '#334155')}>
                  💬 WhatsApp
                </a>
                <a href={lead.email ? `mailto:${lead.email}` : "#"}
                  style={actionButtonStyle(lead.email ? '#6366f1' : '#334155')}>
                  ✉️ Email
                </a>
              </div>

              {/* Conversion feedback */}
              {lead.converted === undefined || lead.converted === null ? (
                <div style={{
                  borderTop: '1px solid #1e293b',
                  paddingTop: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                }}>
                  <span style={{ fontSize: 11, color: '#64748b', flex: 1 }}>
                    Did this lead convert?
                  </span>
                  <button
                    onClick={() => markConversion(lead.id, true)}
                    disabled={converting === lead.id}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 8,
                      border: '1px solid #22c55e',
                      background: 'transparent',
                      color: '#22c55e',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    ✓ Yes, converted
                  </button>
                  <button
                    onClick={() => markConversion(lead.id, false)}
                    disabled={converting === lead.id}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 8,
                      border: '1px solid #374151',
                      background: 'transparent',
                      color: '#64748b',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    ✗ No
                  </button>
                </div>
              ) : (
                <div style={{
                  borderTop: '1px solid #1e293b',
                  paddingTop: 10,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span style={{
                    fontSize: 11,
                    color: lead.converted ? '#22c55e' : '#64748b'
                  }}>
                    {lead.converted ? '✓ Marked as converted' : '✗ Marked as not converted'}
                  </span>
                  <button
                    onClick={() => {
                      localStorage.removeItem(`lead_converted_${lead.id}`)
                      setLeads(prev => prev.map(l =>
                        l.id === lead.id ? { ...l, converted: null } : l
                      ))
                    }}
                    style={{
                      fontSize: 10, color: '#4b5563',
                      background: 'none', border: 'none',
                      cursor: 'pointer', textDecoration: 'underline'
                    }}
                  >
                    Undo
                  </button>
                </div>
              )}

              {/* Timestamp */}
              <div style={{ textAlign: 'right', marginTop: 8, fontSize: 10, color: '#374151' }}>
                {lead.created_at ? new Date(lead.created_at).toLocaleString('en-IN') : ""}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

const actionButtonStyle = (color: string): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '10px 5px',
  borderRadius: 10,
  backgroundColor: color,
  color: color === '#334155' ? '#94a3b8' : '#000',
  textDecoration: 'none',
  fontSize: 12,
  fontWeight: 800,
  pointerEvents: color === '#334155' ? 'none' : 'auto',
})

