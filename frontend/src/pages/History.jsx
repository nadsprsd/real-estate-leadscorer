import { useEffect, useState } from "react";
import { apiGet } from "../api";

export default function History() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet("/leads/history")
      .then(data => {
        setRows(data.data);
        setLoading(false);
      })
      .catch(err => {
        alert("Failed to load history");
        console.error(err);
      });
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Lead History</h1>

      <table className="w-full border">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 border">Date</th>
            <th className="p-2 border">Score</th>
            <th className="p-2 border">Bucket</th>
            <th className="p-2 border">Budget</th>
            <th className="p-2 border">Urgency</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td className="p-2 border">{new Date(r.created_at).toLocaleString()}</td>
              <td className="p-2 border">{r.score}</td>
              <td className="p-2 border">{r.bucket}</td>
              <td className="p-2 border">{r.input.budget}</td>
              <td className="p-2 border">{r.input.urgency}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
