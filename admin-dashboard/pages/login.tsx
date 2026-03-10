import React, { useState } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import { Shield, Eye, EyeOff, AlertCircle, Lock } from 'lucide-react';
import { cn } from '../lib/utils';

const AdminLogin: NextPage = () => {
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
    if (!username || !password) { setError('Username and password required.'); return; }
    setLoading(true); setError('');
    const ok = await login(username, password);
    if (ok) router.replace('/');
    else { setError('Invalid credentials or insufficient privileges.'); setLoading(false); }
  };

  return (
    <>
      <Head><title>Admin Sign In | PA Dashboard</title></Head>
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-primary-800/10 rounded-full blur-3xl" />
        </div>
        <div className="w-full max-w-sm relative z-10">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-primary-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-900/50">
              <Shield size={26} className="text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-white">Admin Dashboard</h1>
            <p className="text-slate-500 text-sm mt-1.5">Prior Authorization Management System</p>
          </div>

          <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl p-7">
            <div className="flex items-center gap-2 mb-5">
              <Lock size={14} className="text-slate-500" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Secure Admin Access</p>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-950 border border-red-800 rounded-lg mb-4 text-xs text-red-400">
                <AlertCircle size={13} className="flex-shrink-0" /> {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Username</label>
                <input
                  type="text"
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-600
                             focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none transition-colors"
                  placeholder="admin"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="w-full px-3.5 py-2.5 pr-10 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-600
                               focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none transition-colors"
                    placeholder="Admin@1234"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading}
                className={cn('w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold text-white transition-all',
                  loading ? 'bg-primary-800 cursor-not-allowed' : 'bg-primary-600 hover:bg-primary-500 shadow-lg shadow-primary-900/40'
                )}>
                {loading ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Authenticating…</> : 'Sign In'}
              </button>
            </form>

            {/* Demo creds */}
            <div className="mt-5 pt-4 border-t border-slate-800">
              <p className="text-[11px] text-slate-600 font-semibold text-center mb-2.5 uppercase tracking-wide">Demo Access</p>
              <div className="space-y-1.5">
                {[
                  { label: 'Super Admin', user: 'admin', pw: 'Admin@1234', role: 'SUPER_ADMIN' },
                  { label: 'Operations', user: 'ops1',   pw: 'Ops@1234',   role: 'OPS_ADMIN' },
                ].map(c => (
                  <button key={c.user} type="button"
                    onClick={() => { setUsername(c.user); setPassword(c.pw); }}
                    className="w-full flex items-center justify-between px-3 py-2 bg-slate-800 hover:bg-slate-750 rounded-lg transition-colors text-xs border border-slate-700">
                    <span className="font-semibold text-slate-300">{c.label}</span>
                    <span className="font-mono text-slate-500">{c.user} / {c.pw}</span>
                    <span className={cn('badge text-[9px]', 'badge-blue')}>{c.role.split('_')[0]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="text-center text-[11px] text-slate-700 mt-5">Access restricted to authorized personnel · HIPAA protected</p>
        </div>
      </div>
    </>
  );
};

export default AdminLogin;
