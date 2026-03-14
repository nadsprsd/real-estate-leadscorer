import { useState, useRef, useEffect } from "react"

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION — paste your OpenAI key here (or load from env)
// In production use: import.meta.env.VITE_OPENAI_API_KEY
// ─────────────────────────────────────────────────────────────────────────────
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY ?? ""

interface Message {
  role: "user" | "assistant"
  content: string
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT — full detailed knowledge base
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Ranky, the friendly AI assistant for LeadRankerAI — an AI-powered lead scoring SaaS for real estate and logistics brokerages.

PERSONALITY:
- Warm, confident, and concise. Like a smart colleague, not a chatbot.
- Get straight to the point. No filler like "Great question!" or "Certainly!".
- Use numbered steps for setup guides — be very clear and thorough.
- Use emojis lightly and only where they add clarity.
- If the user asks "how do I..." give them full step-by-step instructions, not a vague summary.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT IS LEADRANKERAI?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LeadRankerAI automatically scores every incoming lead as HOT, WARM, or COLD using AI. Brokerages connect their lead sources (website forms, Facebook Ads, Google Ads, Gmail, CRMs), and every lead gets scored instantly. High-scoring leads trigger email alerts so agents can follow up fast.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LEAD SCORES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔥 HOT (80–100): Ready-to-buy. Instant email alert sent to agent. Lead sees HOT badge on portal.
⭐ WARM (50–79): Good prospect, follow up soon. Lead sees WARM badge.
❄️ COLD (0–49): Early stage or unclear intent. Lead sees COLD badge.
🚫 IGNORE: Spam or test. Not saved to dashboard.

The AI looks at the lead's message, urgency language, budget signals, timeline, and intent to determine the score.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TWO WAYS TO CONNECT LEADS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. WORDPRESS GHOST PLUGIN — for leads from your website forms
2. MAGIC EMAIL ADDRESS — for leads from Facebook Ads, Google Ads, Gmail, or any email notification

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WORDPRESS GHOST PLUGIN SETUP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step 1: Go to Dashboard → Connections → WordPress tab
Step 2: Click "Download Plugin" to get the leadranker-ai.zip file
Step 3: In your WordPress admin, go to Plugins → Add New → Upload Plugin
Step 4: Upload the zip file and click "Activate Plugin"
Step 5: Go to Settings → LeadRanker AI in your WordPress sidebar
Step 6: Paste your Plugin API Key (found in Dashboard → Connections)
Step 7: Set the Portal URL to: https://app.leadrankerai.com/portal
Step 8: Click "Test Connection" — it should say "Connected ✓"
Step 9: Enable the plugin toggle and save

That's it! The plugin automatically intercepts every form on your site — Elementor, Contact Form 7, Gravity Forms, WPForms, Divi, raw HTML — no extra configuration needed.

When a visitor submits a form, they'll be redirected to the Magic Portal showing their lead score.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FACEBOOK ADS — FULL SETUP GUIDE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Facebook Ads sends you an email notification whenever someone fills out your Lead Form. You forward that email to LeadRankerAI and the AI scores it automatically.

STEP 1 — Get your Magic Email Address
- Log into your LeadRankerAI dashboard
- Go to Connections page
- Copy the Magic Email Address (it looks like: leads+abc123@leadrankerai.com)

STEP 2 — Set up email notifications in Facebook Ads Manager
- Open Facebook Ads Manager (business.facebook.com)
- Go to your Lead Ad campaign
- Click on your Lead Form
- Open Form Settings or Notifications
- Make sure "Email Notifications" is turned ON
- Note: Facebook sends lead notifications to the email connected to your Facebook Business account

STEP 3 — Forward Facebook lead emails to LeadRankerAI
Option A — Use Gmail auto-forwarding (recommended):
1. Open Gmail (the inbox that receives Facebook lead notifications)
2. Click the Settings gear → "See all settings"
3. Go to the "Filters and Blocked Addresses" tab
4. Click "Create a new filter"
5. In the "From" field type: noreply@facebookmail.com
6. Or use "Subject contains": "New lead" (to catch lead notification emails)
7. Click "Create filter"
8. Check "Forward it to" and enter your Magic Email Address
9. Click "Create filter" to save

Option B — Use Gmail forwarding rules:
1. Go to Gmail Settings → "Forwarding and POP/IMAP"
2. Click "Add a forwarding address"
3. Enter your Magic Email Address and verify it
4. Then create a filter (as above) to auto-forward Facebook lead emails

STEP 4 — Test it
1. Run a test lead through your Facebook Lead Ad (use Facebook's "Preview" or submit a test form)
2. Wait 30–60 seconds
3. Check your LeadRankerAI dashboard — the lead should appear with a score
4. If score is 80+, you'll also get a HOT alert email

TROUBLESHOOTING FACEBOOK ADS:
- Not seeing leads? Check that Facebook is actually sending you notification emails first — check your spam folder.
- Wrong email? Make sure the Gmail inbox receiving Facebook emails is the one you set up forwarding on.
- Lead shows but no score? The email content might be too short. Facebook lead forms with more fields (message, budget, timeline) score better.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GOOGLE ADS — FULL SETUP GUIDE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Google Ads Lead Form Extensions send email notifications when someone submits. Same forwarding approach as Facebook.

STEP 1 — Get your Magic Email Address from Dashboard → Connections

STEP 2 — Enable lead notifications in Google Ads
- Open Google Ads (ads.google.com)
- Go to your campaign → click on "Lead Form" asset
- Under "Lead delivery option" → enable "Email notifications"
- It will send notifications to your Google Ads account email

STEP 3 — Forward to LeadRankerAI
1. Open Gmail that receives Google Ads lead notifications
2. Go to Settings → Filters and Blocked Addresses → Create a new filter
3. In "From" field type: googlenoreply or the Google Ads notification email
4. Or use Subject: "New lead from your Google Ads"
5. Click "Create filter" → check "Forward it to" → paste your Magic Email Address
6. Save the filter

STEP 4 — Test by submitting a test lead on your Google Ads lead form

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GMAIL / ANY EMAIL SOURCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If leads come into your Gmail inbox from any source (website contact forms, Zillow, 99acres, MagicBricks, IndiaMART, JustDial, etc.):

1. Go to Dashboard → Connections → copy your Magic Email Address
2. In Gmail → Settings → Filters → Create a new filter
3. Filter by "From" address or "Subject" of your lead emails
4. Forward matching emails to your Magic Email Address
5. Leads appear in your dashboard within seconds

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ONBOARDING — NEW USER CHECKLIST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step 1: Register at app.leadrankerai.com and verify your email
Step 2: Go to Dashboard → Connections
Step 3: Choose your lead source:
  - WordPress website? → Use the Ghost Plugin
  - Facebook/Google Ads, Gmail? → Use the Magic Email Address
Step 4: Follow the setup steps for your source
Step 5: Submit one test lead
Step 6: Confirm it appears in your dashboard with a score
Step 7: If HOT (80+), check your inbox for the alert email

Done! Your pipeline is live.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PLANS & BILLING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Free Trial: 50 leads/month — great for testing
Starter: 1,000 leads/month
Team: 5,000 leads/month
Upgrade anytime from Dashboard → Billing

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMMON ISSUES & FIXES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"Leads not appearing in dashboard"
→ WordPress: Check API key in plugin settings. Click Test Connection.
→ Email: Check that forwarding is set up and the email actually arrived in your Magic Email inbox.

"Portal shows Link Expired"
→ The magic link JWT expires after 24 hours. Lead needs to resubmit the form.

"Plugin not intercepting forms"
→ Enable Debug Mode in LeadRanker WP settings → open browser console → look for [LeadRanker] logs.

"Test Connection failed"
→ Double-check the API key is copied exactly from Connections page. No extra spaces.

"Not getting HOT alert emails"
→ Check spam folder. Make sure your account email is correct in Settings.

If the user asks about something not covered here, say: "I don't have that info yet — email support@leadrankerai.com and we'll help you out."`

// ── Quick start prompts ───────────────────────────────────────────────────────
const QUICK_PROMPTS = [
  "How do I connect Facebook Ads?",
  "How do I set up the WordPress plugin?",
  "What does a HOT lead mean?",
  "Walk me through onboarding",
]

// ── Avatar ────────────────────────────────────────────────────────────────────
function RankyAvatar({ size = 32, pulse = false }: { size?: number; pulse?: boolean }) {
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      {pulse && (
        <div style={{
          position: "absolute", inset: -5, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(56,189,248,0.3) 0%, transparent 70%)",
          animation: "rk-pulse 2.4s ease-in-out infinite",
        }} />
      )}
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
        <defs>
          <radialGradient id="rkgrd" cx="35%" cy="30%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0284c7" />
          </radialGradient>
        </defs>
        <circle cx="20" cy="20" r="20" fill="url(#rkgrd)" />
        <path d="M23 7L12 22h9l-4 11L29 18h-9l3-11z" fill="white" opacity="0.93" />
      </svg>
    </div>
  )
}

// ── Typing dots ───────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "10px 16px" }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 6, height: 6, borderRadius: "50%", background: "#38bdf8",
          animation: `rk-dot 1.2s ease-in-out ${i * 0.18}s infinite`,
        }} />
      ))}
    </div>
  )
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
function Md({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.72, color: "inherit" }}>
      {text.split("\n").map((line, i) => {
        if (line.startsWith("━")) return <hr key={i} style={{ border: "none", borderTop: "1px solid rgba(56,189,248,.15)", margin: "8px 0" }} />
        if (/^\d+\.\s/.test(line)) {
          const num = line.match(/^(\d+)\./)?.[1]
          const rest = line.replace(/^\d+\.\s/, "")
          const parts = rest.split(/\*\*(.*?)\*\*/g)
          return (
            <div key={i} style={{ display: "flex", gap: 8, margin: "4px 0", alignItems: "flex-start" }}>
              <span style={{ minWidth: 18, height: 18, borderRadius: "50%", background: "rgba(56,189,248,.2)", color: "#38bdf8", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>{num}</span>
              <span>{parts.map((p, j) => j % 2 === 1 ? <strong key={j} style={{ color: "#7dd3fc" }}>{p}</strong> : p)}</span>
            </div>
          )
        }
        if (line.startsWith("- ")) return <p key={i} style={{ margin: "3px 0 3px 4px", paddingLeft: 10, borderLeft: "2px solid rgba(56,189,248,.3)" }}>{line.slice(2)}</p>
        if (line.trim() === "") return <br key={i} />
        const parts = line.split(/\*\*(.*?)\*\*/g)
        return <p key={i} style={{ margin: "2px 0" }}>{parts.map((p, j) => j % 2 === 1 ? <strong key={j} style={{ color: "#7dd3fc" }}>{p}</strong> : p)}</p>
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Ranky() {
  const [open, setOpen]           = useState(false)
  const [messages, setMessages]   = useState<Message[]>([])
  const [input, setInput]         = useState("")
  const [loading, setLoading]     = useState(false)
  const [showQuick, setShowQuick] = useState(true)
  const [unread, setUnread]       = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: "assistant",
        content: "Hey! I'm **Ranky** ⚡ — your LeadRankerAI assistant.\n\nI can walk you through connecting Facebook Ads, Google Ads, WordPress, or any email source — step by step. What do you need help with?",
      }])
    }
    if (open) { setUnread(0); setTimeout(() => inputRef.current?.focus(), 150) }
  }, [open])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages, loading])

  async function send(text?: string) {
    const userText = (text ?? input).trim()
    if (!userText || loading) return

    const next: Message[] = [...messages, { role: "user", content: userText }]
    setMessages(next)
    setInput("")
    setLoading(true)
    setShowQuick(false)

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: 1000,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...next.map(m => ({ role: m.role, content: m.content })),
          ],
        }),
      })
      const data = await res.json()
      const reply = data.choices?.[0]?.message?.content ?? "Sorry, I couldn't get a response. Try again."
      setMessages(prev => [...prev, { role: "assistant", content: reply }])
      if (!open) setUnread(u => u + 1)
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Network error — check your connection and try again." }])
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() }
  }

  const canSend = !!input.trim() && !loading

  return (
    <>
      <style>{`
        @keyframes rk-pulse { 0%,100%{transform:scale(1);opacity:.5} 50%{transform:scale(1.35);opacity:1} }
        @keyframes rk-dot   { 0%,80%,100%{transform:translateY(0);opacity:.3} 40%{transform:translateY(-7px);opacity:1} }
        @keyframes rk-in    { from{opacity:0;transform:translateY(20px) scale(.93)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes rk-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes rk-badge { 0%{transform:scale(0)} 70%{transform:scale(1.25)} 100%{transform:scale(1)} }
        .rk-close:hover  { background:rgba(255,255,255,.12) !important; color:#f1f5f9 !important; }
        .rk-quick:hover  { background:rgba(56,189,248,.14) !important; border-color:rgba(56,189,248,.45) !important; color:#bae6fd !important; }
        .rk-fab:hover    { transform:scale(1.08) !important; }
        .rk-fab:active   { transform:scale(.95) !important; }
        .rk-send:hover   { transform:scale(1.06); }
        .rk-scroll::-webkit-scrollbar { width:4px; }
        .rk-scroll::-webkit-scrollbar-thumb { background:rgba(56,189,248,.2); border-radius:4px; }
        .rk-scroll::-webkit-scrollbar-track { background:transparent; }
        .rk-ta { scrollbar-width:none; }
        .rk-ta::-webkit-scrollbar { display:none; }
      `}</style>

      {/* Chat panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 88, right: 24, zIndex: 9999,
          width: 364, maxHeight: "calc(100vh - 116px)",
          background: "#0b1628",
          border: "1px solid rgba(56,189,248,.18)",
          borderRadius: 22,
          boxShadow: "0 32px 80px rgba(0,0,0,.65), inset 0 1px 0 rgba(255,255,255,.04)",
          display: "flex", flexDirection: "column",
          animation: "rk-in .3s cubic-bezier(.16,1,.3,1)",
          overflow: "hidden",
          fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
        }}>

          {/* Header */}
          <div style={{
            padding: "14px 16px",
            background: "linear-gradient(160deg, rgba(56,189,248,.07) 0%, transparent 100%)",
            borderBottom: "1px solid rgba(56,189,248,.1)",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <RankyAvatar size={38} pulse />
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 800, color: "#f1f5f9", fontSize: 14.5, letterSpacing: "-.4px" }}>Ranky</p>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
                <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>LeadRankerAI Assistant · Always on</span>
              </div>
            </div>
            <button className="rk-close" onClick={() => setOpen(false)} style={{
              background: "rgba(255,255,255,.06)", border: "none", cursor: "pointer",
              width: 30, height: 30, borderRadius: 9,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#64748b", fontSize: 14, transition: "all .15s",
            }}>✕</button>
          </div>

          {/* Messages */}
          <div className="rk-scroll" style={{
            flex: 1, overflowY: "auto", padding: "14px 13px 8px",
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                display: "flex", gap: 8, alignItems: "flex-start",
                flexDirection: m.role === "user" ? "row-reverse" : "row",
                animation: "rk-in .22s ease",
              }}>
                {m.role === "assistant" && <RankyAvatar size={24} />}
                <div style={{
                  maxWidth: "86%", padding: "9px 13px",
                  borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "4px 16px 16px 16px",
                  background: m.role === "user"
                    ? "linear-gradient(135deg, #2563eb, #1e40af)"
                    : "rgba(255,255,255,.055)",
                  border: m.role === "assistant" ? "1px solid rgba(255,255,255,.07)" : "none",
                  color: "#e2e8f0",
                  boxShadow: m.role === "user" ? "0 4px 14px rgba(37,99,235,.28)" : "none",
                }}>
                  <Md text={m.content} />
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", animation: "rk-in .2s ease" }}>
                <RankyAvatar size={24} />
                <div style={{ background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.07)", borderRadius: "4px 16px 16px 16px" }}>
                  <TypingDots />
                </div>
              </div>
            )}

            {/* Quick prompts */}
            {showQuick && messages.length <= 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                <p style={{ margin: 0, fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".09em" }}>Quick start</p>
                {QUICK_PROMPTS.map((p, i) => (
                  <button key={i} className="rk-quick" onClick={() => send(p)} style={{
                    background: "rgba(56,189,248,.06)",
                    border: "1px solid rgba(56,189,248,.18)",
                    borderRadius: 10, padding: "7px 12px",
                    color: "#7dd3fc", fontSize: 12.5, fontWeight: 600,
                    cursor: "pointer", textAlign: "left", transition: "all .15s",
                  }}>
                    ↗ {p}
                  </button>
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: "8px 10px 10px", borderTop: "1px solid rgba(56,189,248,.08)", background: "rgba(0,0,0,.25)" }}>
            <div style={{
              display: "flex", gap: 8, alignItems: "flex-end",
              background: "rgba(255,255,255,.05)",
              border: "1.5px solid rgba(56,189,248,.2)",
              borderRadius: 14, padding: "8px 8px 8px 13px",
            }}>
              <textarea
                ref={inputRef}
                className="rk-ta"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask Ranky anything..."
                rows={1}
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  color: "#f1f5f9", fontSize: 13.5, resize: "none",
                  fontFamily: "inherit", lineHeight: 1.55, maxHeight: 100,
                  overflowY: "auto", caretColor: "#38bdf8",
                }}
              />
              <button className="rk-send" onClick={() => send()} disabled={!canSend} style={{
                width: 34, height: 34, borderRadius: 10, border: "none",
                background: canSend ? "linear-gradient(135deg, #38bdf8, #0ea5e9)" : "rgba(56,189,248,.12)",
                cursor: canSend ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, transition: "all .18s",
                boxShadow: canSend ? "0 4px 12px rgba(14,165,233,.35)" : "none",
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"
                    stroke={canSend ? "#0f172a" : "#38bdf8"}
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <p style={{ margin: "5px 0 0", textAlign: "center", fontSize: 10, color: "#334155", letterSpacing: ".03em" }}>
              ⚡ Powered by LeadRankerAI · Enter to send
            </p>
          </div>
        </div>
      )}

      {/* FAB */}
      <button className="rk-fab" onClick={() => setOpen(o => !o)} style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 10000,
        width: 56, height: 56, borderRadius: "50%", border: "none",
        background: open
          ? "linear-gradient(135deg, #1e293b, #0f172a)"
          : "linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)",
        boxShadow: open
          ? "0 0 0 3px rgba(56,189,248,.3), 0 8px 24px rgba(0,0,0,.4)"
          : "0 6px 24px rgba(14,165,233,.5)",
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all .25s cubic-bezier(.16,1,.3,1)",
        animation: open ? "none" : "rk-float 3.5s ease-in-out infinite",
      }}>
        {open
          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" /></svg>
          : <svg width="22" height="22" viewBox="0 0 40 40" fill="none"><path d="M23 7L12 22h9l-4 11L29 18h-9l3-11z" fill="white" opacity="0.95" /></svg>
        }
        {unread > 0 && !open && (
          <div style={{
            position: "absolute", top: -3, right: -3,
            minWidth: 18, height: 18, borderRadius: 9,
            background: "#ef4444", border: "2px solid #0f172a",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 800, color: "white", padding: "0 3px",
            animation: "rk-badge .35s cubic-bezier(.16,1,.3,1)",
          }}>
            {unread}
          </div>
        )}
      </button>
    </>
  )
}
