import React, { useState } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Button, Input, Alert } from '../components/ui';
import { authApi } from '../lib/api';
import { Mail, ArrowLeft, CheckCircle, Stethoscope } from 'lucide-react';

const ForgotPasswordPage: NextPage = () => {
  const router = useRouter();
  const [step, setStep]     = useState<'request'|'sent'>('request');
  const [email, setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const handleSubmit = async () => {
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Please enter a valid email address.'); return; }
    setError(''); setLoading(true);
    try {
      await authApi.forgotPassword(email);
    } catch (_) { /* Anti-enumeration: always show success (HIPAA SC-007) */ }
    setLoading(false); setStep('sent');
  };

  return (
    <>
      <Head><title>Reset Password — Reviewer Workbench</title></Head>
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">

          {/* Logo */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-600 rounded-xl shadow mb-3">
              <Stethoscope size={26} className="text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Clinical Reviewer Workbench</h1>
            <p className="text-sm text-gray-500">AI-Assisted Prior Authorization Review</p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-5">

            {step === 'request' ? (
              <>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Reset your password</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Enter your registered email address and we'll send you a reset link.
                  </p>
                </div>

                {error && <Alert variant="error">{error}</Alert>}

                <div className="space-y-4">
                  <Input
                    label="Email Address"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                    placeholder="reviewer@health.org"
                    leftIcon={<Mail size={15} className="text-gray-400" />}
                    autoFocus
                  />
                  <Button className="w-full" onClick={handleSubmit} loading={loading}>
                    Send Reset Link
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="text-center space-y-3 py-2">
                  <div className="inline-flex items-center justify-center w-14 h-14 bg-green-100 rounded-full">
                    <CheckCircle size={28} className="text-green-600" />
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900">Check your email</h2>
                  <p className="text-sm text-gray-500">
                    If <span className="font-medium text-gray-700">{email}</span> is registered,
                    you'll receive a password reset link within a few minutes.
                  </p>
                  <p className="text-xs text-gray-400">
                    Didn't receive it? Check your spam folder or{' '}
                    <button onClick={() => setStep('request')} className="text-indigo-600 hover:underline">
                      try again
                    </button>.
                  </p>
                </div>
                <Button variant="outline" className="w-full" onClick={() => router.push('/login')}>
                  Back to Sign In
                </Button>
              </>
            )}
          </div>

          {/* Back link */}
          {step === 'request' && (
            <div className="text-center">
              <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
                <ArrowLeft size={14} /> Back to sign in
              </Link>
            </div>
          )}

          <p className="text-center text-xs text-gray-400">
            Need help? Contact your system administrator.
          </p>
        </div>
      </div>
    </>
  );
};

export default ForgotPasswordPage;
