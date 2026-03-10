import React, { useState } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import { Shield, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '../lib/utils';

const LoginPage: NextPage = () => {
  const router = useRouter();
  const { login, isAuthenticated } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (isAuthenticated) router.replace('/');
  }, [isAuthenticated]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) { setError('Please enter username and password'); return; }
    setLoading(true);
    setError('');
    const ok = await login(username, password);
    if (ok) router.replace('/');
    else { setError('Invalid credentials. Try demo / demo123'); setLoading(false); }
  };

  return (
    <>
      <Head><title>Sign In | PA Provider Portal</title></Head>
      <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-700 to-primary-500 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Shield size={28} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Provider Portal</h1>
            <p className="text-primary-200 text-sm mt-1">AI-Powered Prior Authorization</p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <h2 className="text-lg font-bold text-gray-900 mb-6">Sign In</h2>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl mb-4 text-sm text-red-700">
                <AlertCircle size={15} className="flex-shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="form-label required">Username / NPI</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter your username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>

              <div className="space-y-1">
                <label className="form-label required">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="form-input pr-10"
                    placeholder="Enter your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded border-gray-300 text-primary-600" />
                  <span className="text-gray-600">Remember me</span>
                </label>
                <a href="/forgot-password" className="text-primary-600 hover:underline">Forgot password?</a>
              </div>

              <button
                type="submit"
                disabled={loading}
                className={cn(
                  'w-full py-2.5 rounded-xl text-white font-semibold text-sm transition-all',
                  loading ? 'bg-primary-300 cursor-not-allowed' : 'bg-primary-500 hover:bg-primary-600 active:bg-primary-700 shadow-sm hover:shadow-md'
                )}
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-gray-100">
              <p className="text-xs text-center text-gray-400 mb-3">Demo Credentials</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Provider', user: 'provider1', pass: 'Demo@1234' },
                  { label: 'Admin', user: 'admin', pass: 'Admin@1234' },
                ].map(d => (
                  <button
                    key={d.user}
                    type="button"
                    onClick={() => { setUsername(d.user); setPassword(d.pass); }}
                    className="text-xs px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
                  >
                    Use {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-primary-200 mt-6">
            HIPAA Compliant · All PHI is encrypted at rest and in transit
          </p>
        </div>
      </div>
    </>
  );
};

export default LoginPage;
