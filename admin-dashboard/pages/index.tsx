import React, { useState, useEffect } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import AdminLayout from '../components/layout/Layout';
import { Card, KPICard, Alert, Badge, Spinner, StatusIndicator, GaugeChart } from '../components/ui';
import { analyticsApi } from '../lib/api';
import { fmt, cn, mockKPIs, genDailyVolume, mockByPayer } from '../lib/utils';
import {
  FileText, Users, Zap, Clock, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle, Activity, BarChart3, ChevronRight,
  Shield, Cpu, Server, RefreshCw
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, Cell
} from 'recharts';

const COLORS = { approved: '#4CAF50', denied: '#F44336', pended: '#FF9800' };

const AdminDashboard: NextPage = () => {
  const [kpis,   setKpis]   = useState<any>(null);
  const [volume, setVolume] = useState<any[]>([]);
  const [payer,  setPayer]  = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = async () => {
    setLoading(true);
    try {
      const [kRes, vRes, hRes] = await Promise.all([
        analyticsApi.kpis('30d'),
        analyticsApi.volume('30d'),
        analyticsApi.systemHealth(),
      ]);
      setKpis(kRes.data); setVolume(vRes.data.daily || []); setHealth(hRes.data);
    } catch {
      setKpis(mockKPIs()); setVolume(genDailyVolume(30)); setPayer(mockByPayer());
      setHealth({
        status: 'healthy', uptime: 99.97,
        services: [
          { name: 'API Gateway',       status: 'healthy', latency: 42 },
          { name: 'AI Engine',         status: 'healthy', latency: 180 },
          { name: 'Document Service',  status: 'healthy', latency: 95 },
          { name: 'Payer Integration', status: 'degraded', latency: 820 },
          { name: 'Notification Svc',  status: 'healthy', latency: 28 },
        ],
      });
    } finally {
      setLoading(false); setLastRefresh(new Date());
    }
  };

  useEffect(() => { load(); }, []);

  const k = kpis || mockKPIs();
  const payers = payer.length ? payer : mockByPayer();
  const vol = volume.length ? volume : genDailyVolume(30);

  return (
    <>
      <Head><title>Dashboard | PA Admin</title></Head>
      <AdminLayout title="Operations Dashboard">
        {/* SLA / warning banners */}
        {k.sla_compliance?.value < 99 && (
          <Alert type="warning" className="mb-4">
            <strong>SLA Compliance at {k.sla_compliance?.value}%</strong> — {Math.round((100 - k.sla_compliance?.value) / 100 * k.total_received?.value)} cases may miss deadline.
            <Link href="/cases?filter=sla_at_risk"><span className="ml-2 underline cursor-pointer font-bold">View at-risk cases →</span></Link>
          </Alert>
        )}

        {/* Refresh bar */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-slate-400">Last updated {fmt.ago(lastRefresh)}</p>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 px-2.5 py-1.5 rounded-lg transition-colors">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {/* Primary KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <KPICard
            label="Total PAs (30d)"
            value={fmt.num(k.total_received?.value)}
            icon={<FileText size={16} />}
            trend={k.total_received?.trend}
            trendLabel={k.total_received?.period}
            color="text-primary-600 bg-primary-50"
            onClick={() => window.location.href='/cases'}
          />
          <KPICard
            label="In Queue"
            value={k.in_queue?.value}
            icon={<Clock size={16} />}
            trend={k.in_queue?.trend}
            trendLabel={k.in_queue?.period}
            higherBetter={false}
            color="text-amber-600 bg-amber-50"
            alert={k.in_queue?.value > 100}
          />
          <KPICard
            label="Avg TAT"
            value={fmt.hrs(k.avg_tat_hours?.value)}
            icon={<Activity size={16} />}
            trend={k.avg_tat_hours?.trend}
            trendLabel="target: 24h"
            higherBetter={false}
            color="text-indigo-600 bg-indigo-50"
          />
          <KPICard
            label="Auto-Approval Rate"
            value={fmt.pct(k.auto_approval_rate?.value)}
            icon={<Zap size={16} />}
            trend={k.auto_approval_rate?.trend}
            trendLabel="target: 70%"
            color="text-green-600 bg-green-50"
          />
        </div>

        {/* Secondary KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <KPICard label="AI Accuracy"    value={fmt.pct(k.ai_accuracy?.value)}       icon={<Cpu size={16} />}       trend={k.ai_accuracy?.trend}    color="text-purple-600 bg-purple-50" />
          <KPICard label="Appeal Rate"    value={fmt.pct(k.appeal_rate?.value)}        icon={<AlertTriangle size={16} />} trend={k.appeal_rate?.trend} higherBetter={false} color="text-orange-600 bg-orange-50" />
          <KPICard label="SLA Compliance" value={fmt.pct(k.sla_compliance?.value)}     icon={<Shield size={16} />}    trend={k.sla_compliance?.trend} color="text-blue-600 bg-blue-50" />
          <KPICard label="Approval Rate"  value={fmt.pct(k.approval_rate?.value)}      icon={<CheckCircle size={16} />} trend={k.approval_rate?.trend} color="text-green-600 bg-green-50" />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          {/* Volume chart */}
          <Card title="Daily PA Volume (30d)" className="lg:col-span-2" noPad>
            <div className="px-5 pt-3 pb-1">
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={vol.slice(-14)} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={1} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background:'#1e293b', border:'none', borderRadius:'8px', color:'#f8fafc', fontSize:'12px' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="approved" name="Approved" fill={COLORS.approved} radius={[2,2,0,0]} />
                    <Bar dataKey="denied"   name="Denied"   fill={COLORS.denied}   radius={[2,2,0,0]} />
                    <Bar dataKey="pended"   name="Pended"   fill={COLORS.pended}   radius={[2,2,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card>

          {/* AI + gauges */}
          <Card title="AI Performance">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="text-center p-3 bg-slate-50 rounded-xl">
                  <GaugeChart value={k.ai_accuracy?.value || 93.8} label="AI Accuracy" />
                </div>
                <div className="text-center p-3 bg-slate-50 rounded-xl">
                  <GaugeChart value={k.auto_approval_rate?.value || 71.2} label="Auto-Approval" />
                </div>
              </div>
              <div className="space-y-2 text-xs">
                {[
                  { label: 'Cases Processed Today', value: '284' },
                  { label: 'Auto-Approved', value: '202' },
                  { label: 'Sent to Review', value: '82' },
                  { label: 'Avg Inference Time', value: '2.4s' },
                ].map(row => (
                  <div key={row.label} className="flex justify-between py-1.5 border-b border-slate-50">
                    <span className="text-slate-500">{row.label}</span>
                    <span className="font-bold text-slate-800">{row.value}</span>
                  </div>
                ))}
              </div>
              <Link href="/system">
                <button className="w-full text-xs text-primary-600 font-semibold hover:underline flex items-center justify-center gap-1">
                  View AI details <ChevronRight size={11} />
                </button>
              </Link>
            </div>
          </Card>
        </div>

        {/* Bottom row: by payer + system health + reviewer */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* By payer */}
          <Card title="Volume by Payer" noPad className="lg:col-span-1">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Payer</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Apprvl%</th>
                  <th className="text-right">Avg TAT</th>
                </tr>
              </thead>
              <tbody>
                {payers.map((p: any) => (
                  <tr key={p.payer}>
                    <td className="font-semibold truncate max-w-[100px]">{p.payer}</td>
                    <td className="text-right mono">{p.total.toLocaleString()}</td>
                    <td className="text-right">
                      <span className={cn('font-semibold', p.approval_rate >= 70 ? 'text-green-600' : p.approval_rate >= 65 ? 'text-amber-600' : 'text-red-600')}>
                        {p.approval_rate}%
                      </span>
                    </td>
                    <td className="text-right text-slate-500">{p.avg_tat}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* System health */}
          <Card title="System Health" className="lg:col-span-1">
            <div className="space-y-2.5">
              {(health?.services || []).map((svc: any) => (
                <div key={svc.name} className="flex items-center justify-between">
                  <StatusIndicator status={svc.status} label={svc.name} />
                  <span className={cn('text-xs font-mono font-semibold',
                    svc.latency > 500 ? 'text-red-600' : svc.latency > 200 ? 'text-amber-600' : 'text-green-600'
                  )}>
                    {svc.latency}ms
                  </span>
                </div>
              ))}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>System Uptime</span>
                <span className="font-bold text-green-600">{health?.uptime || 99.97}%</span>
              </div>
              <Link href="/system">
                <button className="w-full text-xs text-primary-600 font-semibold hover:underline flex items-center justify-center gap-1 mt-1">
                  Full system status <ChevronRight size={11} />
                </button>
              </Link>
            </div>
          </Card>

          {/* Quick stats */}
          <Card title="Today's Summary" className="lg:col-span-1">
            <div className="space-y-2">
              {[
                { label: 'New Submissions',       value: '284',  color: 'text-blue-600',   icon: <FileText size={13} /> },
                { label: 'Decisions Made',         value: '261',  color: 'text-green-600',  icon: <CheckCircle size={13} /> },
                { label: 'Appeals Filed',          value: '17',   color: 'text-orange-600', icon: <AlertTriangle size={13} /> },
                { label: 'Active Reviewers',       value: '12',   color: 'text-primary-600',icon: <Users size={13} /> },
                { label: 'Urgent / Expedited',     value: '8',    color: 'text-red-600',    icon: <Zap size={13} /> },
                { label: 'Provider Portals Active','value': '47', color: 'text-indigo-600', icon: <Activity size={13} /> },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className={s.color}>{s.icon}</span>
                    {s.label}
                  </div>
                  <span className={cn('text-sm font-extrabold', s.color)}>{s.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link href="/analytics">
                <button className="w-full text-xs font-semibold py-2 bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors">
                  Full Analytics →
                </button>
              </Link>
              <Link href="/cases">
                <button className="w-full text-xs font-semibold py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors">
                  View Cases →
                </button>
              </Link>
            </div>
          </Card>
        </div>
      </AdminLayout>
    </>
  );
};

export default AdminDashboard;
