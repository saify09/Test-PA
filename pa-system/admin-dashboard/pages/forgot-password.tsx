import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Shield, Mail, CheckCircle } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
    setSubmitted(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-8 border border-gray-700">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">PA Admin</h1>
            <p className="text-xs text-gray-400">Prior Authorization System</p>
          </div>
        </div>

        {!submitted ? (
          <>
            <h2 className="text-2xl font-bold text-white mb-2">Reset password</h2>
            <p className="text-gray-400 text-sm mb-8">
              Enter your admin email address and we will send a reset link.
            </p>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Admin Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    placeholder="admin@hospital.org"
                    className="w-full pl-10 pr-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || !email}
                className="w-full py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
            </form>
          </>
        ) : (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Check your email</h2>
            <p className="text-gray-400 text-sm">
              If <span className="text-white">{email}</span> is a registered admin account, you will receive a reset link shortly.
            </p>
            <p className="text-gray-500 text-xs mt-4">Reset links expire after 2 hours.</p>
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-gray-700">
          <Link href="/login" className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to admin login
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-gray-600">
          HIPAA-compliant | Encrypted | Secure
        </p>
      </div>
    </div>
  );
}
