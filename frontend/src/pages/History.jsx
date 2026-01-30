import { useEffect, useState } from "react";

const PAGE_SIZE = 10;

export default function History() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("ALL");

  const token = localStorage.getItem("token");

  useEffect(() => {
    setLoading(true);

    fetch(
      `http://127.0.0.1:8000/leads/history?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )
      .then((r) => r.json())
      .then((res) => {
        setData(res.data || []);
        setTotal(res.total || 0);
      })
      .finally(() => setLoading(false));
  }, [page]);

  const filtered =
    filter === "ALL"
      ? data
      : data.filter((l) => l.bucket === filter);

  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Lead History</h1>

        <select
          className="border rounded px-3 py-1"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="ALL">All</option>
          <option value="HOT">HOT</option>
          <option value="WARM">WARM</option>
          <option value="COLD">COLD</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="p-3">Score</th>
              <th className="p-3">Bucket</th>
              <th className="p-3">Date</th>
              <th className="p-3">User</th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan="4" className="p-6 text-center text-gray-500">
                  Loading history…
                </td>
              </tr>
            )}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan="4" className="p-6 text-center text-gray-400">
                  No leads found
                </td>
              </tr>
            )}

            {!loading &&
              filtered.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="p-3 font-semibold">{l.score}</td>

                  <td className="p-3">
                    <BucketBadge value={l.bucket} />
                  </td>

                  <td className="p-3">
                    {new Date(l.created_at).toLocaleString()}
                  </td>

                  <td className="p-3 text-gray-500">{l.user}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex justify-end gap-2">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1 border rounded disabled:opacity-40"
          >
            Prev
          </button>

          <span className="px-3 py-1 text-sm">
            Page {page + 1} of {pages}
          </span>

          <button
            disabled={page + 1 >= pages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 border rounded disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- Small Reusable Badge ---------- */

function BucketBadge({ value }) {
  const styles = {
    HOT: "bg-green-100 text-green-700",
    WARM: "bg-yellow-100 text-yellow-700",
    COLD: "bg-gray-200 text-gray-700",
  };

  return (
    <span
      className={`px-2 py-1 rounded text-xs font-semibold ${styles[value]}`}
    >
      {value}
    </span>
  );
}
