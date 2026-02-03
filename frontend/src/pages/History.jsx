import { useEffect, useState } from "react";
import { apiGet } from "../api";

export default function History() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");

  useEffect(() => {
    fetchHistory();
  }, []);

  async function fetchHistory() {
    try {
      setLoading(true);

      const res = await apiGet("/leads/history?limit=50&offset=0");

      setLeads(res.data || []);
    } catch (err) {
      console.error(err);
      alert("Failed to load history");
    } finally {
      setLoading(false);
    }
  }

  // Filter in frontend
  const filteredLeads = leads.filter((l) => {
    if (filter === "ALL") return true;
    return l.bucket === filter;
  });

  function getAction(score) {
    if (score >= 85) return "📞 Call Now";
    if (score >= 60) return "✉️ Follow Up";
    return "🕒 Nurture";
  }

  if (loading) {
    return <div className="p-6">Loading history...</div>;
  }

  return (
    <div className="space-y-6 p-6">

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
                : "bg-gray-200 hover:bg-gray-300"
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
              <th className="p-3 text-left">Lead</th>
              <th className="p-3 text-left">Score</th>
              <th className="p-3 text-left">Bucket</th>
              <th className="p-3 text-left">Action</th>
              <th className="p-3 text-left">Date</th>
            </tr>
          </thead>

          <tbody>

            {filteredLeads.map((l) => (
              <tr key={l.id} className="border-t">

                {/* Lead Message */}
                <td className="p-3 max-w-sm truncate">
                  {l.lead || "—"}
                </td>

                {/* Score */}
                <td className="p-3 font-medium">
                  {l.score}
                </td>

                {/* Bucket */}
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

                {/* Action */}
                <td className="p-3 font-medium text-blue-700">
                  {getAction(l.score)}
                </td>

                {/* Date */}
                <td className="p-3 text-gray-600">
                  {new Date(l.created_at).toLocaleString()}
                </td>

              </tr>
            ))}

            {filteredLeads.length === 0 && (
              <tr>
                <td
                  colSpan="5"
                  className="p-6 text-center text-gray-500"
                >
                  No leads found
                </td>
              </tr>
            )}

          </tbody>

        </table>

      </div>

    </div>
  );
}
