import { useEffect, useState } from "react";
import { apiGet } from "./api";

export default function TestApi() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiGet("/leads/stats")
      .then((res) => {
        console.log("API OK:", res);
        setData(res);
      })
      .catch((err) => {
        console.error("API ERROR:", err);
        setError(err.message);
      });
  }, []);

  return (
    <div className="p-4">
      <h2>API Test</h2>

      {error && <p className="text-red-500">Error: {error}</p>}

      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}
