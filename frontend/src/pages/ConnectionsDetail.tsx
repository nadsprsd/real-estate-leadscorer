import { useState, useEffect } from 'react'
import {
  Copy, Globe, Mail, CheckCircle, UserPlus,
  ChevronRight, Code, Lock, X, Facebook,
  Terminal, Zap, Download, ExternalLink,
  Plug, ArrowRight, Info
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { reportError, getFriendlyMessage } from "../lib/errorReporter"
import { showErrorToast } from "../components/ErrorToast"
import ErrorToast from "../components/ErrorToast"

const API = import.meta.env.VITE_API_URL || 'https://api.leadrankerai.com'

interface ConnectionData {
  email_forwarding: string
  webhook_url: string
}

type Platform = 'Facebook Ads' | 'WordPress' | 'Google Ads' | 'Custom CRM'
type Channel  = 'email' | 'plugin'

const GUIDES: Record<Platform, string[]> = {
  'Facebook Ads': [
    'Go to Meta Business Suite → Lead Ads → Settings.',
    'Find "Email Notifications" or "Lead Delivery".',
    'Paste your Magic Email below into the destination field.',
    'Submit a test lead — it scores automatically.',
  ],
  'WordPress': [
    'Download the LeadRanker AI plugin (zip) from below.',
    'In WordPress: Plugins → Add New → Upload Plugin.',
    'Paste your Plugin API Key (shown below) into the plugin settings.',
    'Every form on your site is now AI-scored automatically — no mapping needed.',
  ],
  'Google Ads': [
    'In your Google Ads campaign, open Lead Form Extension.',
    'Find "Email Delivery" or "Webhook" settings.',
    'Paste your Magic Email into the recipient field.',
    'Leads submitted via Google Ads will be scored in real time.',
  ],
  'Custom CRM': [
    'Copy the Webhook URL shown below.',
    'In your CRM, find "Webhooks" or "Automations".',
    'Set method to POST, paste the URL, set Content-Type: application/json.',
    'Your CRM will now push every new lead for AI scoring automatically.',
  ],
}

const PLATFORM_CHANNEL: Record<Platform, Channel> = {
  'Facebook Ads': 'email',
  'WordPress':    'plugin',
  'Google Ads':   'email',
  'Custom CRM':   'email',
}

export default function ConnectionsDetail() {
  const token = useAuthStore((s) => s.token)

  const [selected,       setSelected]       = useState<Platform>('Facebook Ads')
  const [showDocs,       setShowDocs]       = useState(false)
  const [showModal,      setShowModal]      = useState(false)
  const [isVerified,     setIsVerified]     = useState(false)
  const [connData,       setConnData]       = useState<ConnectionData>({ email_forwarding: '', webhook_url: '' })
  const [apiKey,         setApiKey]         = useState('')
  const [devEmail,       setDevEmail]       = useState('')
  const [inviteSent,     setInviteSent]     = useState(false)
  const [copiedKey,      setCopiedKey]      = useState<string | null>(null)
  const [downloading,    setDownloading]    = useState(false)

  const headers = { Authorization: `Bearer ${token || localStorage.getItem('token') || ''}` }

  useEffect(() => {
    const load = async () => {
      try {
        const [connRes, leadsRes, keyRes] = await Promise.allSettled([
          fetch(`${API}/settings/connections`,  { headers }),
          fetch(`${API}/api/v1/leads/history`,  { headers }),
          fetch(`${API}/api/v1/ingest/api-key`, { headers }),
        ])

        if (connRes.status === 'fulfilled' && connRes.value.ok) {
          const d = await connRes.value.json()
          if (d.email_forwarding) setConnData(d)
        }

        if (leadsRes.status === 'fulfilled' && leadsRes.value.ok) {
          const d = await leadsRes.value.json()
          const arr = Array.isArray(d) ? d : d?.data || []
          if (arr.length > 0) setIsVerified(true)
        }

        if (keyRes.status === 'fulfilled' && keyRes.value.ok) {
          const d = await keyRes.value.json()
          setApiKey(d.api_key || '')
        }
      } catch (err) {
        console.error('ConnectionsDetail load error:', err)
      }
    }
    load()
  }, [])

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  // ── Plugin download with error reporting ──────────────────────────────
  async function handlePluginDownload() {
    setDownloading(true)
    try {
      const res = await fetch('https://api.leadrankerai.com/static/leadranker-ai.zip')
      if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)
      const blob = await res.blob()
      const url  = window.URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = 'leadranker-ai.zip'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      
      } catch (err: any) {
        await reportError(
        'Download WordPress Plugin',
        { message: err?.message || 'Failed to fetch plugin zip' },
        'Plugin Download Error'
      )
      showErrorToast('Plugin download failed. Our team has been notified and will fix it shortly.')
    } finally {
      setDownloading(false)
    }
  }

  async function sendInvite() {
    if (!devEmail) return
    try {
      const res = await fetch(`${API}/api/v1/invite-partner`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: devEmail }),
      })
      if (res.ok) { setInviteSent(true); setTimeout(() => setShowModal(false), 2000) }
      else throw new Error(`Invite failed: ${res.status}`)
    } catch (err: any) {
      await reportError('Invite Partner', err)
      showErrorToast('Failed to send invite. Our team has been notified.')
    }
  }

  const activeChannel = PLATFORM_CHANNEL[selected]
  const isCopied = (k: string) => copiedKey === k

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-slate-900">
      <main className="max-w-5xl mx-auto p-6 md:p-12 space-y-10">

        {/* Status bar */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Connections</h1>
            <p className="text-sm text-slate-500 mt-0.5">Connect any lead source to LeadRankerAI</p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isVerified ? 'bg-green-500' : 'bg-amber-400 animate-pulse'}`} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {isVerified ? 'Active — leads flowing' : 'Waiting for first lead'}
            </span>
          </div>
        </div>

        {/* Two ways cards */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">
            Two ways to send leads to LeadRankerAI
          </h2>
          <div className="grid md:grid-cols-2 gap-5">

            {/* Card 1 — Magic Email */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-7 text-white shadow-xl relative overflow-hidden">
              <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/5 rounded-full" />
              <div className="relative z-10 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                    <Mail size={18} />
                  </div>
                  <div>
                    <p className="font-black text-sm">Magic Email Address</p>
                    <p className="text-blue-200 text-[10px] font-bold uppercase tracking-widest">For email-based sources</p>
                  </div>
                </div>
                <p className="text-blue-100 text-xs leading-relaxed">
                  Forward any lead notification email to this address.
                  Our AI reads it, scores the lead, and adds it to your dashboard.
                  <strong className="text-white"> Works with Facebook Ads, Google Ads, Gmail filters.</strong>
                </p>
                <div className="bg-white/10 backdrop-blur rounded-2xl p-3 flex items-center gap-3 border border-white/20">
                  <code className="text-xs font-mono flex-1 break-all text-blue-100">
                    {connData.email_forwarding || 'Loading...'}
                  </code>
                  <button onClick={() => copy(connData.email_forwarding, 'email')}
                    className="flex-shrink-0 p-2 hover:bg-white/20 rounded-xl transition-all">
                    {isCopied('email')
                      ? <CheckCircle size={16} className="text-green-300" />
                      : <Copy size={16} />}
                  </button>
                </div>
                <p className="text-blue-200 text-[10px]">
                  ✓ No installation · ✓ Works with any email platform · ✓ Instant scoring
                </p>
              </div>
            </div>

            {/* Card 2 — WordPress Plugin */}
            <div className="bg-slate-900 rounded-3xl p-7 text-white shadow-xl relative overflow-hidden">
              <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/5 rounded-full" />
              <div className="relative z-10 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 bg-blue-500/20 rounded-xl flex items-center justify-center">
                    <Plug size={18} className="text-blue-400" />
                  </div>
                  <div>
                    <p className="font-black text-sm">WordPress Ghost Plugin</p>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">For website contact forms</p>
                  </div>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Install once on your WordPress site. The plugin silently intercepts
                  every form submission, scores it with AI, and redirects the lead to
                  <strong className="text-white"> their personalised score page instantly.</strong>
                </p>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                    Your Plugin API Key
                  </p>
                  <div className="bg-slate-800 border border-slate-700 rounded-2xl p-3 flex items-center gap-3">
                    <code className="text-xs font-mono flex-1 text-blue-300 break-all">
                      {apiKey || 'Loading...'}
                    </code>
                    {apiKey && (
                      <button onClick={() => copy(apiKey, 'apikey')}
                        className="flex-shrink-0 p-2 hover:bg-slate-700 rounded-xl transition-all">
                        {isCopied('apikey')
                          ? <CheckCircle size={16} className="text-green-400" />
                          : <Copy size={16} className="text-slate-400" />}
                      </button>
                    )}
                  </div>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                  <p className="text-blue-300 text-[10px] font-bold flex items-center gap-1.5 mb-1">
                    <Info size={11} /> Why is this different from the Magic Email?
                  </p>
                  <p className="text-slate-400 text-[10px] leading-relaxed">
                    The email address is for <em>forwarding notifications</em> to LeadRankerAI.
                    The API key is for the <em>plugin on your website</em> to score leads in real time
                    and redirect visitors to their score page.
                  </p>
                </div>
                <p className="text-slate-500 text-[10px]">
                  ✓ Zero configuration · ✓ Works with Elementor, CF7, Divi · ✓ Lead sees their score
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Platform Gallery */}
        <section className="space-y-5">
          <div className="flex justify-between items-end">
            <h2 className="text-lg font-black">Setup by Platform</h2>
            <button onClick={() => setShowModal(true)}
              className="text-blue-600 text-sm font-bold flex items-center gap-1.5 hover:underline">
              <UserPlus size={15} /> Invite Tech Partner
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              { name: 'Facebook Ads', icon: <Facebook size={20} />, channel: 'email',  badge: 'Magic Email' },
              { name: 'WordPress',    icon: <Globe size={20} />,    channel: 'plugin', badge: 'Plugin' },
              { name: 'Google Ads',   icon: <Mail size={20} />,     channel: 'email',  badge: 'Magic Email' },
              { name: 'Custom CRM',   icon: <Code size={20} />,     channel: 'email',  badge: 'Webhook' },
            ] as const).map((p) => (
              <button key={p.name} onClick={() => setSelected(p.name)}
                className={`p-5 rounded-2xl border-2 transition-all flex flex-col items-center gap-3
                  ${selected === p.name
                    ? 'border-blue-600 bg-white shadow-lg scale-105'
                    : 'border-transparent bg-white shadow-sm opacity-60 hover:opacity-100'}`}>
                <div className="p-2.5 bg-slate-50 rounded-xl text-blue-600">{p.icon}</div>
                <p className="font-bold text-[10px] uppercase tracking-tight text-center text-slate-800">
                  {p.name}
                </p>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full
                  ${p.channel === 'plugin'
                    ? 'bg-slate-900 text-blue-300'
                    : 'bg-blue-100 text-blue-700'}`}>
                  {p.badge}
                </span>
              </button>
            ))}
          </div>

          {/* Guide panel */}
          <div className="bg-white border border-slate-100 rounded-3xl p-8 shadow-sm space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="font-black text-lg flex items-center gap-2">
                Setup Guide: {selected}
                <ChevronRight size={18} className="text-slate-300" />
              </h3>
              <div className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full
                ${activeChannel === 'plugin'
                  ? 'bg-slate-900 text-blue-300'
                  : 'bg-blue-100 text-blue-700'}`}>
                {activeChannel === 'plugin'
                  ? <><Plug size={12} /> Uses Plugin API Key</>
                  : <><Mail size={12} /> Uses Magic Email Address</>}
              </div>
            </div>

            <div className="space-y-4">
              {GUIDES[selected].map((step, i) => (
                <div key={i} className="flex gap-4 items-start">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center
                    justify-center text-[10px] font-black flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-sm text-slate-600 leading-relaxed">{step}</p>
                </div>
              ))}
            </div>

            {activeChannel === 'email' && connData.email_forwarding && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <Mail size={11} /> Your Magic Email Address — copy this
                </p>
                <div className="flex items-center gap-3">
                  <code className="text-sm text-blue-700 font-mono flex-1 break-all">
                    {connData.email_forwarding}
                  </code>
                  <button onClick={() => copy(connData.email_forwarding, 'guide-email')}
                    className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all flex-shrink-0">
                    {isCopied('guide-email') ? <CheckCircle size={15} /> : <Copy size={15} />}
                  </button>
                </div>
              </div>
            )}

            {selected === 'WordPress' && (
              <div className="space-y-3">
                <div className="bg-slate-900 rounded-2xl p-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <Plug size={11} className="text-blue-400" /> Plugin API Key — paste into WP settings
                  </p>
                  <div className="flex items-center gap-3">
                    <code className="text-sm text-blue-300 font-mono flex-1 break-all">
                      {apiKey || 'Loading...'}
                    </code>
                    {apiKey && (
                      <button onClick={() => copy(apiKey, 'guide-key')}
                        className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all flex-shrink-0">
                        {isCopied('guide-key') ? <CheckCircle size={15} /> : <Copy size={15} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Download button with error reporting ── */}
                <button
                  onClick={handlePluginDownload}
                  disabled={downloading}
                  className="flex items-center justify-center gap-2 w-full bg-blue-600 text-white
                    py-3 rounded-2xl font-bold text-sm hover:bg-blue-700 transition-all
                    disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Download size={16} />
                  {downloading ? 'Downloading...' : 'Download WordPress Plugin (.zip)'}
                </button>
                <p className="text-xs text-slate-400 text-center">
                  Upload to WordPress → Plugins → Add New → Upload Plugin
                </p>
              </div>
            )}

            {selected === 'Custom CRM' && connData.webhook_url && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <Terminal size={11} /> Webhook URL — POST lead data here
                </p>
                <div className="flex items-center gap-3">
                  <code className="text-xs text-blue-600 font-mono flex-1 break-all">
                    {connData.webhook_url}
                  </code>
                  <button onClick={() => copy(connData.webhook_url, 'webhook')}
                    className="p-2 bg-slate-900 text-white rounded-xl hover:bg-slate-700 transition-all flex-shrink-0">
                    {isCopied('webhook') ? <CheckCircle size={15} /> : <Copy size={15} />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Gmail trick + Security */}
        <div className="grid md:grid-cols-2 gap-6 pb-10">
          <div className="bg-slate-800 text-white p-8 rounded-3xl relative overflow-hidden shadow-xl">
            <div className="absolute -right-6 -bottom-6 w-28 h-28 bg-white/5 rounded-full" />
            <div className="relative z-10">
              <h3 className="text-base font-black text-orange-400 mb-2">💡 The Gmail CC Trick</h3>
              <p className="text-slate-400 text-xs mb-5 leading-relaxed">
                Don't have access to the form settings? Use Gmail to silently forward
                lead emails to LeadRankerAI without touching anything.
              </p>
              <button onClick={() => setShowDocs(!showDocs)}
                className="flex items-center gap-2 text-xs font-bold text-white border-b
                  border-white/20 pb-1 hover:text-blue-300 transition-colors">
                {showDocs ? 'Hide Tutorial' : 'Show Setup Steps'}
                <ChevronRight size={13} className={`transition-transform ${showDocs ? 'rotate-90' : ''}`} />
              </button>
              {showDocs && (
                <div className="mt-5 space-y-2.5 text-xs text-slate-400">
                  <p>1. Open Gmail → Settings → Filters and Blocked Addresses</p>
                  <p>2. Create a filter matching "New Lead" or "Form submission"</p>
                  <p>3. Choose "Forward to" and paste your Magic Email:</p>
                  <div className="bg-slate-700 rounded-xl p-3 mt-2">
                    <code className="text-white font-mono text-[11px] break-all">
                      {connData.email_forwarding || 'Your magic email...'}
                    </code>
                  </div>
                  <p>4. Save. Every matching email now gets AI-scored automatically.</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 space-y-4">
            <div className="flex items-center gap-2">
              <Lock size={15} className="text-blue-600" />
              <h4 className="font-black text-xs uppercase tracking-widest text-blue-600">
                Security & Privacy
              </h4>
            </div>
            <div className="space-y-3 text-xs text-slate-500 leading-relaxed">
              <p>🔒 <strong className="text-slate-700">Your Magic Email</strong> is unique to your brokerage ID. Only emails forwarded to it appear in your dashboard.</p>
              <p>🔑 <strong className="text-slate-700">Your Plugin API Key</strong> is a secret. Never share it publicly. Rotate it anytime from Settings if compromised.</p>
              <p>🛡️ All lead data is encrypted in transit (TLS 1.3) and at rest (AES-256). We never sell or share your leads. Compliant with Indian IT Act 2000.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Invite Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl relative">
            <button onClick={() => setShowModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-900">
              <X size={22} />
            </button>
            <h3 className="text-xl font-black mb-1">Invite Your Developer</h3>
            <p className="text-slate-500 text-sm mb-6">
              Send your Webhook URL, API docs, and setup instructions to your tech team.
            </p>
            {inviteSent ? (
              <div className="flex items-center gap-3 bg-green-50 border border-green-200
                text-green-700 p-4 rounded-2xl font-bold text-sm">
                <CheckCircle size={20} /> Invitation sent!
              </div>
            ) : (
              <div className="space-y-3">
                <input type="email" value={devEmail}
                  onChange={(e) => setDevEmail(e.target.value)}
                  placeholder="developer@agency.com"
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none
                    focus:border-blue-600 transition-all text-sm" />
                <button onClick={sendInvite}
                  className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all">
                  Send Invitation Email
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <ErrorToast />
    </div>
  )
}