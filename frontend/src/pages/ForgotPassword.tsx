import { useState } from "react";
import {api} from "../lib/api";

export default function ForgotPassword() {

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();

  try {

    await api.post("/auth/forgot-password", { email });

    setMessage("Reset email sent.");

  } catch (err: any) {

    setMessage(err.message);

  }
}

  return (
    <div className="min-h-screen bg-basebg flex items-center justify-center px-4">
      <div className="bg-white w-full max-w-md rounded-xl border border-gray-200 p-8">

        <h1 className="text-2xl font-medium text-center mb-6">
          Reset Password
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            className="w-full border p-2 rounded"
            onChange={(e) => setEmail(e.target.value)}
          />

          <button className="w-full bg-dark text-white py-2 rounded">
            Send Reset Link
          </button>
        </form>

        {message && (
          <p className="text-sm text-center mt-4">{message}</p>
        )}

      </div>
    </div>
  );
}
