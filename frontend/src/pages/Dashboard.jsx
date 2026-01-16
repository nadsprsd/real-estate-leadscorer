import { useEffect, useState } from "react";
import { apiGet } from "../api";

export default function Dashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    apiGet("/leads/stats").then(setStats);
  }, []);

  if (!stats) return <div>Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>

      <div className="grid grid-cols-4 gap-4">
        <Card title="Total" value={stats.total} />
        <Card title="Hot" value={stats.hot} color="bg-red-500" />
        <Card title="Warm" value={stats.warm} color="bg-orange-500" />
        <Card title="Cold" value={stats.cold} color="bg-blue-500" />
      </div>
    </div>
  );
}

function Card({ title, value, color = "bg-gray-700" }) {
  return (
    <div className={`p-6 rounded text-white ${color}`}>
      <div className="text-sm">{title}</div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}
