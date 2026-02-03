import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";

const COLORS = ["#2563eb", "#16a34a", "#dc2626"];

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [usage, setUsage] = useState([]);
  const [scores, setScores] = useState([]);
  const [buckets, setBuckets] = useState({});
  const [billing, setBilling] = useState(null);

  const token = localStorage.getItem("token");
  const email = localStorage.getItem("user_email");

  const headers = {
    Authorization: `Bearer ${token}`,
  };

  useEffect(() => {
    fetch("http://127.0.0.1:8000/leads/stats", { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats);

    fetch("http://127.0.0.1:8000/analytics/usage", { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then(setUsage);

    fetch("http://127.0.0.1:8000/analytics/scores", { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then(setScores);

    fetch("http://127.0.0.1:8000/analytics/buckets", { headers })
      .then((r) => (r.ok ? r.json() : {}))
      .then(setBuckets);

    fetch("http://127.0.0.1:8000/billing/usage", { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then(setBilling);
  }, []);

  if (!stats || !billing) {
    return <div className="p-8">Loading...</div>;
  }

  const safeUsage = Array.isArray(usage) ? usage : [];
  const safeScores = Array.isArray(scores) ? scores : [];

  const pieData = Object.keys(buckets || {}).map((k) => ({
    name: k,
    value: buckets[k],
  }));

  return (
    <div className="space-y-6">

      {/* Profile */}
      <div className="flex justify-between items-center bg-white p-4 rounded shadow">
        <div>
          <div className="text-lg font-bold">Dashboard</div>
          <div className="text-sm text-gray-500">{email}</div>
        </div>

        <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center">
          {email?.[0]?.toUpperCase()}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Stat title="Total Leads" value={stats.total} />
        <Stat title="Hot" value={stats.hot} />
        <Stat title="Warm" value={stats.warm} />
        <Stat title="Cold" value={stats.cold} />
      </div>

      {/* Billing */}
      <div className="bg-white p-4 rounded shadow">
        <div className="font-semibold mb-2">Monthly Usage</div>

        <div className="w-full bg-gray-200 rounded h-4">
          <div
            className="bg-blue-600 h-4 rounded"
            style={{ width: `${billing.percent}%` }}
          />
        </div>

        <div className="text-sm mt-2">
          {billing.usage} / {billing.limit} used ({billing.plan})
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6">

        {/* Usage */}
        <div className="bg-white p-4 rounded shadow" style={{ height: 320 }}>
          <div className="font-semibold mb-2">Daily Usage</div>

          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={safeUsage}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#2563eb"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Score */}
        <div className="bg-white p-4 rounded shadow" style={{ height: 320 }}>
          <div className="font-semibold mb-2">Avg Score Trend</div>

          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={safeScores}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="avg"
                stroke="#16a34a"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

      </div>

      {/* Buckets */}
      <div className="bg-white p-4 rounded shadow" style={{ height: 320 }}>
        <div className="font-semibold mb-2">Lead Quality</div>

        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={100}
              label
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
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
