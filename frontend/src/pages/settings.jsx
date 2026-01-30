import { useNavigate } from "react-router-dom";

export default function Settings() {
  const navigate = useNavigate();

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user_email");
    navigate("/");
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">Settings</h1>

      <button
        onClick={logout}
        className="bg-red-600 text-white px-4 py-2 rounded"
      >
        Logout
      </button>
    </div>
  );
}
