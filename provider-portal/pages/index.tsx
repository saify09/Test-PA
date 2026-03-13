import type { PARequest, PAStats, TrendPoint } from './../lib/types';
import React, { useState, useEffect } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '../components/layout/Layout';
import { Card, StatCard, Badge, Button, Spinner, EmptyState, Alert } from '../components/ui';
import { paApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, formatDateTime, statusLabel, statusClass, urgencyClass, cn } from '../lib/utils';
import {
  FilePlus2, FileText, Clock, CheckCircle, XCircle, AlertTriangle,
  TrendingUp, RefreshCw, ChevronRight, ExternalLink, Search, Filter
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts';

interface PA {
  pa_id: string; pa_number: string; patient_name: string;
  member_id: string; service_description: string; primary_diagnosis: string;
  urgency: string; status: string; submitted_at: string;
  decision_date?: string; auth_number?: string; valid_through?: string;
  days_pending: number; ai_score?: number; deadline?: string;
}

interface Stats {
  total: number; pending: number; approved: number; denied: number;
  auto_approval_rate: number; avg_tat_hours: number;
}

const Dashboard: NextPage = () => {
  const { user } = useAuth();
  const router = useRouter();
  const [pas, setPAs] = useState<PA[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, [filter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [paRes, statsRes] = await Promise.all([
        paApi.list({ status: filter === 'ALL' ? undefined : filter, limit: 20 }),
        paApi.stats(),
      ]);
      setPAs(paRes.data.items || []);
      setStats(statsRes.data);
      setTrendData(statsRes.data.trend_data || generateMockTrend());
    } catch (e: unknown) {
      setError('Failed to load data. Using demo mode.');
      setPAs(getMockPAs());
      setStats(getMockStats());
      setTrendData(generateMockTrend());
    } finally {
      setLoading(false);
    }
  };

  const filtered = pas.filter(p =>
    !search || p.patient_name.toLowerCase().includes(search.toLowerCase()) ||
    p.pa_number.toLowerCase().includes(search.toLowerCase()) ||
    p.member_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <Head><title>Dashboard | PA Provider Portal</title></Head>
      <Layout title="Dashboard">
        {error && (
          <Alert type="info" className="mb-4" onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {/* Welcome bar */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Welcome back, {user?.full_name?.split(' ')[0] || 'Provider'}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <Link href="/submit">
            <Button icon={<FilePlus2 size={16} />} size="md">
              Submit New PA
            </Button>
          </Link>
        </div>

        {/* Stats row */}
        {loading && !stats ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card animate-pulse bg-gray-100 h-24" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              label="Total PAs"
              value={stats?.total || 0}
              icon={<FileText size={20} />}
              color="bg-blue-50 text-blue-600"
              onClick={() => setFilter('ALL')}
            />
            <StatCard
              label="Pending Review"
              value={stats?.pending || 0}
              icon={<Clock size={20} />}
              color="bg-orange-50 text-orange-600"
              onClick={() => setFilter('IN_REVIEW')}
            />
            <StatCard
              label="Approved"
              value={stats?.approved || 0}
              icon={<CheckCircle size={20} />}
              color="bg-green-50 text-green-600"
              onChange={`${stats?.auto_approval_rate || 0}% auto-approved`}
              onClick={() => setFilter('APPROVED')}
            />
            <StatCard
              label="Denied"
              value={stats?.denied || 0}
              icon={<XCircle size={20} />}
              color="bg-red-50 text-red-600"
              onClick={() => setFilter('DENIED')}
            />
          </div>
        )}

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <Card title="PA Submissions (30 days)" className="lg:col-span-2">
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="colorSubmitted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1976D2" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#1976D2" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e0e0e0' }}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Area type="monotone" dataKey="submitted" name="Submitted" stroke="#1976D2" strokeWidth={2} fill="url(#colorSubmitted)" />
                  <Area type="monotone" dataKey="approved" name="Approved" stroke="#4CAF50" strokeWidth={2} fill="none" strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="By Status">
            <div className="space-y-3">
              {[
                { label: 'Approved', value: stats?.approved || 0, color: '#4CAF50', pct: stats ? Math.round((stats.approved/stats.total)*100) || 0 : 0 },
                { label: 'In Review', value: stats?.pending || 0, color: '#FF9800', pct: stats ? Math.round((stats.pending/stats.total)*100) || 0 : 0 },
                { label: 'Denied', value: stats?.denied || 0, color: '#F44336', pct: stats ? Math.round((stats.denied/stats.total)*100) || 0 : 0 },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-600 font-medium">{item.label}</span>
                    <span className="text-gray-900 font-semibold">{item.value} ({item.pct}%)</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${item.pct}%`, background: item.color }}
                    />
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Avg. Turnaround</span>
                  <span className="text-sm font-bold text-gray-900">
                    {stats?.avg_tat_hours ? `${Math.round(stats.avg_tat_hours)}h` : '—'}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* PA Table */}
        <Card
          title="Recent PA Requests"
          subtitle={`${filtered.length} records`}
          action={
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-primary-400 w-44"
                />
              </div>
              <button onClick={loadData} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <RefreshCw size={14} />
              </button>
            </div>
          }
          padding={false}
        >
          {/* Status filters */}
          <div className="flex gap-1 px-4 py-3 border-b border-gray-100 overflow-x-auto">
            {['ALL', 'SUBMITTED', 'IN_REVIEW', 'PENDING_INFO', 'APPROVED', 'DENIED'].map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors',
                  filter === s
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                {s === 'ALL' ? 'All' : statusLabel(s)}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Spinner size={28} />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<FileText size={40} />}
              title="No PA requests found"
              description={search ? 'Try adjusting your search' : 'Submit your first PA request to get started'}
              action={
                <Link href="/submit">
                  <Button size="sm" icon={<FilePlus2 size={14} />}>Submit PA</Button>
                </Link>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>PA Number</th>
                    <th>Patient</th>
                    <th>Service</th>
                    <th>Urgency</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th>Decision</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((pa) => (
                    <tr key={pa.pa_id} className="cursor-pointer" onClick={() => router.push(`/requests/${pa.pa_id}`)}>
                      <td>
                        <span className="font-mono text-xs font-semibold text-primary-700 bg-primary-50 px-2 py-0.5 rounded">
                          {pa.pa_number}
                        </span>
                      </td>
                      <td>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{pa.patient_name}</p>
                          <p className="text-xs text-gray-400 font-mono">{pa.member_id}</p>
                        </div>
                      </td>
                      <td>
                        <div>
                          <p className="text-sm text-gray-700 max-w-[200px] truncate">{pa.service_description}</p>
                          <p className="text-xs text-gray-400">{pa.primary_diagnosis}</p>
                        </div>
                      </td>
                      <td>
                        <span className={urgencyClass(pa.urgency)}>{pa.urgency}</span>
                      </td>
                      <td>
                        <span className={statusClass(pa.status)}>{statusLabel(pa.status)}</span>
                      </td>
                      <td>
                        <span className="text-sm text-gray-600">{formatDate(pa.submitted_at)}</span>
                      </td>
                      <td>
                        {pa.decision_date ? (
                          <div>
                            <p className="text-sm text-gray-700">{formatDate(pa.decision_date)}</p>
                            {pa.auth_number && (
                              <p className="text-xs font-mono text-green-700">{pa.auth_number}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">
                            {pa.days_pending > 0 ? `${pa.days_pending}d pending` : 'Today'}
                          </span>
                        )}
                      </td>
                      <td>
                        <ChevronRight size={14} className="text-gray-300" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length > 0 && (
            <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-400">Showing {filtered.length} results</p>
              <Link href="/requests">
                <Button variant="ghost" size="xs" icon={<ExternalLink size={12} />} iconPosition="right">
                  View all
                </Button>
              </Link>
            </div>
          )}
        </Card>
      </Layout>
    </>
  );
};

// Mock data for demo mode
function getMockPAs(): PA[] {
  return [
    { pa_id: '1', pa_number: 'PA-2026-001234', patient_name: 'Sarah Johnson', member_id: 'MB12345678',
      service_description: 'MRI Lumbar Spine', primary_diagnosis: 'M54.5 - Low back pain',
      urgency: 'ROUTINE', status: 'IN_REVIEW', submitted_at: '2026-03-07T08:30:00Z', days_pending: 2 },
    { pa_id: '2', pa_number: 'PA-2026-001235', patient_name: 'Michael Chen', member_id: 'MB87654321',
      service_description: 'Total Knee Replacement', primary_diagnosis: 'M17.11 - Primary osteoarthritis',
      urgency: 'ROUTINE', status: 'APPROVED', submitted_at: '2026-03-04T10:00:00Z',
      decision_date: '2026-03-06T14:00:00Z', auth_number: 'AUTH-78901', days_pending: 0 },
    { pa_id: '3', pa_number: 'PA-2026-001236', patient_name: 'Lisa Martinez', member_id: 'MB11223344',
      service_description: 'Humira 40mg injection', primary_diagnosis: 'M06.00 - Rheumatoid arthritis',
      urgency: 'URGENT', status: 'PENDING_INFO', submitted_at: '2026-03-08T09:15:00Z', days_pending: 1 },
    { pa_id: '4', pa_number: 'PA-2026-001237', patient_name: 'Robert Williams', member_id: 'MB55667788',
      service_description: 'Cardiac Catheterization', primary_diagnosis: 'I25.10 - Atherosclerotic heart disease',
      urgency: 'EMERGENT', status: 'APPROVED', submitted_at: '2026-03-08T07:00:00Z',
      decision_date: '2026-03-08T09:30:00Z', auth_number: 'AUTH-78902', days_pending: 0 },
    { pa_id: '5', pa_number: 'PA-2026-001238', patient_name: 'Emily Davis', member_id: 'MB99001122',
      service_description: 'Chemotherapy - FOLFOX', primary_diagnosis: 'C18.9 - Malignant neoplasm of colon',
      urgency: 'URGENT', status: 'DENIED', submitted_at: '2026-03-05T11:00:00Z',
      decision_date: '2026-03-07T10:00:00Z', days_pending: 0 },
  ];
}

function getMockStats(): Stats {
  return { total: 127, pending: 23, approved: 89, denied: 15, auto_approval_rate: 72, avg_tat_hours: 18 };
}

function generateMockTrend() {
  const data = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const submitted = Math.floor(3 + Math.random() * 8);
    data.push({
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      submitted,
      approved: Math.floor(submitted * (0.6 + Math.random() * 0.3)),
    });
  }
  return data;
}

export default Dashboard;
