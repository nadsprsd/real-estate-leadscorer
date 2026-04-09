import { useState, useEffect } from "react"
import { api } from "../lib/api"
import WelcomeBanner from "../components/WelcomeBanner"

export default function Dashboard() {
  const [leads,   setLeads]   = useState<any[]>([])
  const [metrics, setMetrics] = useState({ hotCount: 0, topSource: "..." })
  const [loading, setLoading] = useState(true)
  const PLAN_LIMIT = 50

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await api.get("/leads/history")
        const leadsArray = Array.isArray(response.data)
          ? response.data
          : response.data?.data || []
        setLeads(leadsArray)

        const hot = leadsArray.filter((l: any) => l.bucket === "HOT").length

        const sourceCounts = leadsArray.reduce((acc: any, lead: any) => {
          const s = lead.source || "Website"
          acc[s] = (acc[s] || 0) + 1
          return acc
        }, {})

        const top = Object.entries(sourceCounts).reduce(
          (a: any, b: any) => (a[1] > b[1] ? a : b),
          ["Website", 0]
        )[0] as string

        setMetrics({ hotCount: hot, topSource: top })
      } catch (err) {
        console.error("Dashboard load error:", err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  return (
    <div className="p-6 md:p-8 bg-white min-h-screen space-y-8">

      {/* Welcome Banner — shows greeting + free tier usage bar */}
      <WelcomeBanner />

      <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard title="Conversion-Ready Leads" value={metrics.hotCount} />
        <MetricCard title="Top Source"              value={metrics.topSource} />
        <MetricCard title="Response Speed"          value="1.2 min" />
        <MetricCard
          title="Usage"
          value={`${leads.length} / ${PLAN_LIMIT}`}
          progress={(leads.length / PLAN_LIMIT) * 100}
        />
      </div>

      {/* Lead Pulse */}
      <div>
        <h2 className="text-xl font-bold mb-4 text-slate-800">Live Lead Pulse</h2>

        {loading && (
          <div className="text-center py-16 text-slate-400 text-sm">
            Loading leads...
          </div>
        )}

        {!loading && leads.length === 0 && (
          <div className="text-center py-16 text-slate-400 text-sm bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            No leads yet. Score your first lead to see it here.
          </div>
        )}

        <div className="space-y-4">
          {leads.map((lead: any) => (
            <div key={lead.id}
              className="bg-[#0f172a] p-8 rounded-2xl text-white relative shadow-xl">

              {/* Status badge */}
              <div className={`absolute top-8 right-8 border px-3 py-1 rounded text-[10px] font-black ${
                lead.bucket === "HOT"  ? "border-red-400   text-red-400"   :
                lead.bucket === "WARM" ? "border-amber-400 text-amber-400" :
                                         "border-slate-400 text-slate-400"
              }`}>
                {lead.bucket || "COLD"}
              </div>

              <div className="mb-4">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Name</p>
                <h3 className="text-lg font-bold text-[#38bdf8]">{lead.name || "Unknown Lead"}</h3>
                <p className="text-xs text-slate-500">{lead.email} • {lead.phone}</p>
              </div>

              <div className="mb-6">
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Message</p>
                <p className="text-sm text-slate-300 italic">"{lead.message}"</p>
              </div>

              <div className="bg-blue-400/5 border-l-4 border-blue-400 p-4 rounded-r-lg">
                <p className="text-[10px] text-blue-400 font-black mb-1 tracking-widest">AI RECOMMENDATION</p>
                <p className="text-sm italic text-slate-200 leading-relaxed">
                  {lead.recommendation || "Processing lead intent..."}
                </p>
              </div>

              <div className="text-right mt-4 opacity-30 text-[10px]">
               {new Date(lead.created_at).toLocaleString("en-IN", {
               timeZone: "Asia/Kolkata",
               day: "numeric", month: "short", year: "numeric",
               hour: "numeric", minute: "2-digit", hour12: true,
               })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── MetricCard ─────────────────────────────────────────────────────────────
function MetricCard({
  title, value, progress,
}: {
  title: string
  value: string | number
  progress?: number
}) {
  return (
    <div className="bg-[#0f172a] p-6 rounded-2xl text-white shadow-lg">
      <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">{title}</p>
      <p className="text-2xl font-bold">{value}</p>
      {progress !== undefined && (
        <div className="w-full h-1 bg-slate-800 rounded-full mt-4 overflow-hidden">
          <div
            className="bg-[#38bdf8] h-full transition-all duration-700"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}