import React, { useState, useEffect } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '../../components/layout/Layout';
import { Card, Button, Badge, Spinner, EmptyState } from '../../components/ui';
import { paApi } from '../../lib/api';
import { formatDate, statusLabel, statusClass, urgencyClass, cn } from '../../lib/utils';
import {
  Search, Filter, Download, ChevronRight, ChevronLeft, ChevronRight as ChevRight,
  FilePlus2, RefreshCw, SlidersHorizontal, X
} from 'lucide-react';

interface PA {
  pa_id: string; pa_number: string; patient_name: string; member_id: string;
  service_description: string; procedure_code: string; primary_diagnosis: string;
  urgency: string; status: string; submitted_at: string; decision_date?: string;
  auth_number?: string; valid_through?: string; days_pending: number;
  ai_score?: number; payer?: string;
}

const STATUSES = ['ALL', 'SUBMITTED', 'AI_PROCESSING', 'IN_REVIEW', 'PENDING_INFO', 'APPROVED', 'DENIED', 'APPEALED', 'CANCELLED'];
const PER_PAGE = 15;

const RequestsPage: NextPage = () => {
  const router = useRouter();
  const [pas, setPAs] = useState<PA[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(router.query.status as string || 'ALL');
  const [urgencyFilter, setUrgencyFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('submitted_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => { loadPAs(); }, [page, statusFilter, urgencyFilter, dateFrom, dateTo, sortBy, sortDir]);
  useEffect(() => {
    if (router.query.status) setStatusFilter(router.query.status as string);
  }, [router.query.status]);

  const loadPAs = async () => {
    setLoading(true);
    try {
      const res = await paApi.list({
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        page, limit: PER_PAGE,
        search: search || undefined,
        urgency: urgencyFilter === 'ALL' ? undefined : urgencyFilter,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      setPAs(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch {
      setPAs(getMockList());
      setTotal(getMockList().length);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadPAs();
  };

  const toggleSort = (field: string) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('desc'); }
  };

  const SortArrow = ({ field }: { field: string }) => (
    <span className="ml-1 text-gray-300">
      {sortBy === field ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  );

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <>
      <Head><title>PA Requests | Provider Portal</title></Head>
      <Layout title="My PA Requests">
        <div className="space-y-4">
          {/* Top bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1">
              <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1 max-w-md">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by PA#, patient name, or member ID…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-primary-400"
                  />
                  {search && (
                    <button type="button" onClick={() => { setSearch(''); setPage(1); loadPAs(); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X size={13} />
                    </button>
                  )}
                </div>
                <Button type="submit" variant="secondary" size="sm">Search</Button>
              </form>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={cn('p-2 rounded-lg border transition-colors', showFilters ? 'bg-primary-50 border-primary-200 text-primary-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50')}
              >
                <SlidersHorizontal size={16} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={loadPAs} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <RefreshCw size={15} />
              </button>
              <Link href="/submit">
                <Button icon={<FilePlus2 size={14} />} size="sm">New PA</Button>
              </Link>
            </div>
          </div>

          {/* Filters panel */}
          {showFilters && (
            <div className="card animate-fade-in">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="form-label">Urgency</label>
                  <select className="form-input bg-white" value={urgencyFilter} onChange={e => setUrgencyFilter(e.target.value)}>
                    <option value="ALL">All</option>
                    <option value="ROUTINE">Routine</option>
                    <option value="URGENT">Urgent</option>
                    <option value="EMERGENT">Emergent</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">From Date</label>
                  <input type="date" className="form-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">To Date</label>
                  <input type="date" className="form-input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <Button variant="outline" size="sm" onClick={() => { setUrgencyFilter('ALL'); setDateFrom(''); setDateTo(''); }} className="w-full">
                    Clear Filters
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Status tabs */}
          <div className="flex gap-1 overflow-x-auto pb-1">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setPage(1); }}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors flex-shrink-0',
                  statusFilter === s
                    ? 'bg-primary-500 text-white shadow-sm'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                )}
              >
                {s === 'ALL' ? `All (${total})` : statusLabel(s)}
              </button>
            ))}
          </div>

          {/* Table */}
          <Card padding={false}>
            {loading ? (
              <div className="flex items-center justify-center py-20"><Spinner size={28} /></div>
            ) : pas.length === 0 ? (
              <EmptyState
                title="No PA requests found"
                description={search || statusFilter !== 'ALL' ? 'Try adjusting your filters' : 'Submit your first PA request to get started'}
                action={<Link href="/submit"><Button size="sm" icon={<FilePlus2 size={14} />}>Submit PA</Button></Link>}
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th onClick={() => toggleSort('pa_number')} className="cursor-pointer hover:bg-gray-100">
                          PA Number <SortArrow field="pa_number" />
                        </th>
                        <th onClick={() => toggleSort('patient_name')} className="cursor-pointer hover:bg-gray-100">
                          Patient <SortArrow field="patient_name" />
                        </th>
                        <th>Service</th>
                        <th>Urgency</th>
                        <th onClick={() => toggleSort('status')} className="cursor-pointer hover:bg-gray-100">
                          Status <SortArrow field="status" />
                        </th>
                        <th onClick={() => toggleSort('submitted_at')} className="cursor-pointer hover:bg-gray-100">
                          Submitted <SortArrow field="submitted_at" />
                        </th>
                        <th>Decision</th>
                        <th>Auth #</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pas.map((pa) => (
                        <tr key={pa.pa_id} className="cursor-pointer" onClick={() => router.push(`/requests/${pa.pa_id}`)}>
                          <td>
                            <span className="font-mono text-xs font-bold text-primary-700">
                              {pa.pa_number}
                            </span>
                          </td>
                          <td>
                            <div>
                              <p className="font-medium text-gray-900">{pa.patient_name}</p>
                              <p className="text-xs text-gray-400 font-mono">{pa.member_id}</p>
                            </div>
                          </td>
                          <td>
                            <div>
                              <p className="text-sm text-gray-700 max-w-[180px] truncate">{pa.service_description}</p>
                              <p className="text-xs font-mono text-gray-400">{pa.procedure_code}</p>
                            </div>
                          </td>
                          <td><span className={urgencyClass(pa.urgency)}>{pa.urgency}</span></td>
                          <td>
                            <div className="flex flex-col gap-1">
                              <span className={statusClass(pa.status)}>{statusLabel(pa.status)}</span>
                              {pa.ai_score !== undefined && (
                                <span className="text-[10px] text-gray-400">AI: {pa.ai_score}%</span>
                              )}
                            </div>
                          </td>
                          <td className="text-sm text-gray-600">{formatDate(pa.submitted_at)}</td>
                          <td>
                            {pa.decision_date ? (
                              <span className="text-sm text-gray-700">{formatDate(pa.decision_date)}</span>
                            ) : (
                              <span className="text-xs text-gray-400">{pa.days_pending}d pending</span>
                            )}
                          </td>
                          <td>
                            {pa.auth_number ? (
                              <span className="font-mono text-xs font-semibold text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                                {pa.auth_number}
                              </span>
                            ) : '—'}
                          </td>
                          <td><ChevRight size={14} className="text-gray-300" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 bg-gray-50">
                  <p className="text-xs text-gray-500">
                    Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, total)} of {total}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const p = page <= 3 ? i + 1 : page + i - 2;
                      if (p > totalPages) return null;
                      return (
                        <button
                          key={p}
                          onClick={() => setPage(p)}
                          className={cn('w-7 h-7 text-xs rounded font-medium transition-colors',
                            p === page ? 'bg-primary-500 text-white' : 'text-gray-600 hover:bg-gray-200'
                          )}
                        >
                          {p}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevRight size={14} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>
      </Layout>
    </>
  );
};

function getMockList(): PA[] {
  return [
    { pa_id: '1', pa_number: 'PA-2026-001234', patient_name: 'Sarah Johnson', member_id: 'MB12345678', service_description: 'MRI Lumbar Spine', procedure_code: '72148', primary_diagnosis: 'M54.5', urgency: 'ROUTINE', status: 'IN_REVIEW', submitted_at: '2026-03-07T08:30:00Z', days_pending: 2, payer: 'UnitedHealthcare' },
    { pa_id: '2', pa_number: 'PA-2026-001235', patient_name: 'Michael Chen', member_id: 'MB87654321', service_description: 'Total Knee Replacement', procedure_code: '27447', primary_diagnosis: 'M17.11', urgency: 'ROUTINE', status: 'APPROVED', submitted_at: '2026-03-04T10:00:00Z', decision_date: '2026-03-06T14:00:00Z', auth_number: 'AUTH-78901', valid_through: '2026-09-06', days_pending: 0, ai_score: 96 },
    { pa_id: '3', pa_number: 'PA-2026-001236', patient_name: 'Lisa Martinez', member_id: 'MB11223344', service_description: 'Humira 40mg injection', procedure_code: 'J0135', primary_diagnosis: 'M06.00', urgency: 'URGENT', status: 'PENDING_INFO', submitted_at: '2026-03-08T09:15:00Z', days_pending: 1 },
    { pa_id: '4', pa_number: 'PA-2026-001237', patient_name: 'Robert Williams', member_id: 'MB55667788', service_description: 'Cardiac Catheterization', procedure_code: '93454', primary_diagnosis: 'I25.10', urgency: 'EMERGENT', status: 'APPROVED', submitted_at: '2026-03-08T07:00:00Z', decision_date: '2026-03-08T09:30:00Z', auth_number: 'AUTH-78902', days_pending: 0, ai_score: 99 },
    { pa_id: '5', pa_number: 'PA-2026-001238', patient_name: 'Emily Davis', member_id: 'MB99001122', service_description: 'Chemotherapy FOLFOX', procedure_code: '96413', primary_diagnosis: 'C18.9', urgency: 'URGENT', status: 'DENIED', submitted_at: '2026-03-05T11:00:00Z', decision_date: '2026-03-07T10:00:00Z', days_pending: 0, ai_score: 45 },
    { pa_id: '6', pa_number: 'PA-2026-001239', patient_name: 'James Wilson', member_id: 'MB33445566', service_description: 'Colonoscopy', procedure_code: '45378', primary_diagnosis: 'K57.30', urgency: 'ROUTINE', status: 'SUBMITTED', submitted_at: '2026-03-09T10:00:00Z', days_pending: 0 },
  ];
}

export default RequestsPage;
