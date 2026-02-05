import { useState } from "react";
import { apiPost } from "../api";

export default function Score() {

  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();

    setLoading(true);
    setResult(null);

    try {

      const res = await apiPost("/leads/score", {
        message,
        source: "manual",
      });

      setResult(res);

    } catch {
      alert("Scoring failed");
    }

    setLoading(false);
  }

  return (
    <div className="max-w-xl space-y-6">

      <h1 className="text-2xl font-bold">
        Score Lead
      </h1>

      <form onSubmit={submit} className="space-y-4">

        <textarea
          className="w-full border p-3 rounded"
          rows="5"
          placeholder="Paste lead message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
        />

        <button
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          {loading ? "Analyzing..." : "Analyze"}
        </button>

      </form>


      {result && (

        <div className="bg-white p-4 rounded shadow space-y-2">

          <div>
            <b>Score:</b> {result.score}
          </div>

          <div>
            <b>Bucket:</b> {result.bucket}
          </div>

          <div>
            <b>Sentiment:</b> {result.sentiment}
          </div>

          <div>
            <b>Recommendation:</b><br />
            {result.ai_recommendation}
          </div>

        </div>

      )}

    </div>
  );
}
