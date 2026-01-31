import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Settings() {
  const navigate = useNavigate();
  const [industry, setIndustry] = useState("real_estate");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // 1. Fetch current industry setting when page loads
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch("http://localhost:8000/billing/usage", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.plan) { // Assuming your billing endpoint returns brokerage info
          // You might need a dedicated GET /settings/industry endpoint if this doesn't work
          setIndustry(data.industry || "real_estate");
        }
      } catch (err) {
        console.error("Failed to fetch settings", err);
      }
    };
    fetchSettings();
  }, []);

  // 2. Function to update industry in Backend
  const updateIndustry = async (e) => {
    const newIndustry = e.target.value;
    setIndustry(newIndustry);
    setLoading(true);
    setMessage("");

    try {
      const token = localStorage.getItem("token");
      const res = await fetch("http://localhost:8000/settings/industry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ industry: newIndustry }),
      });

      if (res.ok) {
        setMessage("✅ Industry updated successfully!");
      } else {
        setMessage("❌ Failed to update industry.");
      }
    } catch (err) {
      setMessage("❌ Connection error.");
    } finally {
      setLoading(false);
    }
  };

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user_email");
    navigate("/");
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {/* Industry Selection Card */}
      <div className="bg-white p-6 rounded-lg shadow-sm border mb-8">
        <h2 className="text-lg font-semibold mb-2">Industry Focus</h2>
        <p className="text-gray-500 text-sm mb-4">
          This changes how the AI analyzes your leads and extracts data.
        </p>
        
        <div className="flex items-center gap-4">
          <select
            value={industry}
            onChange={updateIndustry}
            disabled={loading}
            className="border p-2 rounded w-64 bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="real_estate">🏠 Real Estate</option>
            <option value="logistics">🚚 Logistics</option>
            <option value="custom">🛠️ Custom / General</option>
          </select>
          {loading && <span className="text-sm text-blue-600 animate-pulse">Saving...</span>}
        </div>
        {message && <p className="mt-3 text-sm font-medium">{message}</p>}
      </div>

      <hr className="mb-8" />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-red-600">Danger Zone</h2>
        <button
          onClick={logout}
          className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded transition-colors"
        >
          Logout
        </button>
      </div>
    </div>
  );
}

