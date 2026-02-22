import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";

export default function ResetPassword() {

  const [params] = useSearchParams();
  const navigate = useNavigate();

  const token = params.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleReset(e: React.FormEvent) {

    e.preventDefault();

    setError("");

    // Validate
    if (!password || !confirm) {
      setError("All fields are required");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    if (!token) {
      setError("Invalid or expired link");
      return;
    }

    setLoading(true);

    try {

      await api.post("/auth/reset-password", {
        token,
        password
      });

      setSuccess(true);

      // redirect after 2 seconds
      setTimeout(() => {
        navigate("/login");
      }, 2000);

    } catch (err: any) {

      // Correct error handling
      setError(err.message || "Reset failed");

    } finally {

      setLoading(false);

    }
  }

  return (

    <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center">

      <div className="bg-white p-8 rounded-md shadow-sm w-96">

        <h1 className="text-xl font-semibold text-center mb-2">
          Reset Password
        </h1>

        <p className="text-sm text-gray-500 text-center mb-6">
          Enter your new password
        </p>

        {success ? (

          <div className="text-green-600 text-center">
            Password updated successfully. Redirecting...
          </div>

        ) : (

          <form onSubmit={handleReset}>

            <input
              type="password"
              placeholder="New Password"
              className="w-full border border-gray-300 p-2 mb-4 rounded"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <input
              type="password"
              placeholder="Confirm Password"
              className="w-full border border-gray-300 p-2 mb-4 rounded"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />

            {error && (
              <p className="text-red-500 text-sm mb-4">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#00D4FF] text-black p-2 rounded hover:opacity-90 transition"
            >
              {loading ? "Updating..." : "Update Password"}
            </button>

          </form>

        )}

      </div>

    </div>

  );
}
