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

interface UsageData {
  plan: string;
  subscription_status: string;
  ls_customer_id: string | null;
  ls_subscription_id: string | null;
  leads_used: number;
  leads_limit: number;
  percent_used: number;
  upgrade_options: UpgradeOption[];
}

interface UpgradeOption {
  plan: string;
  label: string;
  amount: string;
  limit: number;
  checkout_url: string;
}

interface Referral {
  referee_email: string;
  status: string;
  qualified_at: string | null;
  created_at: string | null;
}

interface ReferralData {
  referrals: Referral[];
  total_credits: number;
  qualified_count: number;
  pending_count: number;
  credit_per_referral: number;
  qualify_days: number;
}

type ToastType = "success" | "error" | "warning";

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

export default function Billing() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const fetchedForToken = useRef<string | null>(null);

  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeLoader, setActiveLoader] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: ToastType; message: string } | null>(null);
  const [referralData, setReferralData] = useState<ReferralData | null>(null);
  const [referralEmail, setReferralEmail] = useState("");
  const [referralLoading, setReferralLoading] = useState(false);
  const [showReferrals, setShowReferrals] = useState(false);
  const [showReferralInfo, setShowReferralInfo] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [showUpcoming, setShowUpcoming] = useState(false);

  const showToast = useCallback((type: ToastType, message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 7000);
  }, []);

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/v1/billing/status");
      setUsage(res);
    } catch (err: any) {
      showToast("error", err?.message || "Failed to load billing info");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const fetchReferrals = useCallback(async () => {
    try {
      const res = await api.get("/api/v1/billing/referrals");
      setReferralData(res);
    } catch (err: any) {
      console.warn("Referrals fetch failed:", err?.message);
    }
  }, []);

  useEffect(() => {
    if (!token) { navigate("/login"); return; }
    if (fetchedForToken.current === token) return;
    fetchedForToken.current = token;
    setUsage(null);
    setReferralData(null);

    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const canceled = params.get("canceled");
    window.history.replaceState({}, "", "/billing");

    if (success === "true") {
      showToast("success", "🎉 Payment successful! Your plan is now active.");
    } else if (canceled === "true") {
      showToast("warning", "Payment canceled. No charges made.");
    }

    fetchUsage();
    fetchReferrals();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpgrade = async (plan: string) => {
  if (activeLoader) return;
  setActiveLoader(plan);
  try {
    // Create Razorpay order
    const res = await api.post("/api/v1/billing/checkout", {
      plan,
      payment_method: "razorpay"
    });

    if (res.method === "razorpay") {
      // Load Razorpay script dynamically
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      document.body.appendChild(script);

      script.onload = () => {
        const options = {
          key:         res.key_id,
          amount:      res.amount,
          currency:    "INR",
          name:        "LeadRankerAI",
          description: `${res.plan_label} Plan — ${res.amount_display}`,
          order_id:    res.order_id,
          prefill: {
            email: res.email,
          },
          theme: { color: "#0ea5e9" },
          handler: async (response: any) => {
            try {
              // Verify payment on backend
              const verify = await api.post("/api/v1/billing/verify-payment", {
                razorpay_order_id:   response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature:  response.razorpay_signature,
                plan:                plan,
                brokerage_id:        res.brokerage_id,
              });
              showToast("success", `🎉 ${verify.message}`);
              await fetchUsage();
              setTimeout(() => navigate("/dashboard"), 2000);
            } catch (err: any) {
              showToast("error", "Payment verification failed. Contact support.");
            }
          },
          modal: {
            ondismiss: () => {
              showToast("warning", "Payment cancelled.");
              setActiveLoader(null);
            }
          }
        };
        const rzp = new (window as any).Razorpay(options);
        rzp.open();
        setActiveLoader(null);
      };

    } else {
      // International — redirect to Lemon Squeezy
      window.location.href = res.checkout_url;
    }

  } catch (err: any) {
    showToast("error", `❌ ${err?.message || "Checkout failed"}`);
    setActiveLoader(null);
  }
};

  const handleReferralSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referralEmail.trim()) return;
    setReferralLoading(true);
    try {
      await api.post("/api/v1/billing/referrals", { referrer_email: referralEmail.trim() });
      showToast("success", `✅ Invite sent to ${referralEmail}!`);
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
  const leadsUsed = usage?.leads_used ?? 0;
  const leadsLimit = usage?.leads_limit ?? 50;
  const percentUsed = usage?.percent_used ?? 0;
  const leadsRemaining = Math.max(0, leadsLimit - leadsUsed);
  const isBlocked = leadsUsed >= leadsLimit;

  return (
    <div className="min-h-screen bg-slate-50 p-5 md:p-10">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Toast */}
        {toast && (
          <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-4
            rounded-2xl shadow-2xl text-white text-sm font-semibold max-w-sm
            ${toast.type === "success" ? "bg-green-600"
              : toast.type === "error" ? "bg-red-600" : "bg-amber-500"}`}>
            {toast.type === "success" && <CheckCircle size={18} />}
            {toast.type === "error" && <XCircle size={18} />}
            {toast.type === "warning" && <AlertTriangle size={18} />}
            <span>{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-auto opacity-70 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Header */}
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

        {/* Current Plan Banner */}
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
                : usage.subscription_status === "cancelled" ? "bg-slate-200 text-slate-600"
                : "bg-slate-200 text-slate-500"}`}>
                {usage.subscription_status === "active" ? "✓ Active"
                  : usage.subscription_status === "past_due" ? "⚠ Past Due"
                  : usage.subscription_status === "cancelled" ? "✗ Cancelled"
                  : "Free Trial"}
              </span>
            </div>
          </div>
        )}

        {/* Usage Card */}
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
                  { value: leadsUsed, label: "Used This Month" },
                  { value: leadsRemaining, label: "Remaining" },
                  { value: leadsLimit, label: "Monthly Limit" },
                ].map(({ value, label }) => (
                  <div key={label} className="bg-slate-50 rounded-2xl p-5 text-center">
                    <p className="text-3xl font-black text-slate-900">{value.toLocaleString()}</p>
                    <p className="text-xs text-slate-500 font-medium mt-1">{label}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-500 font-medium">
                  <span>{percentUsed}% used</span>
                  <span>{leadsUsed.toLocaleString()} / {leadsLimit.toLocaleString()} leads</span>
                </div>
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-1000 ${getProgressColor(percentUsed)}`}
                    style={{ width: `${Math.min(percentUsed, 100)}%` }} />
                </div>
              </div>
              {isBlocked && (
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

        {/* Referral Section */}
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
            {referralData && referralData.total_credits > 0 && (
              <div className="bg-white/20 rounded-2xl px-4 py-3 text-center flex-shrink-0">
                <p className="text-2xl font-black">${referralData.total_credits}</p>
                <p className="text-blue-200 text-xs">earned</p>
              </div>
            )}
          </div>

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

          <button onClick={() => setShowReferralInfo(!showReferralInfo)}
            className="flex items-center gap-2 text-sm text-blue-100 hover:text-white transition-colors">
            <Info size={16} />
            How does this work?
            {showReferralInfo ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showReferralInfo && (
            <div className="bg-white/10 rounded-2xl p-4 space-y-2 border border-white/20 text-sm text-blue-100">
              <p><span className="font-bold text-white">Day 0:</span> You submit their email address</p>
              <p><span className="font-bold text-white">Day 1:</span> They sign up and pay for Starter or Team</p>
              <p><span className="font-bold text-white">Days 2–30:</span> We track their subscription</p>
              <p><span className="font-bold text-white">Day 31+:</span> $5 credit added to your account</p>
            </div>
          )}

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

          {referralData && referralData.referrals.length > 0 && (
            <button onClick={() => setShowReferrals(!showReferrals)}
              className="flex items-center gap-2 text-sm text-blue-100 font-medium hover:text-white transition-colors">
              <Users size={16} />
              Your Referrals ({referralData.referrals.length})
              {showReferrals ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}

          {showReferrals && referralData && referralData.referrals.length > 0 && (
            <div className="space-y-2">
              {referralData.referrals.map((r, i) => (
                <div key={i} className="bg-white/10 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      r.status === "qualified" ? "bg-green-400"
                      : r.status === "pending" ? "bg-blue-300" : "bg-red-400"}`} />
                    <span className="text-white font-medium text-sm">{r.referee_email}</span>
                  </div>
                  <span className="text-xs text-blue-200 capitalize">{r.status}</span>
                </div>
              ))}
              <div className="flex justify-between text-xs text-blue-200 pt-2 border-t border-white/10">
                <span>{referralData.qualified_count} qualified · {referralData.pending_count} pending</span>
                <span>Total earned: ${referralData.total_credits}</span>
              </div>
            </div>
          )}
        </section>

        {/* Plan Cards — show upgrade options from API */}
        {usage && (
  <div className="grid md:grid-cols-2 gap-5">
    {/* Show current plan card if on starter */}
    {usage.plan === "starter" && (
      <PlanCard
        plan="starter" title="Starter" price="$19" period="month"
        tagline="Perfect for solo agents" limit="1,000 leads/mo"
        features={["1,000 AI lead scores/month","HOT/WARM/COLD scoring","WordPress plugin","Magic email inbound","Referral program"]}
        highlighted={false} active={true}
        loading={false}
        onUpgrade={() => handleUpgrade("starter")}
      />
    )}
    {/* Show upgrade options */}
    {usage.upgrade_options?.map((option) => (
      <PlanCard
        key={option.plan}
        plan={option.plan}
        title={option.label}
        price={option.amount.split("/")[0]}
        period="month"
        tagline={option.plan === "starter" ? "Perfect for solo agents" : "For growing brokerages"}
        limit={`${option.limit.toLocaleString()} leads/mo`}
        features={option.plan === "starter"
          ? ["1,000 AI lead scores/month","HOT/WARM/COLD scoring","WordPress plugin","Magic email inbound","Referral program"]
          : ["5,000 AI lead scores/month","Everything in Starter","Priority processing","Advanced analytics","Priority support"]
        }
        highlighted={option.plan === "team"}
        active={usage.plan === option.plan}
        loading={activeLoader === option.plan}
        onUpgrade={() => handleUpgrade(option.plan)}
      />
    ))}
  </div>
)}

        {isPaid && (
          <div className="text-center">
            <button onClick={() => navigate("/dashboard")}
              className="inline-flex items-center gap-2 bg-slate-900 text-white px-8 py-4
                rounded-2xl font-bold hover:bg-slate-700 transition-all">
              Go to Dashboard <ArrowRight size={18} />
            </button>
          </div>
        )}

        {/* Security Section */}
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
                  { icon: <Lock size={16} className="text-green-600" />, title: "Payments via Lemon Squeezy", desc: "We never store card details. All payments processed securely by Lemon Squeezy." },
                  { icon: <Shield size={16} className="text-blue-600" />, title: "End-to-end encryption", desc: "TLS 1.3 in transit. Data encrypted at rest. Only you can access your data." },
                  { icon: <Bell size={16} className="text-purple-600" />, title: "Proactive usage alerts", desc: "You'll be notified when approaching your monthly limit." },
                  { icon: <BadgeCheck size={16} className="text-amber-600" />, title: "Your data is yours", desc: "We never sell, share, or use your lead data for advertising." },
                  { icon: <Users size={16} className="text-rose-600" />, title: "JWT authentication", desc: "Sessions expire automatically for your security." },
                  { icon: <Star size={16} className="text-indigo-600" />, title: "Cancel anytime", desc: "No cancellation fees. Your plan stays active until end of billing period." },
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

        {/* Roadmap */}
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
              {[
                { icon: <Smartphone size={18} className="text-blue-600" />, bg: "bg-blue-50", border: "border-blue-100", badge: "Q3 2026", badgeColor: "bg-blue-100 text-blue-700", title: "Mobile App — iOS & Android", desc: "Score leads on the go. Push notifications for HOT leads." },
                { icon: <Brain size={18} className="text-purple-600" />, bg: "bg-purple-50", border: "border-purple-100", badge: "Q3 2026", badgeColor: "bg-purple-100 text-purple-700", title: "ML Model Fine-Tuning", desc: "Scores get smarter every month as we collect real conversion data." },
                { icon: <MessageSquare size={18} className="text-green-600" />, bg: "bg-green-50", border: "border-green-100", badge: "Q2 2026", badgeColor: "bg-green-100 text-green-700", title: "WhatsApp Lead Alerts", desc: "Instant HOT lead notifications on WhatsApp." },
                { icon: <BarChart3 size={18} className="text-amber-600" />, bg: "bg-amber-50", border: "border-amber-100", badge: "Q3 2026", badgeColor: "bg-amber-100 text-amber-700", title: "Advanced Analytics", desc: "Conversion rates, source performance, agent leaderboards." },
              ].map(({ icon, bg, border, badge, badgeColor, title, desc }) => (
                <div key={title} className={`flex gap-4 p-4 ${bg} rounded-2xl border ${border}`}>
                  <div className={`w-10 h-10 bg-white rounded-xl flex items-center justify-center flex-shrink-0 border ${border}`}>
                    {icon}
                  </div>
                  <div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${badgeColor}`}>{badge}</span>
                    <p className="font-semibold text-sm text-slate-800 mt-1">{title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}

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
      highlighted ? "bg-slate-900 border-slate-700 text-white shadow-2xl"
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
          text-xs font-bold px-4 py-1 rounded-full">Most Popular</div>
      )}
      <div>
        <div className="flex items-center gap-2 mb-2">
          {highlighted ? <Crown size={18} className="text-yellow-400" /> : <Zap size={18} className="text-blue-500" />}
          <span className={`text-sm font-bold uppercase tracking-widest ${highlighted ? "text-slate-400" : "text-slate-500"}`}>{title}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-black">{price}</span>
          <span className={`text-sm ${highlighted ? "text-slate-400" : "text-slate-500"}`}>/{period}</span>
        </div>
        <p className={`text-xs mt-1 ${highlighted ? "text-slate-400" : "text-slate-500"}`}>{tagline} · {limit}</p>
      </div>
      <ul className="space-y-2.5 flex-1">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <CheckCircle size={15} className={`mt-0.5 flex-shrink-0 ${highlighted ? "text-blue-400" : "text-blue-500"}`} />
            <span className={highlighted ? "text-slate-300" : "text-slate-600"}>{f}</span>
          </li>
        ))}
      </ul>
      <button onClick={onUpgrade} disabled={active || loading}
        className={`w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center
          gap-2 transition-all ${
            active ? "bg-green-600 text-white cursor-default"
            : highlighted ? "bg-white text-slate-900 hover:bg-slate-100 disabled:opacity-60"
            : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
          }`}>
        {loading ? <><Loader2 size={16} className="animate-spin" /> Redirecting...</>
          : active ? <><CheckCircle size={16} /> Your Plan</>
          : `Upgrade to ${title}`}
      </button>
    </div>
  );
}