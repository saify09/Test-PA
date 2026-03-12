import type { QueueItem, QueueMetrics } from '../lib/types';
import React, { useState, useEffect } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Layout from '../components/layout/Layout';
import { Card, Button, Spinner, EmptyState, Alert } from '../components/ui';
import { queueApi } from '../lib/api';
import { fmt, deadlineLabel, urgencyClass, cn } from '../lib/utils';
import {
  Search, Filter, RefreshCw, Play, UserPlus, Clock,
  ChevronRight, AlertTriangle, CheckSquare, SlidersHorizontal,
  Activity, TrendingUp, X
} from 'lucide-react';

interface QueueCase {
  pa_id: string; pa_number: string; patient_name: string; member_id: string;
  service_type: string; service_description: string; procedure_code: string;
  primary_diagnosis: string; urgency: string; status: string;
  received_at: string; deadline: string; days_in_queue: number;
  ai_score: number; ai_recommendation: string;
  assigned_to?: string; assigned_name?: string;
  priority_score: number; payer: string; doc_complete: boolean;
}

const URGENCY_OPTIONS = ['ALL', 'EMERGENT', 'URGENT', 'ROUTINE'];
const AI_REC_OPTIONS = ['ALL', 'APPROVE', 'DENY', 'REVIEW_REQUIRED'];
const SORT_OPTIONS = [
  { value: 'priority_score', label: 'Priority Score' },
  { value: 'deadline',       label: 'Deadline (Soonest)' },
  { value: 'received_at',    label: 'Received Date' },
  { value: 'ai_score',       label: 'AI Confidence' },
];

const QueuePage: NextPage = () => {
  const router = useRouter();
  const [cases, setCases] = useState<QueueCase[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState(router.query.urgency as string || 'ALL');
  const [aiFilter, setAiFilter] = useState('ALL');
  const [assignedFilter, setAssignedFilter] = useState(router.query.assigned === 'me' ? 'ME' : 'ALL');
  const [sortBy, setSortBy] = useState('priority_score');
  const [showFilters, setShowFilters] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);

  const PER_PAGE = 20;

  useEffect(() => { load(); }, [urgencyFilter, aiFilter, assignedFilter, sortBy, page]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await queueApi.list({
        urgency: urgencyFilter !== 'ALL' ? urgencyFilter : undefined,
        ai_recommendation: aiFilter !== 'ALL' ? aiFilter : undefined,
        assigned_to: assignedFilter === 'ME' ? 'me' : undefined,
        sort_by: sortBy, sort_dir: 'asc',
        page, limit: PER_PAGE,
      });
      setCases(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch {
      setCases(mockCases());
      setTotal(mockCases().length);
    } finally {
      setLoading(false);
    }
  };

  const handleSelfAssign = async (pa_id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAssigning(pa_id);
    try {
      await queueApi.selfAssign(pa_id);
      setCases(prev => prev.map(c => c.pa_id === pa_id ? { ...c, assigned_name: 'Me', assigned_to: 'me' } : c));
    } catch {
      setCases(prev => prev.map(c => c.pa_id === pa_id ? { ...c, assigned_name: 'Me' } : c));
    } finally {
      setAssigning(null);
    }
  };

  const filtered = cases.filter(c =>
    !search ||
    c.patient_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.pa_number?.toLowerCase().includes(search.toLowerCase()) ||
    c.member_id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <Head><title>Review Queue | Workbench</title></Head>
      <Layout title="Review Queue">
        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text" placeholder="Search patient, PA#, member ID…"
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
              />
              {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={13} /></button>}
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn('p-2 rounded-lg border transition-colors',
                showFilters ? 'bg-blue-50 border-blue-200 text-blue-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              )}
            >
              <SlidersHorizontal size={16} />
            </button>
            <button onClick={load} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <RefreshCw size={15} />
            </button>
          </div>
          <p className="text-sm text-gray-500 self-center">{total} cases in queue</p>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="card mb-4 animate-fade-in">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="form-label">Urgency</label>
                <select className="form-input bg-white" value={urgencyFilter} onChange={e => setUrgencyFilter(e.target.value)}>
                  {URGENCY_OPTIONS.map(o => <option key={o} value={o}>{o === 'ALL' ? 'All Urgency' : o}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">AI Recommendation</label>
                <select className="form-input bg-white" value={aiFilter} onChange={e => setAiFilter(e.target.value)}>
                  {AI_REC_OPTIONS.map(o => <option key={o} value={o}>{o === 'ALL' ? 'All Recommendations' : o.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Assigned To</label>
                <select className="form-input bg-white" value={assignedFilter} onChange={e => setAssignedFilter(e.target.value)}>
                  <option value="ALL">All Reviewers</option>
                  <option value="ME">Assigned to Me</option>
                  <option value="UNASSIGNED">Unassigned Only</option>
                </select>
              </div>
              <div>
                <label className="form-label">Sort By</label>
                <select className="form-input bg-white" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                  {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Urgency quick-filter tabs */}
        <div className="flex gap-1 mb-3">
          {URGENCY_OPTIONS.map(u => (
            <button key={u} onClick={() => setUrgencyFilter(u)}
              className={cn('px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                urgencyFilter === u ? 'bg-blue-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              )}>
              {u === 'ALL' ? `All (${total})` : u}
            </button>
          ))}
        </div>

        {/* Queue table */}
        <Card noPad>
          {loading ? (
            <div className="flex items-center justify-center py-20"><Spinner size={28} /></div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={<CheckSquare size={36} />} title="Queue is empty" description="No cases match your current filters." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Priority</th>
                      <th>PA / Patient</th>
                      <th>Service</th>
                      <th>Diagnosis</th>
                      <th>Urgency</th>
                      <th>Deadline</th>
                      <th>AI Score</th>
                      <th>AI Rec</th>
                      <th>Assigned</th>
                      <th>Docs</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(c => {
                      const dl = deadlineLabel(c.deadline);
                      return (
                        <tr key={c.pa_id} className="cursor-pointer" onClick={() => router.push(`/review/${c.pa_id}`)}>
                          <td>
                            <PriorityBadge score={c.priority_score} />
                          </td>
                          <td>
                            <div>
                              <p className="font-mono text-xs font-bold text-blue-700">{c.pa_number}</p>
                              <p className="text-sm font-semibold text-gray-900">{c.patient_name}</p>
                              <p className="text-xs text-gray-400 font-mono">{c.member_id}</p>
                            </div>
                          </td>
                          <td>
                            <div>
                              <p className="text-sm text-gray-700 max-w-[160px] truncate">{c.service_description}</p>
                              <p className="text-xs font-mono text-gray-400">{c.procedure_code}</p>
                            </div>
                          </td>
                          <td>
                            <p className="text-xs font-mono text-gray-600 max-w-[120px] truncate">{c.primary_diagnosis}</p>
                          </td>
                          <td>
                            <span className={urgencyClass(c.urgency)}>{c.urgency}</span>
                          </td>
                          <td>
                            <div>
                              <p className={cn('text-sm font-bold', dl.urgent ? 'text-red-600' : dl.warning ? 'text-orange-500' : 'text-gray-700')}>
                                {dl.label}
                              </p>
                              <p className="text-xs text-gray-400">{c.days_in_queue}d in queue</p>
                            </div>
                          </td>
                          <td>
                            <div className="flex items-center gap-1.5">
                              <div className="w-10 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={cn('h-full rounded-full', c.ai_score >= 90 ? 'bg-green-500' : c.ai_score >= 70 ? 'bg-orange-400' : 'bg-red-500')}
                                  style={{ width: `${c.ai_score}%` }}
                                />
                              </div>
                              <span className={cn('text-sm font-bold',
                                c.ai_score >= 90 ? 'text-green-700' : c.ai_score >= 70 ? 'text-orange-600' : 'text-red-600'
                              )}>{c.ai_score}%</span>
                            </div>
                          </td>
                          <td>
                            <span className={cn('badge text-xs',
                              c.ai_recommendation === 'APPROVE' ? 'bg-green-100 text-green-800' :
                              c.ai_recommendation === 'DENY' ? 'bg-red-100 text-red-800' :
                              'bg-orange-100 text-orange-800'
                            )}>
                              {c.ai_recommendation || 'REVIEW'}
                            </span>
                          </td>
                          <td>
                            {c.assigned_name ? (
                              <span className="text-xs text-gray-700">{c.assigned_name}</span>
                            ) : (
                              <span className="text-xs text-gray-400 italic">Unassigned</span>
                            )}
                          </td>
                          <td>
                            {c.doc_complete ? (
                              <span className="text-green-500">✓</span>
                            ) : (
                              <span className="text-orange-400">⚠</span>
                            )}
                          </td>
                          <td onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => router.push(`/review/${c.pa_id}`)}
                                className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                title="Review Case"
                              >
                                <Play size={11} />
                              </button>
                              {!c.assigned_to && (
                                <button
                                  onClick={(e) => handleSelfAssign(c.pa_id, e)}
                                  disabled={assigning === c.pa_id}
                                  className="p-1.5 text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                                  title="Assign to Me"
                                >
                                  <UserPlus size={11} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
                <p className="text-xs text-gray-500">Showing {filtered.length} of {total} cases</p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="px-2.5 py-1 text-xs border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-40 transition-colors">
                    Prev
                  </button>
                  <span className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded">{page}</span>
                  <button onClick={() => setPage(p => p + 1)} disabled={filtered.length < PER_PAGE}
                    className="px-2.5 py-1 text-xs border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-40 transition-colors">
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </Card>
      </Layout>
    </>
  );
};

const PriorityBadge: React.FC<{ score: number }> = ({ score }) => {
  const level = score >= 80 ? { label: 'HIGH', cls: 'bg-red-100 text-red-800' } :
                score >= 50 ? { label: 'MED', cls: 'bg-orange-100 text-orange-800' } :
                              { label: 'LOW', cls: 'bg-gray-100 text-gray-600' };
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('badge text-[10px]', level.cls)}>{level.label}</span>
      <span className="text-xs font-mono text-gray-500">{score}</span>
    </div>
  );
};

function mockCases(): QueueCase[] {
  return [
    { pa_id: '4', pa_number: 'PA-2026-001237', patient_name: 'Robert Williams', member_id: 'MB55667788', service_type: 'SURGICAL', service_description: 'Cardiac Catheterization', procedure_code: '93454', primary_diagnosis: 'I25.10', urgency: 'EMERGENT', status: 'IN_REVIEW', received_at: new Date(Date.now() - 1 * 3600000).toISOString(), deadline: new Date(Date.now() + 1 * 3600000).toISOString(), days_in_queue: 0, ai_score: 99, ai_recommendation: 'APPROVE', priority_score: 95, payer: 'Aetna', doc_complete: true },
    { pa_id: '3', pa_number: 'PA-2026-001236', patient_name: 'Lisa Martinez', member_id: 'MB11223344', service_type: 'MEDICATION', service_description: 'Humira 40mg injection', procedure_code: 'J0135', primary_diagnosis: 'M06.00', urgency: 'URGENT', status: 'IN_REVIEW', received_at: new Date(Date.now() - 4 * 3600000).toISOString(), deadline: new Date(Date.now() + 2 * 3600000).toISOString(), days_in_queue: 0, ai_score: 76, ai_recommendation: 'REVIEW_REQUIRED', priority_score: 82, payer: 'UnitedHealthcare', doc_complete: false },
    { pa_id: '5', pa_number: 'PA-2026-001238', patient_name: 'Emily Davis', member_id: 'MB99001122', service_type: 'MEDICAL', service_description: 'Chemotherapy FOLFOX', procedure_code: '96413', primary_diagnosis: 'C18.9', urgency: 'URGENT', status: 'IN_REVIEW', received_at: new Date(Date.now() - 8 * 3600000).toISOString(), deadline: new Date(Date.now() + 3 * 3600000).toISOString(), days_in_queue: 1, ai_score: 45, ai_recommendation: 'DENY', priority_score: 78, payer: 'Cigna', doc_complete: true },
    { pa_id: '1', pa_number: 'PA-2026-001234', patient_name: 'Sarah Johnson', member_id: 'MB12345678', service_type: 'DIAGNOSTIC_IMAGING', service_description: 'MRI Lumbar Spine', procedure_code: '72148', primary_diagnosis: 'M54.5', urgency: 'ROUTINE', status: 'IN_REVIEW', received_at: new Date(Date.now() - 12 * 3600000).toISOString(), deadline: new Date(Date.now() + 6 * 3600000).toISOString(), days_in_queue: 1, ai_score: 94, ai_recommendation: 'APPROVE', assigned_name: 'Me', assigned_to: 'me', priority_score: 72, payer: 'UnitedHealthcare', doc_complete: true },
    { pa_id: '2', pa_number: 'PA-2026-001235', patient_name: 'Michael Chen', member_id: 'MB87654321', service_type: 'SURGICAL', service_description: 'Total Knee Replacement', procedure_code: '27447', primary_diagnosis: 'M17.11', urgency: 'ROUTINE', status: 'IN_REVIEW', received_at: new Date(Date.now() - 2 * 24 * 3600000).toISOString(), deadline: new Date(Date.now() + 14 * 3600000).toISOString(), days_in_queue: 2, ai_score: 88, ai_recommendation: 'APPROVE', priority_score: 60, payer: 'Blue Shield', doc_complete: true },
  ];
}

export default QueuePage;
