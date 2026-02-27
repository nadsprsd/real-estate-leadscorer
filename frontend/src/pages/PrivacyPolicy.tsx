import React from 'react';

export default function PrivacyPolicy() {
  // Use your real Udyam number here
  const udyamNumber = "UDYAM-KL-02-0149354";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-black mb-3"><span className="text-blue-600">Lead</span>RankerAI</h1>
          <h2 className="text-2xl font-bold text-slate-800">Privacy Policy</h2>
          <p className="text-slate-500 text-sm mt-2">Effective: February 27, 2026 · GDPR & Indian IT Act 2000 Compliant</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 md:p-12 space-y-8 text-slate-700">

          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-sm text-emerald-800">
            <strong>Short version:</strong> LeadRankerAI is a registered MSME proprietary firm (Udyam: {udyamNumber}). 
            We collect only what's needed to score your leads. We never sell your data. You can delete everything at any time. 
            We comply with Indian IT Act 2000 and GDPR for EU/UK clients.
          </div>

          <section>
            <h3 className="font-black text-slate-900 text-lg mb-3">1. What We Collect</h3>
            <div className="text-sm leading-relaxed space-y-3">
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="font-bold text-slate-800 mb-2">Account Information</p>
                <p className="text-slate-600">Email address, hashed password, brokerage name, industry. Used to identify your account and send service notifications.</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="font-bold text-slate-800 mb-2">Lead Data</p>
                <p className="text-slate-600">Messages, names, contact info you submit for scoring. Used only to generate AI scores for your brokerage. Never shared with third parties.</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="font-bold text-slate-800 mb-2">Usage & Technical Data</p>
                <p className="text-slate-600">API request counts, timestamps, browser/device type (for security). No advertising tracking, no fingerprinting.</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="font-bold text-slate-800 mb-2">Payment Data</p>
                <p className="text-slate-600">Processed entirely by Stripe. We store only your Stripe Customer ID and subscription plan — never card numbers, CVV, or billing address.</p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="font-black text-slate-900 text-lg mb-3">2. How We Use Your Data</h3>
            <ul className="text-sm space-y-2 list-disc list-inside ml-2 text-slate-600 leading-relaxed">
              <li>To provide AI lead scoring services</li>
              <li>To send transactional emails (verification, score alerts, billing receipts)</li>
              <li>To detect fraud and abuse</li>
              <li>To improve scoring accuracy (aggregated, anonymized analysis only)</li>
              <li><strong>Never:</strong> for advertising, profiling, or selling to third parties</li>
            </ul>
          </section>

          <section>
            <h3 className="font-black text-slate-900 text-lg mb-3">3. Data Storage & Security</h3>
            <div className="text-sm leading-relaxed space-y-2">
              <p>Your data is stored on servers in Singapore (AWS ap-southeast-1) and India (Mumbai).</p>
              <ul className="list-disc list-inside ml-2 space-y-1 text-slate-600">
                <li>Encryption at rest: AES-256</li>
                <li>Encryption in transit: TLS 1.3</li>
                <li>Passwords: bcrypt hashed, never stored in plaintext</li>
                <li>JWT tokens expire after 30 days</li>
                <li>Database backups retained for 30 days, then deleted</li>
              </ul>
            </div>
          </section>

          <section>
            <h3 className="font-black text-slate-900 text-lg mb-3">4. Third Parties</h3>
            <div className="text-sm space-y-2">
              {[
                { name: "Stripe", purpose: "Payment processing", location: "USA", policy: "https://stripe.com/privacy" },
                { name: "Resend", purpose: "Transactional email delivery", location: "USA", policy: "https://resend.com/privacy" },
                { name: "LLM (OpenAI GPT-4o mini and GPT-3.5 Turbo)", purpose: "AI lead scoring", location: "USA", policy: "https://openai.com/privacy" },
                { name: "AWS", purpose: "Cloud infrastructure", location: "Singapore/India", policy: "https://aws.amazon.com/privacy" },
              ].map(t => (
                <div key={t.name} className="flex items-start justify-between p-3 bg-slate-50 rounded-xl">
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.purpose} · {t.location}</p>
                  </div>
                  <a href={t.policy} target="_blank" rel="noreferrer"
                    className="text-xs text-blue-600 hover:underline flex-shrink-0 ml-4">Policy ↗</a>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-black text-slate-900 text-lg mb-3">5. Cookies</h3>
            <p className="text-sm leading-relaxed">
              We use <strong>only essential cookies</strong> — session authentication (JWT stored in
              localStorage, not cookies) and security tokens. We do <strong>not</strong> use advertising
              cookies, analytics tracking pixels, or third-party tracking. No cookie consent banner is needed
              because we don't use non-essential cookies.
            </p>
          </section>

          <section>
            <h3 className="font-black text-slate-900 text-lg mb-3">6. Your Rights</h3>
            <div className="text-sm space-y-2">
              {[
                ["Access", "Request a full export of all data we hold about you"],
                ["Correction", "Update incorrect profile or account data in Settings"],
                ["Deletion", "Delete your account and all data from Settings > Danger Zone"],
                ["Portability", "Request your lead data exported as CSV — email us"],
                ["Withdraw Consent", "Unsubscribe from emails any time via email footer link"],
              ].map(([right, desc]) => (
                <div key={right} className="p-3 bg-slate-50 rounded-xl">
                  <span className="font-bold text-slate-800">{right}: </span>
                  <span className="text-slate-600">{desc}</span>
                </div>
              ))}
            </div>
            <p className="text-sm text-slate-600 mt-3">
              For GDPR requests or data exports: <a href="mailto:privacy@leadrankerai.com"
                className="text-blue-600 hover:underline">privacy@leadrankerai.com</a>.
              We respond within 30 days as required by law.
            </p>
          </section>

          <section>
            <h3 className="font-black text-slate-900 text-lg mb-3">7. Indian IT Act 2000 Compliance</h3>
            <p className="text-sm leading-relaxed">
              LeadRankerAI is a registered MSME proprietary firm (Udyam Reg No: {udyamNumber}) complying with the Information Technology Act, 2000 and the Information Technology
              (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011.
              We are registered in Kerala and subject to Indian jurisdiction. For complaints under the IT Act,
              contact our Grievance Officer at <a href="mailto:grievance@leadrankerai.com"
                className="text-blue-600 hover:underline">grievance@leadrankerai.com</a>.
            </p>
          </section>

          <section>
            <h3 className="font-black text-slate-900 text-lg mb-3">8. International Clients</h3>
            <p className="text-sm leading-relaxed">
              For clients in the EU/UK, the GDPR applies. Our legal basis for processing is contract
              performance (scoring your leads per your subscription). For clients in the UAE, we comply
              with PDPL 2021. For US clients, we comply with applicable state privacy laws.
              Data transferred outside India is protected by standard contractual clauses.
            </p>
          </section>

          <section>
            <h3 className="font-black text-slate-900 text-lg mb-3">9. Changes to This Policy</h3>
            <p className="text-sm leading-relaxed">
              We will notify you by email at least 14 days before material changes take effect.
              Continued use after the effective date constitutes acceptance of the revised policy.
            </p>
          </section>

          <section>
            <h3 className="font-black text-slate-900 text-lg mb-3">10. Contact</h3>
            <p className="text-sm leading-relaxed">
              Privacy inquiries: <a href="mailto:privacy@leadrankerai.com" className="text-blue-600 hover:underline">privacy@leadrankerai.com</a><br/>
              Grievance Officer (India): <a href="mailto:grievance@leadrankerai.com" className="text-blue-600 hover:underline">grievance@leadrankerai.com</a><br/>
              <strong>LeadRankerAI</strong><br/>
              Ernakulam, Kerala, India
            </p>
          </section>
        </div>

        <p className="text-center text-xs text-slate-400 mt-8">
          · <a href="/terms" className="hover:underline text-blue-500">Terms of Service</a>
        </p>
      </div>
    </div>
  );
}