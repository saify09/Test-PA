import type { MemberPARequest } from '../../lib/types';
import React, { useState, useEffect } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import MemberLayout from '../../components/layout/Layout';
import { Card, StatusBadge, Spinner, EmptyState, Button } from '../../components/ui';
import { paApi } from '../../lib/api';
import { fmt, statusLabel, cn, downloadBlob } from '../../lib/utils';
import {
  FileText, ChevronRight, Search, Filter, X,
  Clock, CheckCircle, AlertTriangle, RefreshCw, Download
} from 'lucide-react';

const STATUS_TABS = [
  { id: 'ALL',          label: 'All',          icon: null },
  { id: 'ACTIVE',       label: 'Active',       icon: <Clock size={13} /> },
  { id: 'APPROVED',     label: 'Approved',     icon: <CheckCircle size={13} /> },
  { id: 'DENIED',       label: 'Denied',       icon: null },
  { id: 'PENDING_INFO', label: 'Needs Action', icon: <AlertTriangle size={13} /> },
];

const RequestsPage: NextPage = () => {
  const router = useRouter();
  const [requests, setRequests] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const PER_PAGE = 10;

  useEffect(() => { load(); }, [activeTab, page]);

  // PR-004: Download all PA letters
  const downloadAll = async () => {
    setDownloading(true);
    try {
      const res = await paApi.downloadAllLetters();
      downloadBlob(res.data, `PA_Letters_${new Date().toISOString().slice(0,10)}.zip`);
    } catch {
      const lines = requests.map((r: any) =>
        `${r.pa_number} | ${r.service_description} | ${r.status} | ${fmt.dateShort(r.submitted_at)}`
      ).join('\n');
      const blob = new Blob([`PA Request History\n${lines}`], { type: 'text/plain' });
      downloadBlob(blob, `PA_History_${new Date().toISOString().slice(0,10)}.txt`);
    } finally { setDownloading(false); }
  };

  const load = async () => {
    setLoading(true);
    try {
      const statusParam = activeTab === 'ALL' ? undefined
        : activeTab === 'ACTIVE' ? 'SUBMITTED,IN_REVIEW,PENDING_INFO' : activeTab;
      const res = await paApi.list({ status: statusParam, page, limit: PER_PAGE });
      setRequests(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch {
      const all = mockRequests();
      const filtered = activeTab === 'ALL' ? all
        : activeTab === 'ACTIVE' ? all.filter(r => ['SUBMITTED', 'IN_REVIEW', 'PENDING_INFO'].includes(r.status))
        : all.filter(r => r.status === activeTab);
      setRequests(filtered);
      setTotal(filtered.length);
    } finally {
      setLoading(false);
    }
  };

  const displayed = requests.filter(r =>
    !search ||
    r.pa_number?.toLowerCase().includes(search.toLowerCase()) ||
    r.service_description?.toLowerCase().includes(search.toLowerCase()) ||
    r.provider_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <Head><title>My Requests | MyHealthPA</title></Head>
      <MemberLayout title="My Prior Authorization Requests">
        {/* Search */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by PA number, service, or provider…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="form-input pl-10"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            )}
          </div>
          <button onClick={load} className="p-3 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors border border-gray-200 bg-white">
            <RefreshCw size={16} />
          </button>
          {/* PR-004: Download all PA letters */}
          <button
            onClick={downloadAll}
            disabled={downloading || requests.length === 0}
            title="Download all PA letters"
            className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-200 rounded-xl transition-colors disabled:opacity-40"
          >
            <Download size={15} />
            {downloading ? 'Downloading…' : 'Download All'}
          </button>
        </div>

        {/* Status tabs */}
        <div className="flex gap-1.5 mb-4 flex-wrap">
          {STATUS_TABS.map(tab => {
            const count = tab.id === 'ALL' ? total
              : tab.id === 'ACTIVE' ? mockRequests().filter(r => ['SUBMITTED', 'IN_REVIEW', 'PENDING_INFO'].includes(r.status)).length
              : mockRequests().filter(r => r.status === tab.id).length;
            return (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setPage(1); }}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all',
                  activeTab === tab.id
                    ? 'bg-primary-700 text-white shadow-sm'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                )}
              >
                {tab.icon} {tab.label}
                <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-bold ml-0.5',
                  activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* List */}
        <Card noPad>
          {loading ? (
            <div className="flex justify-center py-14"><Spinner /></div>
          ) : displayed.length === 0 ? (
            <EmptyState
              icon={<FileText size={40} />}
              title="No requests found"
              description={search ? 'Try a different search term' : 'You have no prior authorization requests yet'}
            />
          ) : (
            <>
              {displayed.map(r => <RequestCard key={r.pa_id} req={r} onClick={() => router.push(`/requests/${r.pa_id}`)} />)}
              {/* Pagination */}
              {total > PER_PAGE && (
                <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
                  <p className="text-sm text-gray-500">Showing {displayed.length} of {total} requests</p>
                  <div className="flex gap-1">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                      className="px-3 py-1.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-100 disabled:opacity-40 bg-white font-medium transition-colors">
                      Previous
                    </button>
                    <button onClick={() => setPage(p => p + 1)} disabled={displayed.length < PER_PAGE}
                      className="px-3 py-1.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-100 disabled:opacity-40 bg-white font-medium transition-colors">
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </MemberLayout>
    </>
  );
};

const RequestCard: React.FC<{ req: MemberPARequest; onClick: () => void }> = ({ req, onClick }) => {
  const needsAction = req.status === 'PENDING_INFO';
  return (
    <div
      onClick={onClick}
      className={cn(
        'group flex items-center gap-4 px-5 py-4 border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-all last:border-0',
        needsAction && 'bg-amber-50/50'
      )}
    >
      {/* Icon */}
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
        req.status === 'APPROVED' ? 'bg-green-100' :
        req.status === 'DENIED' ? 'bg-red-100' :
        needsAction ? 'bg-amber-100' : 'bg-blue-100'
      )}>
        <FileText size={18} className={
          req.status === 'APPROVED' ? 'text-green-600' :
          req.status === 'DENIED' ? 'text-red-600' :
          needsAction ? 'text-amber-600' : 'text-blue-600'
        } />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-mono text-xs font-bold text-primary-600">{req.pa_number}</span>
          {needsAction && <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded">Action Needed</span>}
          {req.status === 'APPEALING' && <span className="text-[10px] bg-purple-100 text-purple-700 font-bold px-1.5 py-0.5 rounded">Under Appeal</span>}
        </div>
        <p className="text-sm font-bold text-gray-900 truncate">{req.service_description}</p>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-gray-400">{req.provider_name}</span>
          <span className="text-gray-300">·</span>
          <span className="text-xs text-gray-400">Submitted {fmt.dateShort(req.submitted_at)}</span>
          {req.decision_date && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-gray-400">Decided {fmt.dateShort(req.decision_date)}</span>
            </>
          )}
        </div>
        {req.status === 'APPROVED' && req.auth_number && (
          <p className="text-xs font-mono text-green-600 font-semibold mt-0.5">Auth #{req.auth_number}</p>
        )}
        {needsAction && req.pend_reason && (
          <p className="text-xs text-amber-700 mt-0.5 font-medium">📎 {req.pend_reason}</p>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <StatusBadge status={req.status} label={statusLabel(req.status)} />
        <ChevronRight size={15} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
      </div>
    </div>
  );
};

function mockRequests() {
  return [
    { pa_id: '1', pa_number: 'PA-2026-001234', service_description: 'MRI Lumbar Spine without contrast', provider_name: 'Dr. Robert Smith', status: 'APPROVED', submitted_at: new Date(Date.now() - 7 * 86400000).toISOString(), decision_date: new Date(Date.now() - 5 * 86400000).toISOString(), auth_number: 'AUTH-882341', auth_valid_through: new Date(Date.now() + 90 * 86400000).toISOString() },
    { pa_id: '2', pa_number: 'PA-2026-001241', service_description: 'Physical Therapy — 12 sessions', provider_name: 'Active Health PT', status: 'IN_REVIEW', submitted_at: new Date(Date.now() - 2 * 86400000).toISOString() },
    { pa_id: '3', pa_number: 'PA-2026-001245', service_description: 'Humira 40mg Injection × 2', provider_name: 'City Rheumatology', status: 'PENDING_INFO', submitted_at: new Date(Date.now() - 3 * 86400000).toISOString(), pend_reason: 'Additional clinical notes required' },
    { pa_id: '4', pa_number: 'PA-2026-001198', service_description: 'CT Chest with contrast', provider_name: 'Metro Imaging Center', status: 'DENIED', submitted_at: new Date(Date.now() - 14 * 86400000).toISOString(), decision_date: new Date(Date.now() - 12 * 86400000).toISOString() },
    { pa_id: '5', pa_number: 'PA-2026-001152', service_description: 'Knee Arthroscopy', provider_name: 'Orthopedic Associates', status: 'APPEALING', submitted_at: new Date(Date.now() - 21 * 86400000).toISOString(), decision_date: new Date(Date.now() - 18 * 86400000).toISOString() },
    { pa_id: '6', pa_number: 'PA-2026-001089', service_description: 'Cardiac Stress Test', provider_name: 'Heart Health Clinic', status: 'APPROVED', submitted_at: new Date(Date.now() - 45 * 86400000).toISOString(), decision_date: new Date(Date.now() - 43 * 86400000).toISOString(), auth_number: 'AUTH-774421' },
  ];
}

export default RequestsPage;
