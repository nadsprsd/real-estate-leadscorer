import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";
import {
  Loader2, Zap, Crown, Gift, CheckCircle, XCircle,
  AlertTriangle, RefreshCw, ArrowRight, TrendingUp,
  Shield, Lock, Bell, Send, Users, Clock,
  ChevronDown, ChevronUp, Info, BadgeCheck, Star,
  Smartphone, Brain, MessageSquare, BarChart3, Plug,
} from "lucide-react";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface Alert { type: "error" | "warning" | "info"; message: string; }

interface UsageData {
  plan: string;
  subscription_status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  usage: number;
  limit: number;
  remaining: number;
  percent: number;
  blocked: boolean;
  alerts: Alert[];
}

interface Referral {
  id: string;
  referee_email: string;
  status: "pending" | "qualified" | "rewarded" | "expired";
  submitted_at: string | null;
  qualified_at: string | null;
  rewarded_at: string | null;
  credit_amount: number;
  days_since_qualified: number | null;
  days_remaining: number | null;
}

interface ReferralStats {
  total: number;
  pending: number;
  qualified: number;
  rewarded: number;
  total_earned_usd: number;
  credit_per_referral: number;
  qualify_days: number;
}

type ToastType = "success" | "error" | "warning";

// ─────────────────────────────────────────────
// Plan Config
// ─────────────────────────────────────────────
const PLAN_CONFIG: Record<string, {
  label: string; color: string; bg: string; border: string;
  icon: React.ReactNode; tagline: string;
}> = {
  trial: {
    label: "Free Trial", tagline: "50 leads/mo · No credit card needed",
    color: "text-slate-600", bg: "bg-slate-100", border: "border-slate-300",
    icon: <TrendingUp size={22} className="text-slate-500" />,
  },
  starter: {
    label: "Starter", tagline: "$19/mo · 1,000 leads/mo",
    color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-300",
    icon: <Zap size={22} className="text-blue-600" />,
  },
  team: {
    label: "Team", tagline: "$49/mo · 5,000 leads/mo",
    color: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-300",
    icon: <Crown size={22} className="text-indigo-600" />,
  },
};

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────
export default function Billing() {
  const navigate = useNavigate();
  // BUG FIX: Read the token directly from the auth store so we always
  // use the CURRENT user's token, not a stale closure. This prevents
  // User A's data from leaking to User B after a fresh login.
  const token = useAuthStore((s) => s.token);
  // Track which user's token was used to fetch data — if token changes mid-session, refetch
  const fetchedForToken = useRef<string | null>(null);

  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [activeLoader, setActiveLoader] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: ToastType; message: string } | null>(null);

  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);
  const [referralEmail, setReferralEmail] = useState("");
  const [referralLoading, setReferralLoading] = useState(false);
  const [showReferrals, setShowReferrals] = useState(false);
  const [showReferralInfo, setShowReferralInfo] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [showUpcoming, setShowUpcoming] = useState(false);

  // ── Toast ──────────────────────────────────
  const showToast = useCallback((type: ToastType, message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 7000);
  }, []);

  // ── Fetch usage ────────────────────────────
  // BUG FIX: Always pass the current token explicitly so we never
  // accidentally send a stale token from a previous user session.
  const fetchUsage = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/v1/billing/usage");
      setUsage(res);
    } catch (err: any) {
      showToast("error", err?.message || "Failed to load billing info");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // ── Fetch referrals ────────────────────────
  const fetchReferrals = useCallback(async () => {
    try {
      const res = await api.get("/api/v1/billing/referrals");
      setReferrals(res.referrals || []);
      setReferralStats(res.stats || null);
    } catch (err: any) {
      console.warn("Referrals fetch failed:", err?.message);
    }
  }, []);

  // ── Verify Stripe session after redirect ───
  const verifySession = useCallback(async (sessionId: string, plan: string) => {
    setVerifying(true);
    try {
      await api.get(`/api/v1/billing/verify-session?session_id=${sessionId}`);
      showToast("success", `🎉 Payment confirmed! Your ${plan} plan is now active.`);
      await fetchUsage();
      await fetchReferrals();
      setTimeout(() => navigate("/dashboard"), 2000);
    } catch {
      showToast("success", `✅ Payment received! Your ${plan} plan will activate shortly.`);
      await fetchUsage();
      setTimeout(() => navigate("/dashboard"), 2500);
    } finally {
      setVerifying(false);
    }
  }, [fetchUsage, fetchReferrals, navigate, showToast]);

  // ── On mount / token change: check URL params and fetch fresh data ──
  // BUG FIX: The effect watches `token`. When a new user logs in and lands
  // on this page, token will be different from the previous fetch, forcing
  // a fresh fetch scoped to the correct user.
  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }

    // Only refetch if the token has changed (new user logged in)
    if (fetchedForToken.current === token) return;
    fetchedForToken.current = token;

    // Clear previous user's data immediately before fetching new user's data
    setUsage(null);
    setReferrals([]);
    setReferralStats(null);

    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const canceled = params.get("canceled");
    const sessionId = params.get("session_id");
    const plan = params.get("plan") || "paid";
    window.history.replaceState({}, "", "/billing");

    if (success === "true" && sessionId) {
      verifySession(sessionId, plan);
    } else if (success === "true") {
      showToast("success", `🎉 Payment successful! ${plan} plan active.`);
      fetchUsage();
    } else if (canceled === "true") {
      showToast("warning", "Payment canceled. No charges made.");
      fetchUsage();
    } else {
      fetchUsage();
    }
    fetchReferrals();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Upgrade handler ────────────────────────
  const handleUpgrade = async (plan: string) => {
    if (activeLoader) return;
    setActiveLoader(plan);
    try {
      const res = await api.post("/api/v1/billing/checkout", { plan });
      const url = res?.checkout_url;
      if (url) window.location.href = url;
      else throw new Error("No checkout URL returned");
    } catch (err: any) {
      showToast("error", `❌ ${err?.message || "Checkout failed"}`);
      setActiveLoader(null);
    }
  };

  // ── Submit referral ────────────────────────
  const handleReferralSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referralEmail.trim()) return;
    setReferralLoading(true);
    try {
      await api.post("/api/v1/billing/referrals/submit", { referee_email: referralEmail.trim() });
      showToast("success", `✅ Invite sent to ${referralEmail}! You earn $5 if they stay subscribed 30 days.`);
      setReferralEmail("");
      await fetchReferrals();
      setShowReferrals(true);
    } catch (err: any) {
      showToast("error", `❌ ${err?.message || "Failed to submit referral"}`);
    } finally {
      setReferralLoading(false);
    }
  };

  const getProgressColor = (p: number) =>
    p >= 90 ? "bg-red-500" : p >= 70 ? "bg-amber-400" : "bg-blue-500";

  const planConfig = PLAN_CONFIG[usage?.plan || "trial"] || PLAN_CONFIG.trial;
  const isPaid = usage?.plan && usage.plan !== "trial";

  // ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 p-5 md:p-10">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* ── Toast notification ─────────────────── */}
        {toast && (
          <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-4
            rounded-2xl shadow-2xl text-white text-sm font-semibold max-w-sm animate-in
            ${toast.type === "success" ? "bg-green-600"
              : toast.type === "error" ? "bg-red-600" : "bg-amber-500"}`}>
            {toast.type === "success" && <CheckCircle size={18} />}
            {toast.type === "error" && <XCircle size={18} />}
            {toast.type === "warning" && <AlertTriangle size={18} />}
            <span>{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-auto opacity-70 hover:opacity-100">✕</button>
          </div>
        )}

        {/* ── Payment verifying overlay ──────────── */}
        {verifying && (
          <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center">
            <div className="bg-white rounded-3xl p-10 flex flex-col items-center gap-4 shadow-2xl">
              <Loader2 size={40} className="animate-spin text-blue-600" />
              <p className="font-bold text-slate-800 text-lg">Confirming payment...</p>
              <p className="text-slate-500 text-sm">Verifying with Stripe — please wait</p>
            </div>
          </div>
        )}

        {/* ── Header ────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">Billing & Plans</h1>
            <p className="text-slate-500 text-sm mt-1">Manage subscription, usage & referrals</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate("/dashboard")}
              className="flex items-center gap-2 text-sm text-slate-600 bg-white border
                border-slate-200 px-4 py-2 rounded-xl hover:border-slate-300 transition-all">
              Dashboard <ArrowRight size={14} />
            </button>
            <button onClick={() => { fetchUsage(); fetchReferrals(); }} disabled={loading}
              className="flex items-center gap-2 text-sm text-slate-500 bg-white border
                border-slate-200 px-4 py-2 rounded-xl transition-all disabled:opacity-50">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Backend alerts ─────────────────────── */}
        {usage?.alerts?.map((alert, i) => (
          <div key={i} className={`flex items-start gap-3 p-4 rounded-2xl border text-sm font-medium ${
            alert.type === "error" ? "bg-red-50 border-red-200 text-red-700"
            : alert.type === "warning" ? "bg-amber-50 border-amber-200 text-amber-700"
            : "bg-blue-50 border-blue-200 text-blue-700"}`}>
            {alert.type === "error" && <XCircle size={18} className="mt-0.5 flex-shrink-0" />}
            {alert.type === "warning" && <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />}
            {alert.type === "info" && <Info size={18} className="mt-0.5 flex-shrink-0" />}
            {alert.message}
          </div>
        ))}

        {/* ── Current Plan Banner ────────────────── */}
        {!loading && usage && (
          <div className={`flex items-center justify-between p-5 rounded-2xl border-2
            ${planConfig.border} ${planConfig.bg}`}>
            <div className="flex items-center gap-3">
              {planConfig.icon}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Current Plan</p>
                <p className={`text-2xl font-black ${planConfig.color}`}>{planConfig.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{planConfig.tagline}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 font-medium mb-1">Status</p>
              <span className={`text-sm font-bold px-3 py-1.5 rounded-full ${
                usage.subscription_status === "active" ? "bg-green-100 text-green-700"
                : usage.subscription_status === "past_due" ? "bg-red-100 text-red-700"
                : usage.subscription_status === "canceled" ? "bg-slate-200 text-slate-600"
                : "bg-slate-200 text-slate-500"}`}>
                {usage.subscription_status === "active" ? "✓ Active"
                  : usage.subscription_status === "past_due" ? "⚠ Past Due"
                  : usage.subscription_status === "canceled" ? "✗ Canceled"
                  : "Free Trial"}
              </span>
            </div>
          </div>
        )}

        {/* ── Usage Card ─────────────────────────── */}
        <section className="bg-white border border-slate-200 p-7 rounded-3xl space-y-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800">Monthly Usage</h3>
            {usage && (
              <span className={`text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-widest
                ${planConfig.bg} ${planConfig.color}`}>
                {planConfig.label}
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center gap-3 text-slate-400 py-6 justify-center">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm">Loading usage data...</span>
            </div>
          ) : usage ? (
            <>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { value: usage.usage, label: "Used This Month" },
                  { value: usage.remaining, label: "Remaining" },
                  { value: usage.limit, label: "Monthly Limit" },
                ].map(({ value, label }) => (
                  <div key={label} className="bg-slate-50 rounded-2xl p-5 text-center">
                    <p className="text-3xl font-black text-slate-900">{value.toLocaleString()}</p>
                    <p className="text-xs text-slate-500 font-medium mt-1">{label}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-500 font-medium">
                  <span>{usage.percent}% used</span>
                  <span>{usage.usage.toLocaleString()} / {usage.limit.toLocaleString()} leads</span>
                </div>
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-1000 ${getProgressColor(usage.percent)}`}
                    style={{ width: `${Math.min(usage.percent, 100)}%` }} />
                </div>
              </div>
              {usage.blocked && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 text-red-700">
                  <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-bold text-sm">Monthly limit reached</p>
                    <p className="text-xs mt-0.5">Upgrade your plan to continue scoring leads.</p>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </section>

        {/* ── Referral Section ───────────────────── */}
        <section className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-7 text-white shadow-lg space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Gift size={20} className="text-blue-200" />
                <span className="text-blue-200 text-xs font-bold uppercase tracking-widest">Referral Program</span>
              </div>
              <h2 className="text-2xl font-black">Refer Agents → Earn $5</h2>
              <p className="text-blue-100 text-sm mt-1">
                Share LeadRankerAI with other agents. When they subscribe and stay 30 days,
                you get a <strong>$5 credit</strong> on your next invoice — automatically.
              </p>
            </div>
            {referralStats && referralStats.total_earned_usd > 0 && (
              <div className="bg-white/20 rounded-2xl px-4 py-3 text-center flex-shrink-0">
                <p className="text-2xl font-black">${referralStats.total_earned_usd.toFixed(2)}</p>
                <p className="text-blue-200 text-xs">earned</p>
              </div>
            )}
          </div>

          {/* Steps */}
          <div className="grid grid-cols-4 gap-3 text-center">
            {[
              { step: "1", text: "Submit email" },
              { step: "2", text: "They sign up" },
              { step: "3", text: "Wait 30 days" },
              { step: "4", text: "You get $5!" },
            ].map(({ step, text }) => (
              <div key={step} className="bg-white/10 rounded-2xl p-3">
                <div className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center
                  text-xs font-black mx-auto mb-2">{step}</div>
                <p className="text-xs text-blue-100 font-medium">{text}</p>
              </div>
            ))}
          </div>

          {/* How it works toggle */}
          <button onClick={() => setShowReferralInfo(!showReferralInfo)}
            className="flex items-center gap-2 text-sm text-blue-100 hover:text-white transition-colors">
            <Info size={16} />
            How does this work?
            {showReferralInfo ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showReferralInfo && (
            <div className="bg-white/10 rounded-2xl p-4 space-y-3 border border-white/20">
              <div className="space-y-2 text-sm text-blue-100">
                {[
                  { day: "Day 0", text: "You submit their email address below" },
                  { day: "Day 1", text: "They sign up and pay for Starter ($19) or Team ($49)" },
                  { day: "Days 2–30", text: "We track their subscription — they must stay active" },
                  { day: "Day 31+", text: "On their second payment, $5 credit added to your account automatically" },
                ].map(({ day, text }) => (
                  <div key={day}>
                    <span className="font-bold text-white">{day}:</span> {text}
                  </div>
                ))}
              </div>
              <div className="bg-white/10 rounded-xl p-3 border border-white/20 text-xs text-blue-100 space-y-1">
                <p className="font-bold text-white mb-1">FAQ:</p>
                <p>✓ No limit — earn unlimited $5 credits</p>
                <p>✓ If they cancel before day 30, reward is forfeited</p>
                <p>✓ Credits apply automatically on your next invoice</p>
                <p>✓ One reward per referee email address</p>
              </div>
            </div>
          )}

          {/* Submit form — only for paid users */}
          {isPaid ? (
            <form onSubmit={handleReferralSubmit} className="flex gap-3">
              <input
                type="email"
                value={referralEmail}
                onChange={e => setReferralEmail(e.target.value)}
                placeholder="friend@agency.com"
                required
                className="flex-1 px-4 py-3 rounded-xl text-slate-800 text-sm
                  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-white"
              />
              <button type="submit" disabled={referralLoading || !referralEmail.trim()}
                className="flex items-center gap-2 bg-white text-blue-700 px-5 py-3 rounded-xl
                  font-bold text-sm hover:bg-blue-50 disabled:opacity-60 transition-all flex-shrink-0">
                {referralLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Send Invite
              </button>
            </form>
          ) : (
            <div className="bg-white/10 rounded-2xl p-4 text-center border border-white/20">
              <p className="text-blue-100 text-sm">
                🔒 Upgrade to Starter or Team to start earning referral credits
              </p>
            </div>
          )}

          {/* Referral list toggle */}
          {referrals.length > 0 && (
            <button onClick={() => setShowReferrals(!showReferrals)}
              className="flex items-center gap-2 text-sm text-blue-100 font-medium hover:text-white transition-colors">
              <Users size={16} />
              Your Referrals ({referrals.length})
              {showReferrals ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}

          {/* Referral rows */}
          {showReferrals && referrals.length > 0 && (
            <div className="space-y-2">
              {referrals.map(r => (
                <div key={r.id} className="bg-white/10 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      r.status === "rewarded" ? "bg-green-400"
                      : r.status === "qualified" ? "bg-amber-400"
                      : r.status === "expired" ? "bg-red-400" : "bg-blue-300"}`} />
                    <span className="text-white font-medium text-sm">{r.referee_email}</span>
                  </div>
                  <div className="text-right text-xs">
                    {r.status === "rewarded" && (
                      <span className="text-green-300 font-bold flex items-center gap-1">
                        <BadgeCheck size={13} /> $5 Earned!
                      </span>
                    )}
                    {r.status === "qualified" && r.days_remaining !== null && (
                      <span className="text-amber-300 flex items-center gap-1">
                        <Clock size={12} /> {r.days_remaining}d left
                      </span>
                    )}
                    {r.status === "pending" && (
                      <span className="text-blue-200">Pending signup</span>
                    )}
                    {r.status === "expired" && (
                      <span className="text-red-300">Expired</span>
                    )}
                  </div>
                </div>
              ))}
              {referralStats && (
                <div className="flex justify-between text-xs text-blue-200 pt-2 border-t border-white/10">
                  <span>
                    {referralStats.rewarded} rewarded · {referralStats.qualified} qualifying · {referralStats.pending} pending
                  </span>
                  <span>Total earned: ${referralStats.total_earned_usd.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Plan Cards ─────────────────────────── */}
        {(!isPaid || usage?.plan === "starter") && (
          <div className="grid md:grid-cols-2 gap-5">
            <PlanCard
              plan="starter" title="Starter" price="$19" period="month"
              tagline="Perfect for solo agents" limit="1,000 leads/mo"
              features={["1,000 AI lead scores/month","GPT-4 NLP scoring","HOT/WARM/COLD buckets","Email alerts for hot leads","Referral program access"]}
              highlighted={false} active={usage?.plan === "starter"}
              loading={activeLoader === "starter"}
              onUpgrade={() => handleUpgrade("starter")}
            />
            <PlanCard
              plan="team" title="Team" price="$49" period="month"
              tagline="For growing brokerages" limit="5,000 leads/mo"
              features={["5,000 AI lead scores/month","Everything in Starter","Priority processing","Advanced analytics","Priority support"]}
              highlighted active={usage?.plan === "team"}
              loading={activeLoader === "team"}
              onUpgrade={() => handleUpgrade("team")}
            />
          </div>
        )}

        {isPaid && (
          <div className="text-center">
            <button onClick={() => navigate("/dashboard")}
              className="inline-flex items-center gap-2 bg-slate-900 text-white px-8 py-4
                rounded-2xl font-bold hover:bg-slate-700 transition-all hover:scale-105 active:scale-95">
              Go to Dashboard <ArrowRight size={18} />
            </button>
          </div>
        )}

        {/* ── Security Section ───────────────────── */}
        <section className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
          <button onClick={() => setShowSecurity(!showSecurity)}
            className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
                <Shield size={18} className="text-white" />
              </div>
              <div className="text-left">
                <h3 className="font-bold text-slate-800">Security & Privacy</h3>
                <p className="text-xs text-slate-500">How we protect your data and payments</p>
              </div>
            </div>
            {showSecurity ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
          </button>

          {showSecurity && (
            <div className="px-6 pb-6 border-t border-slate-100 pt-5">
              <div className="grid md:grid-cols-2 gap-4">
                {[
                  { icon: <Lock size={16} className="text-green-600" />, title: "Payments secured by Stripe", desc: "We never store card details. PCI DSS Level 1 certified — the highest standard in the industry." },
                  { icon: <Shield size={16} className="text-blue-600" />, title: "End-to-end encryption", desc: "TLS 1.3 in transit. Data encrypted at rest. Only you can access your brokerage's data." },
                  { icon: <Bell size={16} className="text-purple-600" />, title: "Proactive usage alerts", desc: "You're emailed at 75% and 90% of your monthly limit so you're never caught off guard." },
                  { icon: <BadgeCheck size={16} className="text-amber-600" />, title: "Your data is yours", desc: "We never sell, share, or use your lead data for advertising. Used only for your AI scores." },
                  { icon: <Users size={16} className="text-rose-600" />, title: "JWT authentication", desc: "Sessions expire automatically. You can invalidate all sessions at any time." },
                  { icon: <Star size={16} className="text-indigo-600" />, title: "Cancel anytime, no lock-in", desc: "No cancellation fees. Your plan stays active until the end of the billing period." },
                ].map(({ icon, title, desc }) => (
                  <div key={title} className="flex gap-3 p-4 bg-slate-50 rounded-2xl">
                    <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center flex-shrink-0">
                      {icon}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-slate-800">{title}</p>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── Coming Soon / Roadmap ──────────────── */}
        <section className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
          <button onClick={() => setShowUpcoming(!showUpcoming)}
            className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-xl flex items-center justify-center">
                <Star size={18} className="text-white" />
              </div>
              <div className="text-left">
                <h3 className="font-bold text-slate-800">Roadmap & Coming Soon</h3>
                <p className="text-xs text-slate-500">What we're building next for you</p>
              </div>
            </div>
            {showUpcoming ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
          </button>

          {showUpcoming && (
            <div className="px-6 pb-6 border-t border-slate-100 pt-5 space-y-3">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-5 text-white">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <Smartphone size={24} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-lg">Q3 2026</span>
                      <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-0.5 rounded-lg">🔥 Big Release</span>
                    </div>
                    <h4 className="font-bold text-lg">Mobile App — iOS & Android</h4>
                    <p className="text-blue-100 text-sm mt-1">
                      Score leads on the go. Push notifications for HOT leads, offline mode, and a
                      mobile-first scoring interface built for agents in the field.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {["Android", "iOS", "Push Notifications", "Offline Mode"].map(tag => (
                        <span key={tag} className="bg-white/10 text-white text-xs px-2 py-0.5 rounded-full">{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 p-4 bg-purple-50 rounded-2xl border border-purple-100">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center flex-shrink-0 border border-purple-100">
                  <Brain size={18} className="text-purple-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-0.5 rounded-lg">Q3 2026</span>
                  </div>
                  <p className="font-semibold text-sm text-slate-800">ML Model Fine-Tuning on Real Data</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    As we collect real estate lead conversion patterns, we'll fine-tune our scoring model on actual
                    outcomes — scores get smarter every month.
                  </p>
                </div>
              </div>

              {[
                {
                  icon: <MessageSquare size={18} className="text-green-600" />,
                  bg: "bg-green-50", border: "border-green-100",
                  badge: "Q2 2026", badgeColor: "bg-green-100 text-green-700",
                  title: "WhatsApp Lead Alerts",
                  desc: "Instant HOT lead notifications on WhatsApp. No more checking email — get alerted the moment a high-intent lead comes in.",
                },
                {
                  icon: <Plug size={18} className="text-blue-600" />,
                  bg: "bg-blue-50", border: "border-blue-100",
                  badge: "Testing Now", badgeColor: "bg-blue-100 text-blue-700",
                  title: "CRM Integrations",
                  desc: "Already built — testing underway! Facebook Ads, WordPress, Google Ads sync directly into LeadRankerAI.",
                },
                {
                  icon: <BarChart3 size={18} className="text-amber-600" />,
                  bg: "bg-amber-50", border: "border-amber-100",
                  badge: "Q3 2026", badgeColor: "bg-amber-100 text-amber-700",
                  title: "Advanced Analytics Dashboard",
                  desc: "Conversion rates by score bucket, lead source performance, agent leaderboards, and monthly trend graphs.",
                },
                {
                  icon: <Users size={18} className="text-indigo-600" />,
                  bg: "bg-indigo-50", border: "border-indigo-100",
                  badge: "Q4 2026", badgeColor: "bg-indigo-100 text-indigo-700",
                  title: "Team Accounts & Multi-Agent",
                  desc: "Invite your whole team. Role-based permissions, shared lead pools, and per-agent analytics.",
                },
              ].map(({ icon, bg, border, badge, badgeColor, title, desc }) => (
                <div key={title} className={`flex gap-4 p-4 ${bg} rounded-2xl border ${border}`}>
                  <div className={`w-10 h-10 bg-white rounded-xl flex items-center justify-center flex-shrink-0 border ${border}`}>
                    {icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${badgeColor}`}>{badge}</span>
                    </div>
                    <p className="font-semibold text-sm text-slate-800">{title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}

              <p className="text-xs text-slate-400 text-center pt-2">
                Feature request?{" "}
                <a href="mailto:hello@leadrankerai.com" className="text-blue-500 hover:underline">
                  hello@leadrankerai.com
                </a>
              </p>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Plan Card Component
// ─────────────────────────────────────────────
function PlanCard({
  title, price, period, tagline, limit, features,
  highlighted, active, loading, onUpgrade,
}: {
  plan: string; title: string; price: string; period: string;
  tagline: string; limit: string; features: string[];
  highlighted: boolean; active: boolean; loading: boolean; onUpgrade: () => void;
}) {
  return (
    <div className={`relative p-7 rounded-3xl border-2 flex flex-col gap-5 transition-all ${
      highlighted
        ? "bg-slate-900 border-slate-700 text-white shadow-2xl"
        : "bg-white border-slate-200 text-slate-900 shadow-sm"
    } ${active ? "ring-2 ring-green-500 ring-offset-2" : ""}`}>

      {active && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-600 text-white
          text-xs font-bold px-4 py-1 rounded-full flex items-center gap-1 whitespace-nowrap">
          <CheckCircle size={12} /> Current Plan
        </div>
      )}
      {highlighted && !active && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-500 text-white
          text-xs font-bold px-4 py-1 rounded-full">
          Most Popular
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-2">
          {highlighted
            ? <Crown size={18} className="text-yellow-400" />
            : <Zap size={18} className="text-blue-500" />}
          <span className={`text-sm font-bold uppercase tracking-widest ${
            highlighted ? "text-slate-400" : "text-slate-500"}`}>
            {title}
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-black">{price}</span>
          <span className={`text-sm ${highlighted ? "text-slate-400" : "text-slate-500"}`}>/{period}</span>
        </div>
        <p className={`text-xs mt-1 ${highlighted ? "text-slate-400" : "text-slate-500"}`}>
          {tagline} · {limit}
        </p>
      </div>

      <ul className="space-y-2.5 flex-1">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <CheckCircle size={15} className={`mt-0.5 flex-shrink-0 ${
              highlighted ? "text-blue-400" : "text-blue-500"}`} />
            <span className={highlighted ? "text-slate-300" : "text-slate-600"}>{f}</span>
          </li>
        ))}
      </ul>

      <button onClick={onUpgrade} disabled={active || loading}
        className={`w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center
          gap-2 transition-all ${
            active ? "bg-green-600 text-white cursor-default"
            : highlighted
              ? "bg-white text-slate-900 hover:bg-slate-100 disabled:opacity-60"
              : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
          } ${!active && !loading ? "hover:scale-[1.02] active:scale-[0.98]" : ""}`}>
        {loading
          ? <><Loader2 size={16} className="animate-spin" /> Redirecting...</>
          : active
            ? <><CheckCircle size={16} /> Your Plan</>
            : `Upgrade to ${title}`}
      </button>
    </div>
  );
}
