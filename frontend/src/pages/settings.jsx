export default function Settings() {
  const email = localStorage.getItem("user_email");
  const plan = localStorage.getItem("plan");

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user_email");
    localStorage.removeItem("plan");

    window.location.href = "/login";
  };

  return (
    <div className="max-w-3xl space-y-6">

      {/* Account */}
      <div className="bg-white p-6 rounded shadow">
        <div className="text-lg font-semibold mb-4">Account</div>

        <div className="space-y-2 text-sm">
          <div>
            <span className="text-gray-500">Email:</span>{" "}
            <span className="font-medium">{email || "—"}</span>
          </div>
          <div>
            <span className="text-gray-500">Plan:</span>{" "}
            <span className="font-medium capitalize">{plan || "trial"}</span>
          </div>
        </div>
      </div>

      {/* Security */}
      <div className="bg-white p-6 rounded shadow">
        <div className="text-lg font-semibold mb-4">Security</div>

        <button
          onClick={logout}
          className="bg-red-600 text-white px-4 py-2 rounded"
        >
          Logout
        </button>
      </div>

      {/* System */}
      <div className="bg-white p-6 rounded shadow">
        <div className="text-lg font-semibold mb-2">System</div>
        <div className="text-sm text-gray-600">
          Environment: <b>Production-Ready (AWS)</b>
        </div>
      </div>

    </div>
  );
}
