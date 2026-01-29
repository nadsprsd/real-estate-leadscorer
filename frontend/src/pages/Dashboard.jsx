import { useEffect, useState } from "react";

const API = "http://127.0.0.1:8000";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [usage, setUsage] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);

  const token = localStorage.getItem("token");

  useEffect(() => {
    if (!token) {
      setError("Not logged in");
      return;
    }

    const headers = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    // ---- Load Stats ----
    fetch(`${API}/leads/stats`, { headers })
      .then(r => {
        if (!r.ok) throw new Error("Failed to load stats");
        return r.json();
      })
      .then(setStats)
      .catch(err => setError(err.message));

    // ---- Load Usage ----
    fetch(`${API}/billing/usage`, { headers })
      .then(r => {
        if (!r.ok) throw new Error("Failed to load usage");
        return r.json();
      })
      .then(setUsage)
      .catch(err => setError(err.message));

    // ---- Load History ----
    fetch(`${API}/leads/history?limit=5`, { headers })
      .then(r => {
        if (!r.ok) throw new Error("Failed to load history");
        return r.json();
      })
      .then(d => setHistory(d.data || []))
      .catch(err => setError(err.message));

  }, [token]);

  if (error) {
    return <div className="text-red-600 p-6">❌ {error}</div>;
  }

  if (!stats || !usage) {
    return <div className="p-6">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-6">

      {/* ---- Warning Banner ---- */}
      {usage.warning && (
        <div className="bg-yellow-100 border border-yellow-300 p-4 rounded">
          ⚠️ {usage.warning}
        </div>
      )}

      {/* ---- Stats Cards ---- */}
      <div className="grid grid-cols-4 gap-4">
        <Stat title="Total Leads" value={stats.total} />
        <Stat title="Hot Leads" value={stats.hot} />
        <Stat title="Warm Leads" value={stats.warm} />
        <Stat title="Cold Leads" value={stats.cold} />
      </div>

      {/* ---- Usage Bar ---- */}
      <div className="bg-white p-4 rounded shadow">
        <div className="font-semibold mb-2">Monthly Usage</div>
        <div className="w-full bg-gray-200 rounded h-4 overflow-hidden">
          <div
            className="bg-blue-600 h-4"
            style={{ width: `${usage.percent_used}%` }}
          />
        </div>
        <div className="text-sm mt-2">
          {usage.used} / {usage.limit} used ({usage.percent_used}%)
        </div>
      </div>

      {/* ---- Recent Leads ---- */}
      <div className="bg-white rounded shadow">
        <div className="p-4 font-semibold">Recent Leads</div>

        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Score</th>
              <th className="p-2 text-left">Bucket</th>
              <th className="p-2 text-left">Date</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 && (
              <tr>
                <td colSpan="3" className="p-4 text-center text-gray-400">
                  No leads yet
                </td>
              </tr>
            )}

            {history.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="p-2">{l.score}</td>
                <td className="p-2 font-semibold">{l.bucket}</td>
                <td className="p-2">
                  {new Date(l.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}

function Stat({ title, value }) {
  return (
    <div className="bg-white p-4 rounded shadow">
      <div className="text-gray-500 text-sm">{title}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
