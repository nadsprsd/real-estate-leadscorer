import { useEffect, useState } from "react";
import { apiGet } from "../api";

export default function History() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState("ALL");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);

      const res = await apiGet("/leads/history?limit=50");

      setData(res.data || []);
    } catch (e) {
      console.error(e);
      alert("Failed to load history");
    } finally {
      setLoading(false);
    }
  }

  const filtered = data.filter((l) => {
    if (filter === "ALL") return true;
    return l.bucket === filter;
  });

  if (loading) {
    return <div className="p-6">Loading history...</div>;
  }

  return (
    <div className="space-y-6">

      <h1 className="text-2xl font-bold">Lead History</h1>

      {/* Filters */}
      <div className="space-x-3">
        {["ALL", "HOT", "WARM", "COLD"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded ${
              filter === f
                ? "bg-blue-600 text-white"
                : "bg-gray-200"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded shadow overflow-x-auto">

        <table className="w-full text-sm">

          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 text-left">Score</th>
              <th className="p-3 text-left">Bucket</th>
              <th className="p-3 text-left">Date</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((l) => (
              <tr key={l.id} className="border-t">

                <td className="p-3 font-medium">{l.score}</td>

                <td className="p-3">
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      l.bucket === "HOT"
                        ? "bg-red-100 text-red-700"
                        : l.bucket === "WARM"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {l.bucket}
                  </span>
                </td>

                <td className="p-3">
                  {new Date(l.created_at).toLocaleString()}
                </td>

              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan="3" className="p-6 text-center text-gray-500">
                  No leads yet
                </td>
              </tr>
            )}

          </tbody>

        </table>

      </div>

    </div>
  );
}
