import React, { useState } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import { Stethoscope, Eye, EyeOff, AlertCircle, Shield } from 'lucide-react';
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
    setLoading(true); setError('');
    const ok = await login(username, password);
    if (ok) router.replace('/');
    else { setError('Invalid credentials. Try: reviewer1 / Review@1234'); setLoading(false); }
  };

  return (
    <>
      <Head><title>Sign In | Clinical Review Workbench</title></Head>
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-4">
              <Stethoscope size={26} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Clinical Review Workbench</h1>
            <p className="text-slate-400 text-sm mt-1">AI-Assisted Prior Authorization Review</p>
          </div>
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <h2 className="text-lg font-bold text-gray-900 mb-6">Sign In</h2>
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl mb-4 text-sm text-red-700">
                <AlertCircle size={14} />{error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="form-label required">Username</label>
                <input type="text" className="form-input" placeholder="reviewer1" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" />
              </div>
              <div className="space-y-1">
                <label className="form-label required">Password</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} className="form-input pr-10" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><Eye size={15} /></button>
                </div>
              </div>
              <button type="submit" disabled={loading} className={cn('w-full py-2.5 rounded-xl text-white font-semibold text-sm transition-all', loading ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700')}>
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
            <div className="mt-5 pt-4 border-t border-gray-100">
              <p className="text-xs text-center text-gray-400 mb-3">Demo Credentials</p>
              <div className="grid grid-cols-2 gap-2">
                {[{ label: 'RN Reviewer', u: 'reviewer1', p: 'Review@1234' }, { label: 'MD Director', u: 'meddir1', p: 'Doctor@1234' }].map(d => (
                  <button key={d.u} type="button" onClick={() => { setUsername(d.u); setPassword(d.p); }} className="text-xs px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors text-gray-600">
                    Use {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="text-center text-xs text-slate-500 mt-6 flex items-center justify-center gap-1.5">
            <Shield size={12} /> HIPAA Compliant · Secure Access Only
          </p>
        </div>
      </div>
    </>
  );
};

export default LoginPage;
