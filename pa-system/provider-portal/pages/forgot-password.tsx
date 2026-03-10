import React, { useState } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { authApi } from '../lib/api';
import { cn } from '../lib/utils';
import { Shield, Mail, ArrowLeft, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

const ForgotPasswordPage: NextPage = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Please enter a valid email address.'); return; }
    setLoading(true); setError('');
    try {
      await authApi.forgotPassword(email);
    } catch {}
    // Always show success to prevent email enumeration
    setSent(true);
    setLoading(false);
  };

  return (
    <>
      <Head><title>Reset Password | PA Provider Portal</title></Head>
      <div className="min-h-screen bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900 flex items-center justify-center p-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
        </div>

        <div className="w-full max-w-md relative z-10">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center mx-auto mb-4 border border-white/20">
              <Shield size={28} className="text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-white">PA Provider Portal</h1>
          </div>

          <div className="bg-white rounded-3xl shadow-2xl p-8">
            {sent ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle size={28} className="text-green-600" />
                </div>
                <h2 className="text-xl font-extrabold text-gray-900 mb-2">Check your email</h2>
                <p className="text-sm text-gray-500 mb-6">
                  If an account exists for <strong>{email}</strong>, you will receive a password reset link within 5 minutes. Check your spam folder if you don't see it.
                </p>
                <Link href="/login">
                  <button className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary-700 hover:bg-primary-800 text-white font-bold text-sm transition-all">
                    <ArrowLeft size={16} /> Back to Sign In
                  </button>
                </Link>
              </div>
            ) : (
              <>
                <h2 className="text-xl font-extrabold text-gray-900 mb-1">Reset your password</h2>
                <p className="text-sm text-gray-400 mb-6">Enter your email address and we'll send you a reset link.</p>

                {error && (
                  <div className="flex items-center gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl mb-5 text-sm text-red-700">
                    <AlertCircle size={15} className="flex-shrink-0" /> {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="form-label">Email Address</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="email"
                        className="form-input pl-10"
                        placeholder="provider@clinic.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        autoComplete="email"
                        autoFocus
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className={cn(
                      'w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-white text-sm transition-all',
                      loading ? 'bg-primary-300 cursor-not-allowed' : 'bg-primary-700 hover:bg-primary-800 shadow-lg'
                    )}
                  >
                    {loading ? <><Loader2 size={16} className="animate-spin" /> Sending…</> : 'Send Reset Link'}
                  </button>
                </form>

                <div className="mt-5 pt-4 border-t border-gray-100 text-center">
                  <Link href="/login">
                    <button type="button" className="text-sm text-primary-700 hover:underline font-medium inline-flex items-center gap-1.5">
                      <ArrowLeft size={14} /> Back to Sign In
                    </button>
                  </Link>
                </div>
              </>
            )}
          </div>

          <p className="text-center text-xs text-primary-300 mt-6 flex items-center justify-center gap-1.5">
            <Shield size={11} /> Your health information is protected under HIPAA
          </p>
        </div>
      </div>
    </>
  );
};

export default ForgotPasswordPage;
