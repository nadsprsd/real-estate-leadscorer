import { useState } from "react";
import { api } from "../lib/api";
import { useNavigate } from "react-router-dom";

export default function Register() {

  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: "",
    password: "",
    brokerage_name: "",
    industry: "real_estate",
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleRegister(e: React.FormEvent) {

    e.preventDefault();

    setLoading(true);
    setError("");
    setMessage("");

    try {

      await api.post("/auth/register", form);

      setMessage("Verification email sent. Please check your inbox.");

      // redirect after 2 seconds
      setTimeout(() => {
        navigate("/login");
      }, 2000);

    } catch (err: any) {

      setError(err.message || "Registration failed");

    } finally {

      setLoading(false);

    }
  }

  return (

    <div className="min-h-screen bg-basebg flex items-center justify-center px-4">

      <div className="bg-white w-full max-w-md rounded-xl border border-gray-200 p-8">

        <h1 className="text-2xl font-medium text-center mb-6">
          Create Account
        </h1>

        <form onSubmit={handleRegister} className="space-y-4">

          <input
            placeholder="Brokerage Name"
            required
            className="w-full border p-2 rounded"
            value={form.brokerage_name}
            onChange={(e) =>
              setForm({
                ...form,
                brokerage_name: e.target.value
              })
            }
          />

          <input
            type="email"
            placeholder="Email"
            required
            className="w-full border p-2 rounded"
            value={form.email}
            onChange={(e) =>
              setForm({
                ...form,
                email: e.target.value
              })
            }
          />

          <input
            type="password"
            placeholder="Password"
            required
            className="w-full border p-2 rounded"
            value={form.password}
            onChange={(e) =>
              setForm({
                ...form,
                password: e.target.value
              })
            }
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-dark text-white py-2 rounded"
          >
            {loading ? "Creating..." : "Create Account"}
          </button>

        </form>

        {message && (
          <p className="text-green-600 text-sm text-center mt-4">
            {message}
          </p>
        )}

        {error && (
          <p className="text-red-500 text-sm text-center mt-4">
            {error}
          </p>
        )}

      </div>

    </div>

  );
}
