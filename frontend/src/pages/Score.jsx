import { useState } from "react";

export default function ScoreLead() {
  const [form, setForm] = useState({
    budget: 800000,
    urgency: 15,
    views: 20,
    saves: 5,
    bedrooms: 3,
    preapproved: 1,
    open_house: 1,
    agent_response_hours: 2,
  });

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: Number(e.target.value) });
  }

  async function submit() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("http://127.0.0.1:8000/leads/score", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(form),
      });

      if (!res.ok) throw new Error("Scoring failed");

      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Score a Lead</h1>

      {/* Form */}
      <div className="grid grid-cols-2 gap-4 bg-white p-6 rounded shadow">
        {Object.keys(form).map((k) => (
          <div key={k}>
            <label className="text-sm text-gray-600">{k}</label>
            <input
              type="number"
              name={k}
              value={form[k]}
              onChange={handleChange}
              className="w-full border p-2 rounded"
            />
          </div>
        ))}

        <div className="col-span-2">
          <button
            onClick={submit}
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
          >
            {loading ? "Scoring..." : "Score Lead"}
          </button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className="bg-white p-6 rounded shadow border-l-8
          border-green-500">
          <div className="text-sm text-gray-500">Lead Score</div>
          <div className="text-5xl font-bold">{result.score}</div>

          <div className="mt-2">
            <span
              className={`px-3 py-1 rounded text-white font-semibold
              ${
                result.bucket === "HOT"
                  ? "bg-green-600"
                  : result.bucket === "WARM"
                  ? "bg-yellow-500"
                  : "bg-gray-500"
              }`}
            >
              {result.bucket}
            </span>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded h-3">
              <div
                className="h-3 rounded bg-blue-600"
                style={{ width: `${result.score}%` }}
              />
            </div>
            <div className="text-sm text-gray-500 mt-1">
              Score strength
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-100 text-red-700 p-3 rounded">
          {error}
        </div>
      )}
    </div>
  );
}
