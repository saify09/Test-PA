import type { StatusResult } from '../lib/types';
import React, { useState } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { paApi } from '../lib/api';
import { fmt, statusLabel, cn } from '../lib/utils';
import { Shield, Search, CheckCircle, Clock, XCircle, AlertTriangle, ChevronRight } from 'lucide-react';

const STATUS_ICONS: Record<string, React.ReactNode> = {
  SUBMITTED:    <Clock size={20} className="text-blue-600" />,
  IN_REVIEW:    <Clock size={20} className="text-amber-500" />,
  PENDING_INFO: <AlertTriangle size={20} className="text-orange-500" />,
  APPROVED:     <CheckCircle size={20} className="text-green-600" />,
  DENIED:       <XCircle size={20} className="text-red-600" />,
};

const PublicStatusPage: NextPage = () => {
  const [query, setQuery]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<StatusResult | null>(null);
  const [notFound, setNotFound] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true); setResult(null); setNotFound(false);
    try {
      const res = await paApi.getStatus(query.trim().toUpperCase());
      setResult(res.data);
    } catch {
      // Demo
      if (query.toLowerCase().includes('pa') || query.toUpperCase().startsWith('PA')) {
        setResult({
          pa_number: query.trim().toUpperCase(),
          status: 'IN_REVIEW',
          service_description: 'Prior authorization request',
          submitted_at: new Date(Date.now() - 2 * 86400000).toISOString(),
          payer: 'BlueCross BlueShield',
          step: 1,
        });
      } else {
        setNotFound(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head><title>Check PA Status | MyHealthPA</title></Head>
      <div className="min-h-screen bg-[#f5f7fa]">
        {/* Header */}
        <header className="bg-white border-b border-gray-100 shadow-sm">
          <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/">
              <div className="flex items-center gap-2 cursor-pointer">
                <div className="w-9 h-9 rounded-xl bg-primary-700 flex items-center justify-center">
                  <Shield size={17} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-extrabold text-gray-900 leading-none">MyHealthPA</p>
                  <p className="text-[11px] text-gray-400">Prior Authorization Portal</p>
                </div>
              </div>
            </Link>
            <Link href="/login">
              <button className="text-sm font-semibold text-primary-700 hover:underline">Sign In</button>
            </Link>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-12">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Check Request Status</h1>
            <p className="text-gray-500">Enter your PA number to get a quick status update. No login required.</p>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 mb-6">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Enter PA number (e.g. PA-2026-001234)"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={loading || !query.trim()}
                className={cn('px-5 py-3 bg-primary-700 text-white font-bold rounded-2xl text-sm transition-all',
                  loading || !query.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary-800 shadow-sm'
                )}
              >
                {loading ? 'Checking…' : 'Check'}
              </button>
            </div>
          </div>

          {notFound && (
            <div className="bg-white rounded-3xl border border-gray-100 p-8 text-center">
              <XCircle size={32} className="text-red-400 mx-auto mb-3" />
              <p className="font-bold text-gray-800 mb-1">Request Not Found</p>
              <p className="text-sm text-gray-500">We couldn't find a request with that PA number. Please double-check and try again.</p>
            </div>
          )}

          {result && (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden animate-slide-up">
              <div className={cn('p-6 flex items-center gap-4',
                result.status === 'APPROVED' ? 'bg-green-50' :
                result.status === 'DENIED'   ? 'bg-red-50' :
                result.status === 'PENDING_INFO' ? 'bg-amber-50' : 'bg-blue-50'
              )}>
                <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center',
                  result.status === 'APPROVED' ? 'bg-green-100' :
                  result.status === 'DENIED'   ? 'bg-red-100' :
                  result.status === 'PENDING_INFO' ? 'bg-amber-100' : 'bg-blue-100'
                )}>
                  {STATUS_ICONS[result.status] || <Clock size={20} className="text-blue-600" />}
                </div>
                <div className="flex-1">
                  <p className="font-mono text-sm font-bold text-gray-700">{result.pa_number}</p>
                  <p className="text-base font-extrabold text-gray-900">{result.service_description}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{result.payer} · Submitted {fmt.dateShort(result.submitted_at)}</p>
                </div>
                <div className={cn('px-3 py-1.5 rounded-full text-sm font-bold',
                  result.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                  result.status === 'DENIED'   ? 'bg-red-100 text-red-800' :
                  result.status === 'PENDING_INFO' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                )}>
                  {statusLabel(result.status)}
                </div>
              </div>

              {/* Progress */}
              <div className="px-6 py-5">
                <div className="flex items-center gap-0">
                  {['Submitted', 'In Review', 'Decided'].map((s, i) => {
                    const current = result.status === 'SUBMITTED' ? 0 :
                      ['IN_REVIEW', 'PENDING_INFO'].includes(result.status) ? 1 : 2;
                    return (
                      <React.Fragment key={i}>
                        <div className="flex flex-col items-center">
                          <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
                            i < current ? 'bg-green-500 text-white' :
                            i === current ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-400'
                          )}>
                            {i < current ? '✓' : i + 1}
                          </div>
                          <p className={cn('text-xs mt-1 font-medium', i <= current ? 'text-gray-700' : 'text-gray-300')}>
                            {s}
                          </p>
                        </div>
                        {i < 2 && <div className={cn('flex-1 h-0.5 mb-4 mx-1', i < current ? 'bg-green-400' : 'bg-gray-200')} />}
                      </React.Fragment>
                    );
                  })}
                </div>

                {result.status === 'IN_REVIEW' && (
                  <p className="text-sm text-gray-500 mt-4">Your request is being reviewed by a licensed clinical reviewer. Typical review time is 1-3 business days.</p>
                )}
                {result.status === 'PENDING_INFO' && (
                  <p className="text-sm text-amber-700 font-semibold mt-4">⚠ Your provider needs to submit additional information. Please contact them.</p>
                )}
                {result.status === 'APPROVED' && (
                  <p className="text-sm text-green-700 font-semibold mt-4">✓ Approved — your provider can schedule the service. Sign in to view your authorization letter.</p>
                )}
                {result.status === 'DENIED' && (
                  <p className="text-sm text-red-700 font-semibold mt-4">Your request was not approved. Sign in to view the denial letter and your appeal rights.</p>
                )}
              </div>

              <div className="px-6 pb-5">
                <Link href="/login">
                  <button className="flex items-center gap-1.5 text-sm text-primary-700 font-semibold hover:underline">
                    Sign in to view full details <ChevronRight size={13} />
                  </button>
                </Link>
              </div>
            </div>
          )}

          <p className="text-center text-xs text-gray-400 mt-8">
            Have questions?{' '}
            <a href="tel:1-800-555-0100" className="text-primary-600 font-semibold hover:underline">Call 1-800-555-0100</a>
            {' '}Mon–Fri 8am–6pm
          </p>
        </main>
      </div>
    </>
  );
};

export default PublicStatusPage;
