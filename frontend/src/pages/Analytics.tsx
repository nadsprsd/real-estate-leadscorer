import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Users, Target, Download, ShieldCheck, Database } from 'lucide-react';
import { api } from "../lib/api";

const Analytics = () => {
  const [stats, setStats] = useState({ total: 0, hot: 0, sources: {}, qualityBySource: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const response = await api.get("/leads/history");
        // Pulling lead array from backend
        const leadList = Array.isArray(response.data) ? response.data : response.data?.data || [];
        
        const sourceMap: any = {};
        const qualityMap: any = {}; 
        let hotCount = 0;

        leadList.forEach((lead: any) => {
          // Default to 'Website' if source is missing
          const source = lead.source || 'Website'; 
          sourceMap[source] = (sourceMap[source] || 0) + 1;
          
          // Identify HOT Leads for accuracy calculation
          if (lead.bucket === 'HOT') {
            hotCount++;
            qualityMap[source] = (qualityMap[source] || 0) + 1;
          }
        });

        setStats({
          total: leadList.length,
          hot: hotCount,
          sources: sourceMap,
          qualityBySource: qualityMap
        });
        setLoading(false);
      } catch (err) {
        console.error("Analytics Sync Error:", err);
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  const topSource = Object.entries(stats.sources).reduce((a: any, b: any) => (a[1] > b[1] ? a : b), ["Website", 0])[0];

  if (loading) return <div className="p-10 text-slate-400 italic font-medium animate-pulse">Synchronizing performance metrics...</div>;

  return (
    <div className="min-h-screen bg-white text-slate-900 p-8 md:p-16">
      <header className="max-w-6xl mx-auto flex justify-between items-end mb-16 border-b border-slate-100 pb-10">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tighter italic mb-2">Analytics</h1>
          <p className="text-slate-500 text-sm italic">Supervisor View: Performance Synchronized.</p>
        </div>
        <button className="bg-black text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors" onClick={() => window.print()}>
          <Download size={14} className="inline mr-2"/> Export Report
        </button>
      </header>

      <main className="max-w-6xl mx-auto space-y-12">
        {/* KPI Grid - Usage & Accuracy */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard title="Total Ingested (Usage)" value={stats.total} limit={50} icon={<Users className="text-blue-600" />} />
          <StatCard title="Hot Leads" value={stats.hot} icon={<Target className="text-red-500" />} />
          <StatCard title="AI Accuracy" value={`${stats.total > 0 ? Math.round((stats.hot / stats.total) * 100) : 0}%`} icon={<TrendingUp className="text-green-500" />} />
        </div>

        {/* Visual Source Breakdown Chart */}
        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-slate-900 text-white p-12 rounded-[3rem] shadow-2xl relative overflow-hidden">
            <h3 className="text-xl font-bold italic mb-8 relative z-10">Source Quality Breakdown</h3>
            <div className="space-y-8 relative z-10">
              {Object.entries(stats.sources).length > 0 ? Object.entries(stats.sources).map(([name, count]: any) => {
                const hotForSource = stats.qualityBySource[name] || 0;
                const qualityPct = Math.round((hotForSource / count) * 100) || 0;
                return (
                  <div key={name} className="space-y-2">
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      <span>{name} ({count} Leads)</span>
                      <span className="text-blue-400">{qualityPct}% Quality Rate</span>
                    </div>
                    {/* The Chart Bar */}
                    <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-blue-500 h-full transition-all duration-1000 ease-out" 
                        style={{ width: `${qualityPct > 0 ? qualityPct : 5}%` }} 
                      />
                    </div>
                  </div>
                );
              }) : <p className="text-slate-500 italic text-sm">Waiting for lead source data...</p>}
            </div>
            <BarChart3 className="absolute -right-12 -bottom-12 opacity-[0.03]" size={300} />
          </div>

          {/* Supervisor Insight & AI Roadmap */}
          <div className="flex flex-col gap-6">
            <div className="bg-blue-600 text-white p-10 rounded-[2.5rem] flex flex-col justify-between shadow-xl h-full">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                   <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-bold uppercase border border-white/30 tracking-widest">Supervisor Insight</span>
                </div>
                <h3 className="text-2xl font-bold tracking-tight italic">{topSource} is your primary engine.</h3>
                <p className="text-blue-100 text-sm leading-relaxed opacity-90">
                  Version 1 lead data from {topSource} is being used to fine-tune our **Version 2 LLM**. 
                  Current trends suggest higher conversion probability from {topSource} traffic.
                </p>
              </div>
            </div>

            {/* Security & Privacy Content */}
            <div className="bg-slate-50 border border-slate-100 p-8 rounded-[2.5rem] flex items-start gap-5 shadow-sm">
              <div className="bg-white p-3 rounded-2xl shadow-sm">
                <ShieldCheck className="text-blue-600" size={24} />
              </div>
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">Security & Privacy</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed italic">
                  LeadRanker Version 1 uses anonymized ingestion to ensure privacy. 
                  By using this service, you contribute to training our **Version 2 LLM**, 
                  which will provide even higher lead scoring accuracy in the future. 
                  Data is never sold to third parties.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

const StatCard = ({ title, value, limit, icon }: any) => (
  <div className="bg-slate-50 border border-slate-100 p-8 rounded-[2.5rem] space-y-3 shadow-sm">
    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{title}</span>
    <div className="flex items-center justify-between">
      <span className="text-4xl font-bold">{value}{limit ? ` / ${limit}` : ''}</span>
      <div className="bg-white p-3 rounded-2xl shadow-xs">{icon}</div>
    </div>
  </div>
);

export default Analytics;