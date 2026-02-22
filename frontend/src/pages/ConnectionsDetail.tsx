import React, { useState, useEffect } from 'react';
import { 
  Copy, Zap, Globe, Mail, CheckCircle, UserPlus, 
  ChevronRight, MessageSquare, Code, ShieldCheck, Facebook, Terminal, X, Lock
} from 'lucide-react';

const ConnectionsDetail = () => {
  const [selected, setSelected] = useState('Facebook Ads');
  const [showDocs, setShowDocs] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [connectionData, setConnectionData] = useState({ email_forwarding: '', webhook_url: '' });
  const [copied, setCopied] = useState(false);
  const [devEmail, setDevEmail] = useState('');

  // 1. FETCH DATA (Security: No Hardcoding)
  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('access_token') || localStorage.getItem('token'); 
        const headers = { 'Authorization': `Bearer ${token}` };
        
        const resConn = await fetch('http://localhost:8000/settings/connections', { headers });
        const dataConn = await resConn.json();
        if (dataConn.email_forwarding) setConnectionData(dataConn);

        const resLeads = await fetch('http://localhost:8000/api/v1/leads/history', { headers });
        const leadsData = await resLeads.json();
        const leads = Array.isArray(leadsData) ? leadsData : leadsData.data;
        if (leads && leads.length > 0) setIsVerified(true);
      } catch (err) {
        console.error("Fetch error:", err);
      }
    };
    fetchData();
  }, []);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Logic to actually send the invite email
  const handleSendInvite = async () => {
    if (!devEmail) return;
    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      const res = await fetch('http://localhost:8000/api/v1/invite-partner', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ email: devEmail })
      });
      if (res.ok) {
        alert("Invitation sent to developer!");
        setShowInviteModal(false);
        setDevEmail('');
      }
    } catch (err) {
      alert("Failed to send invite. Check backend connection.");
    }
  };

  const guides = {
    'Facebook Ads': ["Go to Meta Business Suite Settings.", "Select 'Lead Methods' or Email Notifications.", "Paste your Magic Link into the destination field."],
    'WordPress': ["Open your WordPress Form Plugin (Metform/Elementor).", "Navigate to 'Actions After Submit' or 'Notifications'.", "Add Magic Link to the Recipient/To field."],
    'Google Ads': ["In Lead Form Extension settings, find 'Email Delivery'.", "Paste your Magic Link address.", "Submit a test form to verify."],
    'Custom CRM': ["Copy the Webhook URL provided below.", "Configure your CRM to send a POST request with lead data.", "Ensure the payload is JSON formatted."]
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-slate-900 font-sans">
      <main className="max-w-5xl mx-auto p-8 md:p-16 space-y-12">
        
        {/* Status indicator at the top right */}
        <div className="flex justify-end items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isVerified ? 'bg-green-500' : 'bg-amber-400 animate-pulse'}`}></div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {isVerified ? 'Status: Active' : 'Status: Waiting for Test'}
          </span>
        </div>

        {/* Blue Magic Link Card */}
        <div className="bg-gradient-to-br from-blue-500 to-indigo-700 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden">
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="space-y-4">
              <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-bold uppercase border border-white/30 tracking-widest">Auto-Ingest</span>
              <h2 className="text-4xl font-extrabold tracking-tight italic">Your Personal Magic Link</h2>
              <p className="text-blue-100 max-w-sm text-sm opacity-90 leading-relaxed">Any email sent here is automatically read by AI and scored instantly.</p>
            </div>
            <div className="bg-white/10 backdrop-blur-xl p-6 rounded-3xl border border-white/20 flex gap-4 items-center">
              <code className="text-sm font-mono">{connectionData.email_forwarding || "fetching_id..."}</code>
              <button onClick={() => handleCopy(connectionData.email_forwarding)} className="p-2 hover:bg-white/20 rounded-lg transition-all">
                {copied ? <CheckCircle size={20} className="text-green-400" /> : <Copy size={20} />}
              </button>
            </div>
          </div>
        </div>

        {/* Platform Gallery */}
        <section className="space-y-6">
          <div className="flex justify-between items-end">
             <h3 className="text-2xl font-bold">Connection Gallery</h3>
             <button onClick={() => setShowInviteModal(true)} className="text-blue-600 text-sm font-bold flex items-center gap-2 hover:underline">
                <UserPlus size={16}/> Invite Tech Partner
             </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: 'Facebook Ads', icon: <Facebook size={20}/> },
              { name: 'WordPress', icon: <Globe size={20}/> },
              { name: 'Google Ads', icon: <Mail size={20}/> },
              { name: 'Custom CRM', icon: <Code size={20}/> }
            ].map((p) => (
              <button key={p.name} onClick={() => setSelected(p.name)} className={`p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-3 ${selected === p.name ? 'border-blue-600 bg-white shadow-lg scale-105' : 'border-transparent bg-white shadow-sm opacity-60 hover:opacity-100'}`}>
                <div className="p-3 bg-slate-50 rounded-xl text-blue-600">{p.icon}</div>
                <span className="font-bold text-[10px] uppercase tracking-tighter text-center">{p.name}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Dynamic Setup Guide Section */}
        <section className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-8 animate-in fade-in duration-500">
            <h3 className="text-xl font-bold flex items-center gap-2">Setup Guide: {selected} <ChevronRight size={20} className="text-slate-300"/></h3>
            <div className="space-y-6">
                {guides[selected].map((step, i) => (
                    <div key={i} className="flex gap-4 items-start">
                        <span className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">{i+1}</span>
                        <p className="text-sm text-slate-600 pt-0.5">{step}</p>
                    </div>
                ))}
            </div>
            {selected === 'Custom CRM' && (
                <div className="mt-6 p-5 bg-slate-50 rounded-2xl border border-slate-200 animate-in slide-in-from-bottom-2">
                    <span className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-2 mb-2"><Terminal size={12}/> Webhook URL</span>
                    <code className="text-xs text-blue-600 break-all">{connectionData.webhook_url}</code>
                </div>
            )}
        </section>

        {/* CC Logic & Security/Legal Section */}
        <div className="grid md:grid-cols-2 gap-8 pb-10">
          <div className="bg-slate-500 text-white p-10 rounded-[2.5rem] relative overflow-hidden shadow-xl">
             <h3 className="text-xl font-bold italic mb-4 text-orange-500">The "CC" Forwarding Logic</h3>
             <p className="text-slate-400 text-sm mb-8 leading-relaxed italic">No site access? Use Gmail filters to "whisper" leads to LeadRanker.</p>
             <button onClick={() => setShowDocs(!showDocs)} className="flex items-center gap-2 text-xs font-bold border-b border-white/20 pb-1">
               {showDocs ? "Close Tutorial" : "Learn How Setup Forwarding"} <ChevronRight size={14} className={showDocs ? 'rotate-90' : ''}/>
             </button>
             {showDocs && (
               <div className="mt-8 space-y-3 text-xs text-slate-400">
                 <p>01. Open Gmail Settings → Filters.</p>
                 <p>02. Create filter for "New Lead".</p>
                 <p>03. Forward to: <span className="text-white font-mono">{connectionData.email_forwarding}</span></p>
               </div>
             )}
          </div>

          <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-4">
             <div className="flex items-center gap-2 text-blue-600">
                <Lock size={16} />
                <h4 className="font-bold uppercase text-[10px] tracking-widest">Security & Training Roadmap</h4>
             </div>
             <p className="text-[11px] text-slate-500 leading-relaxed">
                LeadRanker Version 1 uses anonymized ingestion to ensure privacy. 
                By using this service, you contribute to training our **Version 2 LLM**, 
                which will provide even higher lead scoring accuracy in the future. 
                Data is never sold to third parties.
             </p>
          </div>
        </div>
      </main>

      {/* Invite Tech Partner Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md p-10 shadow-2xl relative">
            <button onClick={() => setShowInviteModal(false)} className="absolute top-6 right-6 text-slate-400 hover:text-black">
              <X size={24} />
            </button>
            <h3 className="text-2xl font-bold mb-2">Invite Developer</h3>
            <p className="text-slate-500 text-sm mb-8">Send your Webhook URL and API docs to your developer.</p>
            <div className="space-y-4">
              <input 
                type="email" 
                value={devEmail}
                onChange={(e) => setDevEmail(e.target.value)}
                placeholder="developer@agency.com" 
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-600 transition-all" 
              />
              <button onClick={handleSendInvite} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all">
                Send Invitation Email
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConnectionsDetail;