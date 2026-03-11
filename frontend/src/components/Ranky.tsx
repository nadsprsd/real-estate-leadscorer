/**
 * Ranky.tsx — LeadRankerAI floating AI assistant
 *
 * Auth pattern matches WelcomeBanner.tsx exactly:
 *   - import { useAuthStore } from "../store/auth"
 *   - token = useAuthStore((s) => s.token)
 *   - name fetched from GET /api/v1/auth/me  → d.brokerage_name || d.email
 *
 * Place file at: src/components/Ranky.tsx
 * Add to App.tsx inside ProtectedRoute:  <Ranky />
 */

import { useState, useRef, useEffect, useCallback } from "react"
import { useAuthStore } from "../store/auth"

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const OPENAI_KEY     = import.meta.env.VITE_OPENAI_API_KEY ?? ""
const API            = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"
const FIRST_VISIT_KEY = "ranky_greeted"
const LANG_KEY        = "ranky_lang"

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface Message { role: "user" | "assistant"; content: string }
interface LangOption { code: string; label: string; flag: string }

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGES
// ─────────────────────────────────────────────────────────────────────────────
const LANGS: LangOption[] = [
  { code: "en", label: "English",  flag: "🇬🇧" },
  { code: "hi", label: "हिंदी",     flag: "🇮🇳" },
  { code: "ml", label: "മലയാളം",   flag: "🇮🇳" },
  { code: "ta", label: "தமிழ்",    flag: "🇮🇳" },
  { code: "ar", label: "العربية",  flag: "🇦🇪" },
  { code: "es", label: "Español",  flag: "🇪🇸" },
]

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────────────────────
const buildPrompt = (lang: string, name: string) => `
You are Ranky, the friendly AI assistant for LeadRankerAI — an AI-powered lead scoring SaaS for real estate and logistics brokerages.

LANGUAGE: Always reply in "${lang}". Keep technical terms (API key, plugin, etc.) in English.
USER: ${name || "there"}. Use their name occasionally to feel personal.

PERSONALITY: Warm, direct, concise. No filler like "Great question!". Use numbered steps for guides. Light emoji only where helpful.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT IS LEADRANKERAI?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LeadRankerAI scores every incoming lead as HOT, WARM, or COLD using AI. Connect your lead sources (website forms, Facebook Ads, Google Ads, Gmail, CRMs) and every lead gets scored instantly. HOT leads trigger instant email alerts to your agents.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LEAD SCORES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOT (80-100): Ready-to-buy. Instant email alert sent to agent.
WARM (50-79): Good prospect, follow up soon.
COLD (0-49): Early stage, low intent.
IGNORE: Spam/test — not saved to dashboard.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WORDPRESS PLUGIN SETUP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Dashboard > Connections > WordPress tab > Download Plugin (gets leadranker-ai.zip)
2. WordPress Admin > Plugins > Add New > Upload Plugin > upload the zip > Activate
3. WordPress sidebar > Settings > LeadRanker AI
4. Paste your Plugin API Key (from Dashboard > Connections)
5. Set Portal URL: https://app.leadrankerai.com/portal
6. Click "Test Connection" — should show Connected
7. Enable the toggle and Save

Works automatically with Elementor, Contact Form 7, Gravity Forms, WPForms, Divi, plain HTML — no extra mapping needed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FACEBOOK ADS — STEP BY STEP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Facebook emails you when someone fills your Lead Form. You forward that email to LeadRankerAI.

STEP 1 — Get your Magic Email
1. Go to Dashboard > Connections
2. Copy the Magic Email Address (e.g. leads+abc123@leadrankerai.com)

STEP 2 — Turn on Facebook lead notifications
1. Open Facebook Ads Manager: business.facebook.com
2. Open your Lead Ad campaign
3. Click your Lead Form > Form Settings (or Notifications)
4. Turn ON "Email Notifications"
5. Note: Facebook sends to your Business account email

STEP 3 — Set up Gmail auto-forwarding
1. Open Gmail that receives Facebook lead emails
2. Click the gear icon (top right) > "See all settings"
3. Click the "Filters and Blocked Addresses" tab
4. Click "Create a new filter"
5. In the "From" field type: noreply@facebookmail.com
6. Click "Create filter" (blue button)
7. Tick the box "Forward it to:"
8. Paste your Magic Email Address in that field
9. Click "Create filter" — done!

STEP 4 — Test it
1. Go to your Facebook Lead Ad > click Preview or submit a test
2. Wait 30-60 seconds
3. Open your LeadRankerAI dashboard — the lead should appear with a score
4. If score is 80 or above, check your inbox for a HOT alert email

TROUBLESHOOTING FACEBOOK ADS:
- Not seeing leads? First check your Gmail spam — Facebook emails sometimes land there
- Wrong inbox? The filter must be on the Gmail that actually receives Facebook emails
- No score? Add more fields to your Lead Form (message, budget, timeline) for better scoring

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GOOGLE ADS — STEP BY STEP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — Get Magic Email from Dashboard > Connections

STEP 2 — Enable Google Ads notifications
1. Open Google Ads: ads.google.com
2. Go to your campaign > click the Lead Form asset
3. Under "Lead delivery option" > enable "Email notifications"
4. Notifications go to your Google Ads account email

STEP 3 — Forward to LeadRankerAI (same as Facebook)
1. Open Gmail receiving Google Ads notifications
2. Settings > Filters > Create a new filter
3. From field: the Google Ads notification sender address
4. Create filter > tick "Forward it to" > paste Magic Email
5. Save

STEP 4 — Test by submitting a test lead on your Lead Form

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GMAIL / ANY EMAIL SOURCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Works for: Zillow, 99acres, MagicBricks, IndiaMART, JustDial, or any platform that emails you lead notifications.
1. Dashboard > Connections > copy Magic Email
2. Gmail > Settings > Filters > Create a new filter
3. Filter by the From address or Subject of those lead emails
4. Tick "Forward it to" > paste Magic Email > Save

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ONBOARDING CHECKLIST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Register at app.leadrankerai.com and verify your email
2. Go to Dashboard > Connections
3. Pick your source: WordPress plugin OR Magic Email forwarding
4. Complete the setup for your source (see guides above)
5. Submit one test lead
6. Confirm it appears in your dashboard with a score
7. If HOT (80+), check your inbox for the alert email — pipeline is live!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PLANS & BILLING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Free Trial: 50 leads/month
Starter: 1,000 leads/month
Team: 5,000 leads/month
Upgrade anytime: Dashboard > Billing

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMMON ISSUES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"Leads not appearing" > WordPress: check API key + click Test Connection. Email: verify forwarding filter is saved correctly.
"Portal shows Link Expired" > JWT token expired (24hr). Lead must resubmit the form.
"Plugin not intercepting forms" > Enable Debug Mode in WP plugin settings > open browser console > look for [LeadRanker] logs.
"Not getting HOT alert emails" > Check spam folder. Verify your email is correct in Settings.

Anything else? Email: support@leadrankerai.com
`.trim()

// ─────────────────────────────────────────────────────────────────────────────
// QUICK PROMPTS
// ─────────────────────────────────────────────────────────────────────────────
const QUICK_PROMPTS = [
  "How do I connect Facebook Ads?",
  "Install the WordPress plugin",
  "What does HOT mean?",
  "Walk me through onboarding",
]

// ─────────────────────────────────────────────────────────────────────────────
// SMALL COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function Avatar({ size = 32, pulse = false }: { size?: number; pulse?: boolean }) {
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      {pulse && <div className="rk-pulse-ring" style={{ position: "absolute", inset: -4, borderRadius: "50%" }} />}
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
        <defs>
          <radialGradient id="rkg" cx="35%" cy="30%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0284c7" />
          </radialGradient>
        </defs>
        <circle cx="20" cy="20" r="20" fill="url(#rkg)" />
        <path d="M23 7L12 22h9l-4 11L29 18h-9l3-11z" fill="white" opacity="0.93" />
      </svg>
    </div>
  )
}

function Dots() {
  return (
    <div style={{ display: "flex", gap: 5, padding: "10px 14px" }}>
      {[0,1,2].map(i => <div key={i} className="rk-dot" style={{ animationDelay: `${i*0.18}s` }} />)}
    </div>
  )
}

function Md({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.72 }}>
      {text.split("\n").map((line, i) => {
        if (line.startsWith("━"))
          return <hr key={i} style={{ border: "none", borderTop: "1px solid rgba(56,189,248,.15)", margin: "7px 0" }} />
        if (/^\d+\.\s/.test(line)) {
          const num  = line.match(/^(\d+)\./)?.[1]
          const rest = line.replace(/^\d+\.\s/, "")
          const pts  = rest.split(/\*\*(.*?)\*\*/g)
          return (
            <div key={i} style={{ display: "flex", gap: 7, margin: "4px 0", alignItems: "flex-start" }}>
              <span style={{ minWidth: 17, height: 17, borderRadius: "50%", background: "rgba(56,189,248,.2)", color: "#38bdf8", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 3 }}>{num}</span>
              <span>{pts.map((p, j) => j%2===1 ? <strong key={j} style={{ color: "#7dd3fc" }}>{p}</strong> : p)}</span>
            </div>
          )
        }
        if (line.startsWith("- "))
          return <p key={i} style={{ margin: "2px 0 2px 4px", paddingLeft: 9, borderLeft: "2px solid rgba(56,189,248,.3)" }}>{line.slice(2)}</p>
        if (!line.trim()) return <br key={i} />
        const pts = line.split(/\*\*(.*?)\*\*/g)
        return <p key={i} style={{ margin: "2px 0" }}>{pts.map((p, j) => j%2===1 ? <strong key={j} style={{ color: "#7dd3fc" }}>{p}</strong> : p)}</p>
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
export default function Ranky() {
  const token = useAuthStore((s) => s.token)

  // State
  const [open, setOpen]           = useState(false)
  const [msgs, setMsgs]           = useState<Message[]>([])
  const [input, setInput]         = useState("")
  const [loading, setLoading]     = useState(false)
  const [unread, setUnread]       = useState(0)
  const [showQuick, setShowQuick] = useState(false)
  const [showLang, setShowLang]   = useState(false)
  const [userName, setUserName]   = useState("")
  const [lang, setLang]           = useState<LangOption>(
    () => LANGS.find(l => l.code === localStorage.getItem(LANG_KEY)) ?? LANGS[0]
  )

  const isFirstVisit = !localStorage.getItem(FIRST_VISIT_KEY)
  const bottomRef    = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLTextAreaElement>(null)

  // Detect mobile
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640)
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener("resize", fn)
    return () => window.removeEventListener("resize", fn)
  }, [])

  // Fetch user name from /api/v1/auth/me  (same pattern as WelcomeBanner)
  useEffect(() => {
    if (!token) return
    fetch(`${API}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        const full = d.brokerage_name || d.email?.split("@")[0] || ""
        setUserName(full.split(" ")[0])
      })
      .catch(() => {})
  }, [token])

  // Auto-open on first visit
  useEffect(() => {
    if (isFirstVisit) {
      const t = setTimeout(() => setOpen(true), 1400)
      return () => clearTimeout(t)
    }
  }, [])

  // On panel open — inject greeting
  useEffect(() => {
    if (!open) return
    setUnread(0)
    if (msgs.length === 0) {
      if (isFirstVisit) {
        const name = userName ? `**${userName}**` : "there"
        setMsgs([{
          role: "assistant",
          content: `👋 Hey ${name}! I'm **Ranky** ⚡ — your LeadRankerAI assistant.\n\nI'll help you set up your leads pipeline, explain scores, and guide you through anything in the dashboard.\n\nWhich language are you most comfortable with?`,
        }])
        setShowLang(true)
      } else {
        const name = userName ? `, **${userName}**` : ""
        setMsgs([{
          role: "assistant",
          content: `👋 Welcome back${name}! What can I help you with today?`,
        }])
        setShowQuick(true)
      }
    }
    setTimeout(() => inputRef.current?.focus(), 200)
  }, [open])

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [msgs, loading])

  // Pick language
  const pickLang = useCallback((l: LangOption) => {
    setLang(l)
    setShowLang(false)
    localStorage.setItem(LANG_KEY, l.code)
    localStorage.setItem(FIRST_VISIT_KEY, "true")

    const confirmations: Record<string, string> = {
      en: `Perfect! I'll chat with you in **English** 🇬🇧\n\nHere's what I can help you with:`,
      hi: `बढ़िया! मैं **हिंदी** में बात करूंगा 🇮🇳\n\nनीचे से एक विकल्प चुनें:`,
      ml: `തയ്യാർ! **മലയാളത്തിൽ** സംസാരിക്കാം 🇮🇳\n\nഒരു ഓപ്ഷൻ തിരഞ്ഞെടുക്കൂ:`,
      ta: `சரி! **தமிழில்** பேசுவேன் 🇮🇳\n\nഒரு விருப்பத்தை தேர்ந்தெடுக்கவும்:`,
      ar: `ممتاز! سأتحدث **بالعربية** 🇦🇪\n\nاختر من الأسفل:`,
      es: `¡Perfecto! Te hablaré en **Español** 🇪🇸\n\nElige una opción:`,
    }
    setMsgs(prev => [...prev, { role: "assistant", content: confirmations[l.code] ?? confirmations.en }])
    setShowQuick(true)
  }, [])

  // Send message
  const send = useCallback(async (text?: string) => {
    const txt = (text ?? input).trim()
    if (!txt || loading) return
    const next: Message[] = [...msgs, { role: "user", content: txt }]
    setMsgs(next)
    setInput("")
    setLoading(true)
    setShowQuick(false)
    try {
      const res  = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: 1000,
          messages: [
            { role: "system", content: buildPrompt(lang.label, userName) },
            ...next.map(m => ({ role: m.role, content: m.content })),
          ],
        }),
      })
      const data = await res.json()
      const reply = data.choices?.[0]?.message?.content ?? "Sorry, I couldn't respond. Try again."
      setMsgs(prev => [...prev, { role: "assistant", content: reply }])
      if (!open) setUnread(u => u + 1)
    } catch {
      setMsgs(prev => [...prev, { role: "assistant", content: "Network error — check your connection and try again." }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, msgs, lang, userName, open])

  const canSend = !!input.trim() && !loading

  // ── Panel dimensions: full screen on mobile, floating on desktop ──────────
  const panelStyle: React.CSSProperties = isMobile ? {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    borderRadius: 0,
    display: "flex",
    flexDirection: "column",
    background: "#0b1628",
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    animation: "rk-in .25s ease",
  } : {
    position: "fixed",
    bottom: 88,
    right: 24,
    zIndex: 9999,
    width: 364,
    maxHeight: "calc(100vh - 116px)",
    borderRadius: 22,
    border: "1px solid rgba(56,189,248,.18)",
    boxShadow: "0 32px 80px rgba(0,0,0,.65), inset 0 1px 0 rgba(255,255,255,.04)",
    display: "flex",
    flexDirection: "column",
    background: "#0b1628",
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    animation: "rk-in .3s cubic-bezier(.16,1,.3,1)",
    overflow: "hidden",
  }

  return (
    <>
      {/* ── Global styles ── */}
      <style>{`
        @keyframes rk-pulse { 0%,100%{transform:scale(1);opacity:.4} 50%{transform:scale(1.4);opacity:.9} }
        @keyframes rk-dot   { 0%,80%,100%{transform:translateY(0);opacity:.3} 40%{transform:translateY(-7px);opacity:1} }
        @keyframes rk-in    { from{opacity:0;transform:translateY(16px) scale(.95)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes rk-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes rk-badge { 0%{transform:scale(0)} 70%{transform:scale(1.25)} 100%{transform:scale(1)} }
        .rk-pulse-ring { background:radial-gradient(circle,rgba(56,189,248,.28) 0%,transparent 70%); animation:rk-pulse 2.4s ease-in-out infinite; }
        .rk-dot        { width:6px; height:6px; border-radius:50%; background:#38bdf8; animation:rk-dot 1.2s ease-in-out infinite; }
        .rk-fab        { transition:all .25s cubic-bezier(.16,1,.3,1) !important; }
        .rk-fab:hover  { transform:scale(1.09) !important; }
        .rk-fab:active { transform:scale(.94) !important; }
        .rk-scroll::-webkit-scrollbar       { width:3px; }
        .rk-scroll::-webkit-scrollbar-thumb { background:rgba(56,189,248,.18); border-radius:4px; }
        .rk-scroll::-webkit-scrollbar-track { background:transparent; }
        .rk-ta { scrollbar-width:none; }
        .rk-ta::-webkit-scrollbar { display:none; }
        .rk-qbtn:hover { background:rgba(56,189,248,.14) !important; border-color:rgba(56,189,248,.45) !important; }
        .rk-lbtn:hover { background:rgba(56,189,248,.16) !important; border-color:rgba(56,189,248,.45) !important; }
        .rk-send:hover { transform:scale(1.06); }
      `}</style>

      {/* ── Chat panel ── */}
      {open && (
        <div style={panelStyle}>

          {/* Header */}
          <div style={{
            padding: isMobile ? "16px 16px 14px" : "14px 16px",
            background: "linear-gradient(160deg,rgba(56,189,248,.08) 0%,transparent 100%)",
            borderBottom: "1px solid rgba(56,189,248,.1)",
            display: "flex", alignItems: "center", gap: 12,
            flexShrink: 0,
            // safe area for notched phones
            paddingTop: isMobile ? "max(16px, env(safe-area-inset-top))" : "14px",
          }}>
            <Avatar size={38} pulse />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 800, color: "#f1f5f9", fontSize: 15, letterSpacing: "-.4px" }}>Ranky</p>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e", flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  LeadRankerAI Assistant · {lang.flag} {lang.label}
                </span>
              </div>
            </div>
            {/* Language toggle */}
            <button
              title="Change language"
              onClick={() => setShowLang(v => !v)}
              style={{ background: "rgba(56,189,248,.1)", border: "1px solid rgba(56,189,248,.2)", borderRadius: 8, width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>
              {lang.flag}
            </button>
            {/* Close */}
            <button
              onClick={() => setOpen(false)}
              style={{ background: "rgba(255,255,255,.06)", border: "none", cursor: "pointer", width: 32, height: 32, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: 16, flexShrink: 0 }}>
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="rk-scroll" style={{ flex: 1, overflowY: "auto", padding: "14px 14px 4px", display: "flex", flexDirection: "column", gap: 10 }}>

            {msgs.map((m, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", flexDirection: m.role === "user" ? "row-reverse" : "row", animation: "rk-in .2s ease" }}>
                {m.role === "assistant" && <Avatar size={26} />}
                <div style={{
                  maxWidth: isMobile ? "88%" : "86%",
                  padding: "9px 13px",
                  borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "4px 16px 16px 16px",
                  background: m.role === "user" ? "linear-gradient(135deg,#2563eb,#1e40af)" : "rgba(255,255,255,.055)",
                  border: m.role === "assistant" ? "1px solid rgba(255,255,255,.07)" : "none",
                  color: "#e2e8f0",
                  boxShadow: m.role === "user" ? "0 4px 14px rgba(37,99,235,.25)" : "none",
                  wordBreak: "break-word",
                }}>
                  <Md text={m.content} />
                </div>
              </div>
            ))}

            {/* Language picker inline */}
            {showLang && (
              <div style={{ marginLeft: 34, animation: "rk-in .25s ease" }}>
                <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(56,189,248,.18)", borderRadius: "4px 16px 16px 16px", padding: "12px 14px" }}>
                  <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "#94a3b8" }}>Choose your language:</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                    {LANGS.map(l => (
                      <button key={l.code} className="rk-lbtn" onClick={() => pickLang(l)} style={{
                        background: "rgba(56,189,248,.07)", border: "1px solid rgba(56,189,248,.2)", borderRadius: 10,
                        padding: "9px 10px", color: "#e2e8f0", fontSize: 13, fontWeight: 600,
                        cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8, transition: "all .15s",
                      }}>
                        <span style={{ fontSize: 18 }}>{l.flag}</span>
                        <span>{l.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <Avatar size={26} />
                <div style={{ background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.07)", borderRadius: "4px 16px 16px 16px" }}>
                  <Dots />
                </div>
              </div>
            )}

            {/* Quick prompts */}
            {showQuick && !showLang && (
              <div style={{ marginLeft: 34, display: "flex", flexDirection: "column", gap: 6, animation: "rk-in .3s ease" }}>
                <p style={{ margin: 0, fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".09em" }}>Quick start</p>
                {QUICK_PROMPTS.map((p, i) => (
                  <button key={i} className="rk-qbtn" onClick={() => send(p)} style={{
                    background: "rgba(56,189,248,.06)", border: "1px solid rgba(56,189,248,.18)", borderRadius: 10,
                    padding: "8px 12px", color: "#7dd3fc", fontSize: 12.5, fontWeight: 600,
                    cursor: "pointer", textAlign: "left", transition: "all .15s",
                  }}>
                    ↗ {p}
                  </button>
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div style={{
            padding: "8px 10px",
            paddingBottom: isMobile ? "max(10px, env(safe-area-inset-bottom))" : "10px",
            borderTop: "1px solid rgba(56,189,248,.08)",
            background: "rgba(0,0,0,.2)",
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", background: "rgba(255,255,255,.05)", border: "1.5px solid rgba(56,189,248,.2)", borderRadius: 14, padding: "8px 8px 8px 13px" }}>
              <textarea
                ref={inputRef}
                className="rk-ta"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder="Ask Ranky anything..."
                rows={1}
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#f1f5f9", fontSize: isMobile ? 16 : 13.5, resize: "none", fontFamily: "inherit", lineHeight: 1.55, maxHeight: 96, overflowY: "auto", caretColor: "#38bdf8" }}
              />
              <button className="rk-send" onClick={() => send()} disabled={!canSend} style={{
                width: 36, height: 36, borderRadius: 10, border: "none",
                background: canSend ? "linear-gradient(135deg,#38bdf8,#0ea5e9)" : "rgba(56,189,248,.12)",
                cursor: canSend ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, transition: "all .18s",
                boxShadow: canSend ? "0 4px 12px rgba(14,165,233,.35)" : "none",
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke={canSend ? "#0f172a" : "#38bdf8"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <p style={{ margin: "5px 0 0", textAlign: "center", fontSize: 10, color: "#334155" }}>
              ⚡ Powered by LeadRankerAI · Enter to send
            </p>
          </div>
        </div>
      )}

      {/* ── FAB bubble ── */}
      {(!open || !isMobile) && (
        <button
          className="rk-fab"
          onClick={() => { setOpen(o => !o); if (!localStorage.getItem(FIRST_VISIT_KEY)) localStorage.setItem(FIRST_VISIT_KEY, "true") }}
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 10000,
            width: 56, height: 56, borderRadius: "50%", border: "none",
            background: open ? "linear-gradient(135deg,#1e293b,#0f172a)" : "linear-gradient(135deg,#38bdf8,#0284c7)",
            boxShadow: open ? "0 0 0 3px rgba(56,189,248,.3),0 8px 24px rgba(0,0,0,.4)" : "0 6px 24px rgba(14,165,233,.5)",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            animation: open ? "none" : "rk-float 3.5s ease-in-out infinite",
          }}>
          {open
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" /></svg>
            : <svg width="22" height="22" viewBox="0 0 40 40" fill="none"><path d="M23 7L12 22h9l-4 11L29 18h-9l3-11z" fill="white" opacity="0.95" /></svg>
          }
          {unread > 0 && !open && (
            <div style={{ position: "absolute", top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, background: "#ef4444", border: "2px solid #0f172a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "white", padding: "0 3px", animation: "rk-badge .35s cubic-bezier(.16,1,.3,1)" }}>
              {unread}
            </div>
          )}
        </button>
      )}
    </>
  )
}