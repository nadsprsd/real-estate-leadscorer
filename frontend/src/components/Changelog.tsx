// src/components/Changelog.tsx
// Shows "What's New" with unread badge in dashboard

import { useState, useEffect } from "react"
import { X, Zap, Shield, Star, Rocket, ChevronDown, ChevronUp } from "lucide-react"

const API = import.meta.env.VITE_API_URL || "https://api.leadrankerai.com"
const SEEN_KEY = "changelog_seen_version"

interface ChangelogEntry {
  version: string
  date: string
  title: string
  badge: string
  items: string[]
}

const BADGE_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  new:         { label: "New",         color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",         icon: Star },
  improvement: { label: "Improved",    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",         icon: Zap },
  security:    { label: "Security",    color: "bg-green-500/20 text-green-400 border-green-500/30",      icon: Shield },
  launch:      { label: "Launch",      color: "bg-purple-500/20 text-purple-400 border-purple-500/30",   icon: Rocket },
  fix:         { label: "Fix",         color: "bg-amber-500/20 text-amber-400 border-amber-500/30",      icon: Zap },
}

export function ChangelogBadge({ onClick }: { onClick: () => void }) {
  const [hasNew, setHasNew] = useState(false)
  const [latestVersion, setLatestVersion] = useState("")

  useEffect(() => {
    fetch(`${API}/api/v1/changelog`)
      .then(r => r.json())
      .then(d => {
        const latest = d.latest_version
        const seen = localStorage.getItem(SEEN_KEY)
        setLatestVersion(latest)
        setHasNew(seen !== latest)
      })
      .catch(() => {})
  }, [])

  return (
    <button
      onClick={onClick}
      className="relative flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
    >
      <Star size={13} />
      <span>What's New</span>
      {hasNew && (
        <span className="absolute -top-1 -right-1 w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
      )}
    </button>
  )
}

export default function Changelog({ onClose }: { onClose: () => void }) {
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API}/api/v1/changelog`)
      .then(r => r.json())
      .then(d => {
        setChangelog(d.changelog || [])
        // Mark as seen
        if (d.latest_version) {
          localStorage.setItem(SEEN_KEY, d.latest_version)
        }
        // Auto-expand latest
        if (d.changelog?.length > 0) {
          setExpanded(d.changelog[0].version)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#111827] border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl max-h-[80vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Star size={18} className="text-cyan-400" />
            <h2 className="text-white font-bold">What's New</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {loading ? (
            <div className="text-center text-slate-500 py-8">Loading...</div>
          ) : (
            changelog.map((entry) => {
              const badge = BADGE_CONFIG[entry.badge] || BADGE_CONFIG.new
              const BadgeIcon = badge.icon
              const isExpanded = expanded === entry.version

              return (
                <div key={entry.version}
                  className="border border-gray-800 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpanded(isExpanded ? null : entry.version)}
                    className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${badge.color}`}>
                        <BadgeIcon size={10} />
                        {badge.label}
                      </span>
                      <div>
                        <p className="text-white text-sm font-semibold">{entry.title}</p>
                        <p className="text-slate-500 text-xs">v{entry.version} · {entry.date}</p>
                      </div>
                    </div>
                    {isExpanded
                      ? <ChevronUp size={14} className="text-slate-500" />
                      : <ChevronDown size={14} className="text-slate-500" />
                    }
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-800/50">
                      <ul className="space-y-2 mt-3">
                        {entry.items.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-slate-400">
                            <span className="text-cyan-400 mt-0.5 flex-shrink-0">→</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 text-center">
          <p className="text-xs text-slate-600">
            LeadRankerAI Alpha v1 · Updates shipped weekly
          </p>
        </div>
      </div>
    </div>
  )
}