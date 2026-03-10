import React, { useState, useEffect } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import AdminLayout from '../components/layout/Layout';
import { Card, Button, Badge, Modal, Alert, Spinner, EmptyState } from '../components/ui';
import { caseApi } from '../lib/api';
import { fmt, cn, statusBadgeClass, downloadBlob } from '../lib/utils';
import toast from 'react-hot-toast';
import {
  Search, Filter, Download, RefreshCw, X, ChevronRight,
  User, Clock, AlertTriangle, CheckCircle, XCircle, Eye
} from 'lucide-react';

const STATUSES = ['ALL', 'SUBMITTED', 'IN_REVIEW', 'PENDING_INFO', 'APPROVED', 'DENIED'];
const URGENCIES = ['ALL', 'ROUTINE', 'URGENT', 'EMERGENCY'];
const PAYERS = ['ALL', 'UnitedHealthcare', 'Aetna', 'BlueCross', 'Cigna', 'CVS Caremark'];

const CasesPage: NextPage = () => {
  const [cases, setCases]         = useState<any[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [status, setStatus]       = useState('ALL');
  const [urgency, setUrgency]     = useState('ALL');
  const [payer, setPayer]         = useState('ALL');
  const [page, setPage]           = useState(1);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [detailCase, setDetailCase] = useState<any>(null);
  const [reassignModal, setReassignModal] = useState<any>(null);
  const [exporting, setExporting] = useState(false);
  const PER_PAGE = 20;

  const load = async () => {
    setLoading(true);
    try {
      const res = await caseApi.list({
        status: status === 'ALL' ? undefined : status,
        urgency: urgency === 'ALL' ? undefined : urgency,
        payer: payer === 'ALL' ? undefined : payer,
        search: search || undefined,
        page, limit: PER_PAGE,
      });
      setCases(res.data.items || []); setTotal(res.data.total || 0);
    } catch {
      const all = mockCases();
      const filtered = all.filter(c =>
        (status === 'ALL' || c.status === status) &&
        (urgency === 'ALL' || c.urgency === urgency) &&
        (payer === 'ALL' || c.payer === payer) &&
        (!search || c.pa_number.includes(search.toUpperCase()) || c.member_name.toLowerCase().includes(search.toLowerCase()) || c.service_description.toLowerCase().includes(search.toLowerCase()))
      );
      setCases(filtered.slice((page-1)*PER_PAGE, page*PER_PAGE)); setTotal(filtered.length);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [status, urgency, payer, page]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await caseApi.export({ status, payer, urgency });
      downloadBlob(res.data, `pa_cases_${new Date().toISOString().slice(0,10)}.csv`);
    } catch {
      toast.success('Export started (demo: CSV would download)');
    } finally { setExporting(false); }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAll = () => setSelected(cases.length === selected.size ? new Set() : new Set(cases.map(c => c.case_id)));

  const urgencyBadge = (u: string) => {
    const map: Record<string,string> = { EMERGENCY:'badge-red', URGENT:'badge-orange', ROUTINE:'badge-gray' };
    return map[u] || 'badge-gray';
  };

  return (
    <>
      <Head><title>All Cases | PA Admin</title></Head>
      <AdminLayout title="All Cases">
        {/* Filters */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text" placeholder="Search PA#, member, service…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && load()}
                className="form-input pl-9"
              />
            </div>
            <select className="form-input w-auto" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            <select className="form-input w-auto" value={urgency} onChange={e => { setUrgency(e.target.value); setPage(1); }}>
              {URGENCIES.map(u => <option key={u}>{u}</option>)}
            </select>
            <select className="form-input w-auto" value={payer} onChange={e => { setPayer(e.target.value); setPage(1); }}>
              {PAYERS.map(p => <option key={p}>{p}</option>)}
            </select>
            <Button variant="outline" size="sm" icon={<RefreshCw size={12} />} onClick={load} loading={loading}>Refresh</Button>
            <Button variant="outline" size="sm" icon={<Download size={12} />} onClick={handleExport} loading={exporting}>Export CSV</Button>
          </div>

          {selected.size > 0 && (
            <div className="flex items-center gap-2 py-2 px-3 bg-primary-50 rounded-lg border border-primary-200">
              <span className="text-xs font-semibold text-primary-700">{selected.size} case{selected.size > 1 ? 's' : ''} selected</span>
              <button className="text-xs text-primary-600 hover:underline ml-2" onClick={() => setReassignModal({ ids: Array.from(selected) })}>Bulk Reassign</button>
              <button onClick={() => setSelected(new Set())} className="ml-auto text-slate-400 hover:text-slate-600"><X size={13} /></button>
            </div>
          )}
        </div>

        <Card noPad>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
            <p className="text-xs text-slate-500 font-medium">{total.toLocaleString()} cases</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
                className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg hover:bg-white disabled:opacity-40 font-medium bg-white">Prev</button>
              <span className="px-2.5 py-1 text-xs text-slate-500">Page {page}</span>
              <button onClick={() => setPage(p => p+1)} disabled={cases.length < PER_PAGE}
                className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg hover:bg-white disabled:opacity-40 font-medium bg-white">Next</button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : cases.length === 0 ? (
            <EmptyState icon={<Filter size={32} />} title="No cases match your filters" description="Try adjusting the filters above" />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-10">
                      <input type="checkbox" checked={selected.size === cases.length && cases.length > 0}
                        onChange={selectAll} className="rounded" />
                    </th>
                    <th>PA Number</th>
                    <th>Member</th>
                    <th>Service</th>
                    <th>Payer</th>
                    <th>Urgency</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    <th>Reviewer</th>
                    <th>Deadline</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map(c => {
                    const sla_warning = c.deadline && new Date(c.deadline) < new Date(Date.now() + 4*3600000);
                    return (
                      <tr key={c.case_id} className={cn(sla_warning && 'bg-red-50/40')}>
                        <td>
                          <input type="checkbox" checked={selected.has(c.case_id)}
                            onChange={() => toggleSelect(c.case_id)} className="rounded" />
                        </td>
                        <td className="font-mono text-xs font-bold text-primary-600">{c.pa_number}</td>
                        <td>
                          <div>
                            <p className="font-semibold text-slate-800">{c.member_name}</p>
                            <p className="text-[10px] text-slate-400 mono">{c.member_id}</p>
                          </div>
                        </td>
                        <td className="max-w-[140px] truncate text-xs">{c.service_description}</td>
                        <td className="text-xs text-slate-500">{c.payer}</td>
                        <td><span className={cn('badge', urgencyBadge(c.urgency))}>{c.urgency}</span></td>
                        <td className="text-xs text-slate-500 whitespace-nowrap">{fmt.date(c.submitted_at)}</td>
                        <td><span className={cn('badge', statusBadgeClass(c.status))}>{c.status.replace(/_/g,' ')}</span></td>
                        <td className="text-xs text-slate-500">{c.reviewer_name || <span className="text-orange-500">Unassigned</span>}</td>
                        <td className="whitespace-nowrap">
                          {c.deadline ? (
                            <span className={cn('text-xs font-semibold', sla_warning ? 'text-red-600 flex items-center gap-1' : 'text-slate-500')}>
                              {sla_warning && <AlertTriangle size={11} />}
                              {fmt.date(c.deadline)}
                            </span>
                          ) : '—'}
                        </td>
                        <td>
                          <div className="flex gap-1">
                            <button onClick={() => setDetailCase(c)}
                              className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors">
                              <Eye size={13} />
                            </button>
                            <button onClick={() => setReassignModal({ ids: [c.case_id], name: c.pa_number })}
                              className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors">
                              <User size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Detail modal */}
        {detailCase && (
          <Modal isOpen={!!detailCase} onClose={() => setDetailCase(null)} title={`Case: ${detailCase.pa_number}`} size="lg">
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                {[
                  ['PA Number', detailCase.pa_number],
                  ['Status', detailCase.status],
                  ['Member', detailCase.member_name],
                  ['Member ID', detailCase.member_id],
                  ['Service', detailCase.service_description],
                  ['Payer', detailCase.payer],
                  ['Urgency', detailCase.urgency],
                  ['Submitted', fmt.dateTime(detailCase.submitted_at)],
                  ['Reviewer', detailCase.reviewer_name || 'Unassigned'],
                  ['Deadline', fmt.date(detailCase.deadline)],
                ].map(([k, v]) => (
                  <div key={k} className="py-2 border-b border-slate-50">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">{k}</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{v || '—'}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => { setDetailCase(null); setReassignModal({ ids: [detailCase.case_id] }); }}>
                  Reassign Case
                </Button>
                <Button size="sm" variant="danger" onClick={() => { toast.success('Override queued'); setDetailCase(null); }}>
                  Admin Override
                </Button>
              </div>
            </div>
          </Modal>
        )}

        {/* Reassign modal */}
        {reassignModal && (
          <ReassignModal
            ids={reassignModal.ids}
            label={reassignModal.name || `${reassignModal.ids.length} cases`}
            onClose={() => setReassignModal(null)}
            onDone={() => { setReassignModal(null); setSelected(new Set()); load(); }}
          />
        )}
      </AdminLayout>
    </>
  );
};

const ReassignModal: React.FC<{ ids: string[]; label: string; onClose: () => void; onDone: () => void }> = ({ ids, label, onClose, onDone }) => {
  const reviewers = [
    { id: 'r1', name: 'Dr. James Kim, MD',  queue: 18, role: 'MD' },
    { id: 'r2', name: 'Sarah Parker, RN',   queue: 22, role: 'RN' },
    { id: 'r3', name: 'Mike Torres, RN',    queue: 15, role: 'RN' },
    { id: 'r4', name: 'Dr. Lisa Wong, MD',  queue: 12, role: 'MD' },
    { id: 'r5', name: 'Carol James, RN',    queue: 28, role: 'RN' },
  ];
  const [selected, setSelected] = useState('');
  const [saving, setSaving]     = useState(false);

  const handleSave = async () => {
    if (!selected) { toast.error('Select a reviewer'); return; }
    setSaving(true);
    try {
      await Promise.all(ids.map(id => caseApi.reassign(id, selected)));
      toast.success(`${ids.length} case(s) reassigned`);
      onDone();
    } catch {
      toast.success(`${ids.length} case(s) reassigned (demo mode)`);
      onDone();
    } finally { setSaving(false); }
  };

  return (
    <Modal isOpen title={`Reassign: ${label}`} onClose={onClose} size="sm"
      footer={<div className="flex gap-2 justify-end"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={handleSave} loading={saving}>Reassign</Button></div>}>
      <div className="space-y-2">
        {reviewers.map(r => (
          <div key={r.id} onClick={() => setSelected(r.id)}
            className={cn('flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all',
              selected === r.id ? 'border-primary-500 bg-primary-50' : 'border-slate-200 hover:border-slate-300'
            )}>
            <div className="flex items-center gap-2">
              <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white', r.role === 'MD' ? 'bg-purple-500' : 'bg-blue-500')}>
                {r.name[0]}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-800">{r.name}</p>
                <p className="text-[10px] text-slate-400">{r.role} · {r.queue} in queue</p>
              </div>
            </div>
            {selected === r.id && <CheckCircle size={16} className="text-primary-600" />}
          </div>
        ))}
      </div>
    </Modal>
  );
};

function mockCases() {
  const statuses = ['SUBMITTED','IN_REVIEW','PENDING_INFO','APPROVED','DENIED'];
  const urgencies = ['ROUTINE','ROUTINE','ROUTINE','URGENT','EMERGENCY'];
  const payers = ['UnitedHealthcare','Aetna','BlueCross','Cigna','CVS Caremark'];
  const reviewers = ['Dr. James Kim, MD','Sarah Parker, RN','Mike Torres, RN',null,null];
  const services = ['MRI Lumbar Spine','Physical Therapy','Humira 40mg','CT Chest','Knee Arthroscopy','Cardiac Stress Test','Colonoscopy'];
  return Array.from({ length: 80 }, (_, i) => ({
    case_id: `c${i+1}`,
    pa_number: `PA-2026-${String(100200+i).padStart(6,'0')}`,
    member_name: ['Sarah Johnson','Robert Davis','Maria Garcia','James Wilson','Linda Brown'][i%5],
    member_id: `MB${String(10000000+i*37).slice(0,8)}`,
    service_description: services[i%services.length],
    payer: payers[i%payers.length],
    urgency: urgencies[i%urgencies.length],
    status: statuses[i%statuses.length],
    submitted_at: new Date(Date.now() - (i+1)*3600000*8).toISOString(),
    reviewer_name: reviewers[i%reviewers.length],
    deadline: new Date(Date.now() + (i%3===0 ? 2 : 48)*3600000).toISOString(),
  }));
}

export default CasesPage;
