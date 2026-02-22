import { useState } from "react";
import {api} from "../lib/api";
import { useAuthStore } from "../store/auth";
import { useNavigate, Link } from "react-router-dom";

export default function Login() {

  const setToken = useAuthStore((s) => s.setToken);
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  // -----------------------------
  // Email Login
  // -----------------------------
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await api.post("/auth/login", {
  email,
  password,
});

setToken(res.access_token);

      navigate("/");

    } catch (err: any) {
      setError(err.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  // -----------------------------
  // Google Login (FIXED)
  // -----------------------------
  async function handleGoogleLogin() {

    try {
      setGoogleLoading(true);
      setError("");

      const res = await fetch("http://localhost:8000/auth/google/login");

      if (!res.ok) {
        throw new Error("Google login failed");
      }

      const data = await res.json();

      if (!data.auth_url) {
        throw new Error("Invalid Google response");
      }

      window.location.href = data.auth_url;

    } catch (err: any) {
      setError(err.message || "Google login failed");
      setGoogleLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center px-4">

      <div className="bg-white w-full max-w-md rounded-xl border border-gray-200 shadow-sm p-10">

        {/* Logo */}
        <h1 className="text-2xl font-semibold text-center tracking-tight mb-2">
          <span className="text-[#00D4FF]">Lead</span>RankerAI
        </h1>

        <p className="text-sm text-gray-500 text-center mb-8">
          Sign in to your dashboard
        </p>

        <form onSubmit={handleLogin} className="space-y-4">

          <input
            type="email"
            placeholder="Email"
            required
            className="w-full border border-gray-300 focus:border-black focus:outline-none rounded-md px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password"
            required
            className="w-full border border-gray-300 focus:border-black focus:outline-none rounded-md px-3 py-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white py-2 rounded-md text-sm hover:opacity-90 transition"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

        </form>

        {/* Divider */}
        <div className="flex items-center my-6">
          <div className="flex-1 border-t border-gray-200" />
          <span className="px-3 text-xs text-gray-400">or</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>

        {/* Google Button */}
        <button
          onClick={handleGoogleLogin}
          disabled={googleLoading}
          className="w-full border border-gray-300 rounded-md py-2 text-sm hover:bg-gray-50 transition"
        >
          {googleLoading ? "Redirecting..." : "Continue with Google"}
        </button>

        {/* Footer Links */}
        <div className="flex justify-between text-sm mt-8 text-gray-500">

          <Link
            to="/register"
            className="hover:text-black transition"
          >
            Create account
          </Link>

          <Link
            to="/forgot-password"
            className="hover:text-black transition"
          >
            Forgot password?
          </Link>

        </div>

      </div>

    </div>
  );
}
