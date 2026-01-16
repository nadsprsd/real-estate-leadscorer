import { useState } from "react";

export default function Score() {
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();

    const payload = {
      budget: 800000,
      urgency: 15,
      views: 25,
      saves: 5,
      bedrooms: 3,
      preapproved: 1,
      open_house: 1,
      agent_response_hours: 2,
    };

    const res = await fetch("http://127.0.0.1:8000/leads/score", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + localStorage.getItem("token"),
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    setResult(data);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Score a Lead</h1>

      <button
        onClick={submit}
        className="bg-blue-600 text-white px-4 py-2 rounded"
      >
        Score Test Lead
      </button>

      {result && (
        <pre className="mt-4 bg-gray-100 p-4">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
