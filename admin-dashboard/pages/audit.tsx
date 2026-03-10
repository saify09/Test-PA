import React, { useState, useEffect } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import AdminLayout from '../components/layout/Layout';
import { Card, Button, Spinner, EmptyState, Badge } from '../components/ui';
import { auditApi } from '../lib/api';
import { fmt, cn, downloadBlob } from '../lib/utils';
import toast from 'react-hot-toast';
import { Search, Download, RefreshCw, Shield, Filter } from 'lucide-react';

const ACTIONS = ['ALL','LOGIN','LOGOUT','CASE_VIEW','CASE_DECISION','CASE_OVERRIDE','USER_CREATE','USER_UPDATE','USER_DISABLE','CONFIG_CHANGE','EXPORT','APPEAL_DECISION'];
const RESOURCES = ['ALL','case','user','config','report','appeal','auth'];

const AuditPage: NextPage = () => {
  const [logs, setLogs]     = useState<any[]>([]);
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('ALL');
  const [resource, setResource] = useState('ALL');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [page, setPage]     = useState(1);
  const [exporting, setExporting] = useState(false);
  const PER_PAGE = 25;

  const load = async () => {
    setLoading(true);
    try {
      const res = await auditApi.list({
        action: action === 'ALL' ? undefined : action,
        resource: resource === 'ALL' ? undefined : resource,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page, limit: PER_PAGE,
      });
      setLogs(res.data.items || []); setTotal(res.data.total || 0);
    } catch {
      setLogs(mockAuditLogs()); setTotal(200);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [action, resource, page]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await auditApi.export({ action, resource, date_from: dateFrom, date_to: dateTo });
      downloadBlob(res.data, `audit_log_${new Date().toISOString().slice(0,10)}.csv`);
    } catch {
      toast.success('Audit export started (demo)');
    } finally { setExporting(false); }
  };

  const displayed = logs.filter(l =>
    !search ||
    l.user_name?.toLowerCase().includes(search.toLowerCase()) ||
    l.action?.toLowerCase().includes(search.toLowerCase()) ||
    l.resource_id?.toLowerCase().includes(search.toLowerCase())
  );

  const actionColor = (a: string) => {
    if (a.includes('LOGIN'))  return 'badge-blue';
    if (a.includes('DELETE') || a.includes('DISABLE') || a.includes('OVERRIDE')) return 'badge-red';
    if (a.includes('CREATE') || a.includes('APPROVE')) return 'badge-green';
    if (a.includes('UPDATE') || a.includes('CHANGE'))  return 'badge-orange';
    return 'badge-gray';
  };

  return (
    <>
      <Head><title>Audit Log | PA Admin</title></Head>
      <AdminLayout title="Audit Log">
        {/* HIPAA notice */}
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-4">
          <Shield size={14} className="text-blue-600 flex-shrink-0" />
          <p className="text-xs text-blue-700 font-medium">All user actions are logged per HIPAA §164.312(b). Logs are retained for 6 years and are tamper-evident.</p>
        </div>

        {/* Filters */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search user, action, resource ID…" value={search}
              onChange={e => setSearch(e.target.value)} className="form-input pl-9" />
          </div>
          <select className="form-input w-auto" value={action} onChange={e => { setAction(e.target.value); setPage(1); }}>
            {ACTIONS.map(a => <option key={a}>{a}</option>)}
          </select>
          <select className="form-input w-auto" value={resource} onChange={e => { setResource(e.target.value); setPage(1); }}>
            {RESOURCES.map(r => <option key={r}>{r}</option>)}
          </select>
          <input type="date" className="form-input w-auto" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <input type="date" className="form-input w-auto" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          <Button variant="outline" size="sm" icon={<RefreshCw size={11} />} onClick={load} loading={loading}>Refresh</Button>
          <Button variant="outline" size="sm" icon={<Download size={11} />} onClick={handleExport} loading={exporting}>Export</Button>
        </div>

        <Card noPad>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
            <p className="text-xs text-slate-500">{total.toLocaleString()} log entries</p>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
                className="px-2.5 py-1 text-xs border border-slate-200 rounded hover:bg-white disabled:opacity-40 bg-white">Prev</button>
              <span className="px-2 py-1 text-xs text-slate-400">p.{page}</span>
              <button onClick={() => setPage(p => p+1)} disabled={displayed.length < PER_PAGE}
                className="px-2.5 py-1 text-xs border border-slate-200 rounded hover:bg-white disabled:opacity-40 bg-white">Next</button>
            </div>
          </div>
          {loading ? <div className="flex justify-center py-10"><Spinner /></div> : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th><th>User</th><th>Action</th>
                    <th>Resource</th><th>Resource ID</th><th>IP Address</th><th>Result</th><th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((l, i) => (
                    <tr key={i}>
                      <td className="mono text-xs text-slate-400 whitespace-nowrap">{fmt.dateTime(l.timestamp)}</td>
                      <td>
                        <div>
                          <p className="text-xs font-semibold text-slate-700">{l.user_name}</p>
                          <p className="text-[10px] text-slate-400">{l.user_role?.replace(/_/g,' ')}</p>
                        </div>
                      </td>
                      <td><span className={cn('badge', actionColor(l.action))}>{l.action.replace(/_/g,' ')}</span></td>
                      <td className="text-xs text-slate-500">{l.resource}</td>
                      <td className="mono text-xs text-primary-600">{l.resource_id||'—'}</td>
                      <td className="mono text-xs text-slate-400">{l.ip_address}</td>
                      <td>
                        <span className={cn('badge', l.result==='SUCCESS'?'badge-green':'badge-red')}>
                          {l.result}
                        </span>
                      </td>
                      <td className="text-xs text-slate-500 max-w-[180px] truncate" title={l.details}>{l.details||'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </AdminLayout>
    </>
  );
};

function mockAuditLogs() {
  const actions = ['CASE_VIEW','CASE_DECISION','LOGIN','LOGOUT','USER_UPDATE','CASE_OVERRIDE','CONFIG_CHANGE','EXPORT','APPEAL_DECISION'];
  const users = [
    { name:'Dr. James Kim', role:'REVIEWER_MD' },
    { name:'Sarah Parker', role:'REVIEWER_RN' },
    { name:'System Admin', role:'SUPER_ADMIN' },
    { name:'Anna Davis', role:'OPS_ADMIN' },
  ];
  const resources = ['case','user','config','appeal'];
  return Array.from({ length: 25 }, (_, i) => {
    const u = users[i % users.length];
    const a = actions[i % actions.length];
    return {
      timestamp: new Date(Date.now() - i * 1800000).toISOString(),
      user_name: u.name, user_role: u.role,
      action: a, resource: resources[i % resources.length],
      resource_id: a.includes('CASE') ? `PA-2026-${String(101200+i*7).padStart(6,'0')}` : a.includes('USER') ? `u${i+1}` : null,
      ip_address: `10.${i%4+1}.${i%255}.${(i*7)%255}`,
      result: i % 12 === 0 ? 'FAILURE' : 'SUCCESS',
      details: a==='CASE_DECISION' ? 'Decision: APPROVED, Criteria: MCG-002' : a==='LOGIN' ? 'MFA verified' : a==='CONFIG_CHANGE' ? 'Changed ai_confidence_threshold: 0.82→0.85' : null,
    };
  });
}

export default AuditPage;
