import { useEffect, useState } from "react"
import { api } from "../lib/api"

export default function LeadCenter() {
  const [leads, setLeads] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<string>("HOT")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadLeads()
  }, [])

  const loadLeads = async () => {
    try {
      setLoading(true)
      const res = await api.get("/leads/history")
      // Ensure we handle the nested 'data' array from your API response
      setLeads(res.data.data || res.data || []) 
    } catch (err) {
      console.error("Failed to load leads", err)
    } finally {
      setLoading(false)
    }
  }

  const filteredLeads = leads.filter(lead => {
    if (activeTab === "IGNORED") return (lead.score || 0) < 20
    return lead.bucket === activeTab
  })

  const getStatusColor = (bucket: string) => {
    switch (bucket) {
      case "HOT": return "#f87171"
      case "WARM": return "#fbbf24"
      case "COLD": return "#60a5fa"
      default: return "#94a3b8"
    }
  }

  return (
    <div style={{ padding: '20px', backgroundColor: '#fff', minHeight: '100vh', color: '#fff' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 20 }}>Lead Center</h1>

      {/* Sorting Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 25, overflowX: 'auto', paddingBottom: 10 }}>
        {["HOT", "WARM", "COLD", "IGNORED"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 20px',
              borderRadius: '25px',
              border: 'none',
              backgroundColor: activeTab === tab ? getStatusColor(tab) : '#1e293b',
              color: activeTab === tab ? '#000' : '#fff',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            {tab === "HOT" ? "🔥 Hot" : tab}
          </button>
        ))}
      </div>

      {/* Log View */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading ? <p>Loading Pulse...</p> : filteredLeads.map((lead) => (
          <div
            key={lead.id}
            style={{
              backgroundColor: "#111827",
              border: `1px solid ${getStatusColor(lead.bucket)}`,
              borderRadius: 16,
              padding: 20
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#38bdf8', margin: 0 }}>{lead.name || "Unknown"}</h3>
                <p style={{ fontSize: 12, color: '#64748b' }}>{lead.email || "No Email"}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 22, fontWeight: 900, color: getStatusColor(lead.bucket) }}>{lead.score || 0}</span>
              </div>
            </div>

            {/* AI Quick-Insight - Pulls from lead.recommendation */}
            <div style={{ 
              backgroundColor: 'rgba(56, 189, 248, 0.2)', 
              padding: '12px', 
              borderRadius: 12, 
              marginBottom: 16,
              borderLeft: `4px solid #38bdf8`
            }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: '#38bdf8', marginBottom: 4 }}>✨ AI QUICK-INSIGHT</p>
              <p style={{ fontSize: 13, fontStyle: 'italic', margin: 0 }}>
                {lead.recommendation || "Analyzing intent..."}
              </p>
            </div>

            <p style={{ fontSize: 14, color: '#cbd5e1', marginBottom: 20 }}>"{lead.message}"</p>

            {/* One-Tap Actions with Null Checks */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <a href={lead.phone ? `tel:${lead.phone}` : "#"} style={actionButtonStyle(lead.phone ? '#38bdf8' : '#334155')}>
                📞 Call
              </a>
              <a 
                href={lead.phone ? `https://wa.me/${lead.phone.replace(/\D/g,'')}?text=Hi ${lead.name}, I saw your inquiry...` : "#"} 
                target="_blank" 
                style={actionButtonStyle(lead.phone ? '#22c55e' : '#334155')}
              >
                💬 WhatsApp
              </a>
              <a href={lead.email ? `mailto:${lead.email}` : "#"} style={actionButtonStyle(lead.email ? '#6366f1' : '#334155')}>
                ✉️ Email
              </a>
            </div>

            <div style={{ textAlign: 'right', marginTop: 12, fontSize: 10, color: '#4b5563' }}>
              {lead.created_at ? new Date(lead.created_at).toLocaleString('en-IN') : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const actionButtonStyle = (color: string) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '12px 5px',
  borderRadius: '10px',
  backgroundColor: color,
  color: color === '#334155' ? '#94a3b8' : '#000',
  textDecoration: 'none',
  fontSize: '12px',
  fontWeight: '800',
  pointerEvents: color === '#334155' ? 'none' : 'auto' as any
})