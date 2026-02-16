import { useSearchParams } from "react-router-dom";
import { useState } from "react";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState("");

  const token = searchParams.get("token");

  const handleSubmit = async () => {
    await fetch("http://localhost:8000/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        new_password: password
      })
    });

    alert("Password updated!");
  };

  return (
    <div>
      <h2>Reset Password</h2>
      <input
        type="password"
        placeholder="New password"
        onChange={(e) => setPassword(e.target.value)}
      />
      <button onClick={handleSubmit}>Update Password</button>
    </div>
  );
}
