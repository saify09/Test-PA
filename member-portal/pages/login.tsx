import React, { useState } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import { Shield, Eye, EyeOff, AlertCircle, CheckCircle, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';

const LoginPage: NextPage = () => {
  const router = useRouter();
  const { login, isAuthenticated } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => { if (isAuthenticated) router.replace('/'); }, [isAuthenticated]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) { setError('Please enter your username and password.'); return; }
    setLoading(true); setError('');
    const ok = await login(username, password);
    if (ok) router.replace('/');
    else { setError('Invalid credentials. Check your username and password and try again.'); setLoading(false); }
  };

  return (
    <>
      <Head><title>Sign In | MyHealthPA</title></Head>
      <div className="min-h-screen bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900 flex items-center justify-center p-4">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
        </div>

        <div className="w-full max-w-md relative z-10">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center mx-auto mb-4 border border-white/20">
              <Shield size={28} className="text-white" />
            </div>
            <h1 className="text-3xl font-extrabold text-white">MyHealthPA</h1>
            <p className="text-primary-200 text-sm mt-2">Manage your prior authorizations online</p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-3xl shadow-2xl p-8">
            <h2 className="text-xl font-extrabold text-gray-900 mb-1">Welcome back</h2>
            <p className="text-sm text-gray-400 mb-6">Sign in to your member account</p>

            {error && (
              <div className="flex items-center gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl mb-5 text-sm text-red-700">
                <AlertCircle size={15} className="flex-shrink-0" /> {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="form-label">Username or Member ID</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="member1 or MB12345678"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                />
              </div>
              <div>
                <label className="form-label">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="form-input pr-12"
                    placeholder="Your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <Link href="/forgot-password">
                  <button type="button" className="text-sm text-primary-700 hover:underline font-medium">
                    Forgot password?
                  </button>
                </Link>
              </div>

              <button
                type="submit"
                disabled={loading}
                className={cn(
                  'w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-white text-sm transition-all',
                  loading ? 'bg-primary-300 cursor-not-allowed' : 'bg-primary-700 hover:bg-primary-800 shadow-lg hover:shadow-xl'
                )}
              >
                {loading ? (
                  <span className="animate-pulse">Signing in…</span>
                ) : (
                  <><span>Sign In</span><ArrowRight size={16} /></>
                )}
              </button>
            </form>

            {/* Demo */}
            <div className="mt-5 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-center text-gray-400 mb-3">Demo Credentials</p>
              <button
                type="button"
                onClick={() => { setUsername('member1'); setPassword('Member@1234'); }}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors text-sm border border-gray-200"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary-700">SJ</span>
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-gray-800">Sarah Johnson</p>
                    <p className="text-xs text-gray-400">member1 / Member@1234</p>
                  </div>
                </div>
                <span className="text-primary-600 text-xs font-semibold">Use →</span>
              </button>
            </div>

            <p className="text-center text-sm text-gray-500 mt-5">
              New member?{' '}
              <Link href="/register">
                <span className="text-primary-700 font-semibold hover:underline cursor-pointer">Create account</span>
              </Link>
            </p>
          </div>

          <p className="text-center text-xs text-primary-300 mt-6 flex items-center justify-center gap-1.5">
            <Shield size={11} /> Your health information is protected under HIPAA
          </p>
        </div>
      </div>
    </>
  );
};

export default LoginPage;
