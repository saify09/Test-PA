import type { MemberPARequest, StatusResult } from '../lib/types';
import React, { useState, useEffect } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import MemberLayout from '../components/layout/Layout';
import { Card, Alert, StatusBadge, Spinner, EmptyState, Button } from '../components/ui';
import { paApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmt, statusLabel, statusClass, daysUntilExpiry, cn } from '../lib/utils';
import {
  CheckCircle, Clock, FileText, AlertTriangle, ChevronRight,
  Shield, Download, Plus, Search, RefreshCw, ExternalLink,
  Activity, Calendar, Phone, TrendingUp
} from 'lucide-react';

const MemberDashboard: NextPage = () => {
  const { member } = useAuth();
  const router = useRouter();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusSearch, setStatusSearch] = useState('');
  const [searchResult, setSearchResult] = useState<StatusResult | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => { loadRequests(); }, []);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const res = await paApi.list({ limit: 5, sort_by: 'submitted_at', sort_dir: 'desc' });
      setRequests(res.data.items || []);
    } catch {
      setRequests(mockRequests());
    } finally {
      setLoading(false);
    }
  };

  const handleStatusCheck = async () => {
    if (!statusSearch.trim()) return;
    setSearching(true);
    try {
      const res = await paApi.getStatus(statusSearch.trim());
      setSearchResult(res.data);
    } catch {
      // Mock result
      setSearchResult({
        pa_number: statusSearch.trim().toUpperCase(),
        status: 'IN_REVIEW',
        service_description: 'MRI Lumbar Spine without contrast',
        submitted_at: new Date(Date.now() - 2 * 24 * 3600000).toISOString(),
        estimated_decision: new Date(Date.now() + 1 * 24 * 3600000).toISOString(),
        step: 2,
      });
    } finally {
      setSearching(false);
    }
  };

  // Compute summary stats
  const stats = {
    total:    requests.length,
    active:   requests.filter(r => ['SUBMITTED', 'IN_REVIEW', 'PENDING_INFO'].includes(r.status)).length,
    approved: requests.filter(r => r.status === 'APPROVED').length,
    needsAction: requests.filter(r => r.status === 'PENDING_INFO').length,
  };

  const activeRequests  = requests.filter(r => ['SUBMITTED', 'IN_REVIEW', 'PENDING_INFO'].includes(r.status));
  const recentDecisions = requests.filter(r => ['APPROVED', 'DENIED'].includes(r.status)).slice(0, 3);

  return (
    <>
      <Head><title>My Dashboard | MyHealthPA</title></Head>
      <MemberLayout>
        {/* Welcome banner */}
        <div className="bg-gradient-to-br from-primary-700 to-primary-800 rounded-3xl p-6 mb-6 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-16 translate-x-16" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-10 -translate-x-10" />
          <div className="relative">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-primary-200 text-sm font-medium mb-1">Welcome back</p>
                <h1 className="text-2xl font-extrabold">{member?.full_name || 'Member'}</h1>
                <p className="text-primary-200 text-sm mt-1">Member ID: <span className="font-mono font-bold text-white">{member?.member_id}</span></p>
                {member?.plan_name && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <Shield size={13} className="text-primary-300" />
                    <span className="text-sm text-primary-200">{member.plan_name}</span>
                  </div>
                )}
              </div>
              <div className="hidden sm:grid grid-cols-3 gap-3">
                {[
                  { label: 'Active', value: stats.active, color: 'bg-white/10' },
                  { label: 'Approved', value: stats.approved, color: 'bg-green-500/20' },
                  { label: 'Total', value: stats.total, color: 'bg-white/10' },
                ].map(s => (
                  <div key={s.label} className={cn('px-4 py-3 rounded-2xl text-center', s.color)}>
                    <p className="text-2xl font-extrabold text-white">{s.value}</p>
                    <p className="text-xs text-primary-200 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
            {stats.needsAction > 0 && (
              <div className="mt-4 flex items-center gap-2 bg-amber-400/20 border border-amber-400/30 rounded-xl px-4 py-2.5 w-fit">
                <AlertTriangle size={15} className="text-amber-300" />
                <p className="text-sm font-semibold text-amber-100">
                  {stats.needsAction} request{stats.needsAction > 1 ? 's' : ''} need{stats.needsAction === 1 ? 's' : ''} your attention
                </p>
                <ChevronRight size={13} className="text-amber-300" />
              </div>
            )}
          </div>
        </div>

        {/* Quick status check */}
        <Card title="Check Request Status" className="mb-6">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Enter PA number (e.g. PA-2026-001234)…"
                value={statusSearch}
                onChange={e => setStatusSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleStatusCheck()}
                className="form-input pl-10"
              />
            </div>
            <Button onClick={handleStatusCheck} loading={searching} variant="primary">
              Check Status
            </Button>
          </div>

          {searchResult && (
            <div className="mt-4 p-4 bg-gray-50 rounded-2xl border border-gray-200 animate-slide-up">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-mono text-sm font-bold text-primary-700">{searchResult.pa_number}</p>
                  <p className="text-sm text-gray-600 mt-0.5">{searchResult.service_description}</p>
                </div>
                <StatusBadge status={searchResult.status} label={statusLabel(searchResult.status)} />
              </div>
              <PAProgressBar status={searchResult.status} step={searchResult.step} />
              <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
                <span>Submitted: {fmt.dateShort(searchResult.submitted_at)}</span>
                {searchResult.estimated_decision && searchResult.status === 'IN_REVIEW' && (
                  <span>Est. decision: {fmt.date(searchResult.estimated_decision)}</span>
                )}
              </div>
              <div className="mt-3">
                <Link href={`/requests/${searchResult.pa_id || '1'}`}>
                  <button className="text-sm text-primary-600 font-semibold hover:underline flex items-center gap-1">
                    View full details <ChevronRight size={13} />
                  </button>
                </Link>
              </div>
            </div>
          )}
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
          {/* Active requests */}
          <div className="lg:col-span-2">
            <Card
              title="Active Requests"
              subtitle="Requests currently in progress"
              noPad
              action={
                <Link href="/requests">
                  <button className="text-sm text-primary-600 font-semibold hover:underline">View all</button>
                </Link>
              }
            >
              {loading ? (
                <div className="flex justify-center py-10"><Spinner /></div>
              ) : activeRequests.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle size={36} />}
                  title="No active requests"
                  description="All your prior authorization requests have been decided."
                  action={<Link href="/requests"><Button size="sm" variant="outline">View all requests</Button></Link>}
                />
              ) : (
                activeRequests.map(r => (
                  <RequestRow key={r.pa_id} req={r} onClick={() => router.push(`/requests/${r.pa_id}`)} />
                ))
              )}
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Insurance card */}
            <Card title="My Insurance">
              <div className="space-y-2.5">
                <InfoRow label="Plan" value={member?.plan_name || 'BlueCross PPO Plus'} />
                <InfoRow label="Member ID" value={<span className="mono">{member?.member_id || 'MB12345678'}</span>} />
                <InfoRow label="Group #" value={<span className="mono">{member?.group_number || 'GRP123456'}</span>} />
                <InfoRow label="Eff. Date" value="01/01/2026" />
                <InfoRow label="Term Date" value="12/31/2026" />
              </div>
              <Button variant="outline" size="sm" icon={<Download size={13} />} className="w-full mt-4">
                Download Insurance Card
              </Button>
            </Card>

            {/* Quick actions */}
            <Card title="Quick Actions">
              <div className="space-y-2">
                <Link href="/requests">
                  <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors group">
                    <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center group-hover:bg-primary-100 transition-colors">
                      <FileText size={16} className="text-primary-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-800">View All Requests</p>
                      <p className="text-xs text-gray-400">See your full PA history</p>
                    </div>
                    <ChevronRight size={14} className="text-gray-300" />
                  </div>
                </Link>
                <Link href="/appeals">
                  <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors group">
                    <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center group-hover:bg-purple-100 transition-colors">
                      <Activity size={16} className="text-purple-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-800">File an Appeal</p>
                      <p className="text-xs text-gray-400">Challenge a denied request</p>
                    </div>
                    <ChevronRight size={14} className="text-gray-300" />
                  </div>
                </Link>
                <a href="tel:1-800-555-0100">
                  <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors group">
                    <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center group-hover:bg-green-100 transition-colors">
                      <Phone size={16} className="text-green-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-800">Call Member Services</p>
                      <p className="text-xs text-gray-400">1-800-555-0100</p>
                    </div>
                    <ChevronRight size={14} className="text-gray-300" />
                  </div>
                </a>
              </div>
            </Card>
          </div>
        </div>

        {/* Recent decisions */}
        {recentDecisions.length > 0 && (
          <Card title="Recent Decisions" subtitle="Your latest PA outcomes" noPad>
            {recentDecisions.map(r => (
              <RequestRow key={r.pa_id} req={r} onClick={() => router.push(`/requests/${r.pa_id}`)} />
            ))}
          </Card>
        )}
      </MemberLayout>
    </>
  );
};

// Request row component
const RequestRow: React.FC<{ req: MemberPARequest; onClick: () => void }> = ({ req, onClick }) => {
  const needsAction = req.status === 'PENDING_INFO';
  const daysLeft = daysUntilExpiry(req.auth_valid_through);

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-4 px-5 py-4 border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-all last:border-0',
        needsAction && 'bg-amber-50/40 hover:bg-amber-50'
      )}
    >
      {needsAction && (
        <div className="w-1.5 h-12 bg-amber-400 rounded-full flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="font-mono text-xs font-bold text-primary-600">{req.pa_number}</p>
          {needsAction && (
            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Action Needed</span>
          )}
        </div>
        <p className="text-sm font-semibold text-gray-900 truncate">{req.service_description}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {req.provider_name} · Submitted {fmt.dateShort(req.submitted_at)}
        </p>
        {req.status === 'APPROVED' && daysLeft !== null && daysLeft >= 0 && (
          <p className={cn('text-xs mt-0.5 font-medium', daysLeft <= 30 ? 'text-orange-600' : 'text-green-600')}>
            Auth valid through {fmt.dateShort(req.auth_valid_through)} ({daysLeft}d remaining)
          </p>
        )}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <StatusBadge status={req.status} label={statusLabel(req.status)} />
        <ChevronRight size={15} className="text-gray-300" />
      </div>
    </div>
  );
};

// PA progress bar (5 steps)
const PAProgressBar: React.FC<{ status: string; step?: number }> = ({ status, step }) => {
  const steps = ['Submitted', 'In Review', 'Decision Pending', 'Decided', 'Complete'];
  const current = step ?? (
    status === 'SUBMITTED' ? 0 :
    status === 'IN_REVIEW' || status === 'PENDING_INFO' ? 1 :
    ['APPROVED', 'DENIED'].includes(status) ? 3 : 2
  );
  return (
    <div className="flex items-center gap-0 mt-1">
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          <div className="flex flex-col items-center">
            <div className={cn(
              'w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold',
              i < current ? 'bg-green-500 text-white' :
              i === current ? 'bg-primary-600 text-white' :
              'bg-gray-200 text-gray-400'
            )}>
              {i < current ? '✓' : i + 1}
            </div>
            <p className={cn('text-[9px] mt-1 font-medium', i <= current ? 'text-gray-700' : 'text-gray-300')}>
              {s}
            </p>
          </div>
          {i < steps.length - 1 && (
            <div className={cn('flex-1 h-0.5 mb-3 mx-0.5', i < current ? 'bg-green-400' : 'bg-gray-200')} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-center justify-between py-1.5">
    <span className="text-xs font-medium text-gray-400">{label}</span>
    <span className="text-sm font-semibold text-gray-800">{value}</span>
  </div>
);

function mockRequests() {
  return [
    {
      pa_id: '1', pa_number: 'PA-2026-001234', service_description: 'MRI Lumbar Spine without contrast',
      provider_name: 'Dr. Robert Smith', status: 'APPROVED', submitted_at: new Date(Date.now() - 7 * 86400000).toISOString(),
      auth_valid_through: new Date(Date.now() + 90 * 86400000).toISOString(), auth_number: 'AUTH-882341',
    },
    {
      pa_id: '2', pa_number: 'PA-2026-001241', service_description: 'Physical Therapy — 12 sessions',
      provider_name: 'Active Health PT', status: 'IN_REVIEW', submitted_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
    {
      pa_id: '3', pa_number: 'PA-2026-001245', service_description: 'Humira 40mg Injection × 2',
      provider_name: 'City Rheumatology', status: 'PENDING_INFO', submitted_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    },
    {
      pa_id: '4', pa_number: 'PA-2026-001198', service_description: 'CT Chest with contrast',
      provider_name: 'Metro Imaging Center', status: 'DENIED', submitted_at: new Date(Date.now() - 14 * 86400000).toISOString(),
    },
  ];
}

export default MemberDashboard;
