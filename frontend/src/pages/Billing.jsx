import { apiPost } from "../api";

export default function Billing() {

  async function upgrade(plan) {
    try {
      const res = await apiPost("/billing/checkout", { plan });

      if (res.checkout_url) {
        window.location.href = res.checkout_url;
      } else {
        alert("Stripe error");
      }
    } catch (e) {
      console.error(e);
      alert("Payment failed");
    }
  }

  return (
    <div className="space-y-6">

      <h1 className="text-2xl font-bold">Billing</h1>

      <div className="grid grid-cols-3 gap-6">

        <div className="bg-white p-6 rounded shadow">
          <h2 className="font-bold">Trial</h2>
          <p>50 leads / month</p>
          <p className="mt-2 font-semibold">Free</p>
        </div>

        <div className="bg-white p-6 rounded shadow">
          <h2 className="font-bold">Starter</h2>
          <p>1000 leads / month</p>
          <p className="mt-2 font-semibold">$29 / mo</p>

          <button
            onClick={() => upgrade("starter")}
            className="mt-4 w-full bg-blue-600 text-white py-2 rounded"
          >
            Upgrade
          </button>
        </div>

        <div className="bg-white p-6 rounded shadow">
          <h2 className="font-bold">Team</h2>
          <p>5000 leads / month</p>
          <p className="mt-2 font-semibold">$99 / mo</p>

          <button
            onClick={() => upgrade("team")}
            className="mt-4 w-full bg-green-600 text-white py-2 rounded"
          >
            Upgrade
          </button>
        </div>

      </div>

    </div>
  );
}
