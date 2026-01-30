import { useEffect, useState } from "react";

export default function Billing() {
  const [billing, setBilling] = useState(null);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/billing/usage", {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    })
      .then((r) => r.json())
      .then(setBilling);
  }, []);

  if (!billing) return <div>Loading billing...</div>;

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Current Plan */}
      <div className="bg-white p-6 rounded shadow">
        <div className="text-lg font-semibold mb-2">Current Plan</div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold capitalize">
              {billing.plan}
            </div>
            <div className="text-sm text-gray-500">
              {billing.usage} / {billing.limit} leads used
            </div>
          </div>

          <span className={`px-3 py-1 rounded text-sm font-medium
            ${billing.blocked
              ? "bg-red-100 text-red-700"
              : "bg-green-100 text-green-700"
            }`}>
            {billing.blocked ? "Limit Reached" : "Active"}
          </span>
        </div>
      </div>

      {/* Usage */}
      <div className="bg-white p-6 rounded shadow">
        <div className="font-semibold mb-2">Monthly Usage</div>

        <div className="w-full bg-gray-200 rounded h-4">
          <div
            className="bg-blue-600 h-4 rounded"
            style={{ width: `${billing.percent}%` }}
          />
        </div>

        <div className="text-sm mt-2 text-gray-600">
          {billing.remaining} leads remaining this month
        </div>

        {billing.warning && (
          <div className="mt-3 text-yellow-700 bg-yellow-100 p-3 rounded">
            ⚠️ {billing.warning}
          </div>
        )}
      </div>

      {/* Upgrade */}
      <div className="bg-white p-6 rounded shadow">
        <div className="font-semibold mb-4">Upgrade Plan</div>

        <div className="grid grid-cols-2 gap-4">
          <PlanCard
            name="Starter"
            price="$30 / month"
            limit="1,000 leads"
            planKey="starter"
          />
          <PlanCard
            name="Team"
            price="$99 / month"
            limit="5,000 leads"
            planKey="team"
          />
        </div>
      </div>

      {/* Manage */}
      <div className="bg-white p-6 rounded shadow">
        <div className="font-semibold mb-2">Manage Subscription</div>
        <p className="text-sm text-gray-600 mb-4">
          Update payment method, cancel subscription, or download invoices.
        </p>

        <button
          disabled
          className="bg-gray-300 text-gray-600 px-4 py-2 rounded cursor-not-allowed"
        >
          Customer Portal (Coming Soon)
        </button>
      </div>

    </div>
  );
}

function PlanCard({ name, price, limit, planKey }) {
  const startCheckout = async () => {
    const res = await fetch(
      `http://127.0.0.1:8000/billing/checkout?plan=${planKey}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );
    const data = await res.json();
    window.location.href = data.checkout_url;
  };

  return (
    <div className="border rounded p-4">
      <div className="text-lg font-bold">{name}</div>
      <div className="text-gray-600">{price}</div>
      <div className="text-sm text-gray-500 mb-4">{limit}</div>

      <button
        onClick={startCheckout}
        className="bg-blue-600 text-white px-4 py-2 rounded w-full"
      >
        Upgrade
      </button>
    </div>
  );
}
