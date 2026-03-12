import type { AdminKPIs } from '../lib/types';
import React, { useState, useEffect } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import AdminLayout from '../components/layout/Layout';
import { Card, KPICard, GaugeChart, Button, Tabs } from '../components/ui';
import { analyticsApi } from '../lib/api';
import { fmt, cn, mockKPIs, genDailyVolume, genTATTrend, genAIAccuracy, mockByPayer, mockByService, mockDenialReasons, mockReviewerPerf } from '../lib/utils';
import { Download, RefreshCw, TrendingUp, TrendingDown, Target } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  Legend, ReferenceLine, RadarChart, Radar, PolarGrid, PolarAngleAxis
} from 'recharts';

const RANGES = ['7d', '30d', '90d', '6m', '1y'];

const AnalyticsPage: NextPage = () => {
  const [range, setRange]   = useState('30d');
  const [tab, setTab]       = useState('overview');
  const [kpis, setKpis]     = useState<AdminKPIs | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await analyticsApi.kpis(range);
      setKpis(res.data);
    } catch {
      setKpis(mockKPIs());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [range]);

  const k = kpis || mockKPIs();
  const vol = genDailyVolume(range === '7d' ? 7 : range === '30d' ? 30 : 90);
  const tat = genTATTrend(range === '7d' ? 7 : range === '30d' ? 30 : 90);
  const ai  = genAIAccuracy(range === '7d' ? 7 : range === '30d' ? 30 : 90);
  const payers  = mockByPayer();
  const services = mockByService();
  const denials  = mockDenialReasons();
  const reviewers = mockReviewerPerf();

  const decisionPie = [
    { name: 'Approved', value: k.approval_rate?.value || 68.7, color: '#4CAF50' },
    { name: 'Denied',   value: k.denial_rate?.value   || 21.4, color: '#F44336' },
    { name: 'Pended',   value: 100 - (k.approval_rate?.value||68.7) - (k.denial_rate?.value||21.4), color: '#FF9800' },
  ];

  const TABS = [
    { id: 'overview',    label: 'Overview' },
    { id: 'tat',         label: 'Turnaround Time' },
    { id: 'ai',          label: 'AI Performance' },
    { id: 'payers',      label: 'By Payer' },
    { id: 'services',    label: 'By Service' },
    { id: 'denials',     label: 'Denial Analysis' },
    { id: 'reviewers',   label: 'Reviewer Performance' },
    { id: 'appeals',     label: 'Appeals' },
  ];

  return (
    <>
      <Head><title>Analytics | PA Admin</title></Head>
      <AdminLayout title="Analytics & KPIs">
        {/* Range + export */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
            {RANGES.map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={cn('px-3 py-1.5 rounded text-xs font-semibold transition-colors',
                  range === r ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                )}>
                {r}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={<RefreshCw size={12} />} onClick={load} loading={loading}>Refresh</Button>
            <Button variant="outline" size="sm" icon={<Download size={12} />}>Export Report</Button>
          </div>
        </div>

        {/* All KPIs grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2 mb-4">
          {[
            { label:'Total PAs',         v: fmt.num(k.total_received?.value),    t: k.total_received?.trend,    hi: true,  icon:'📋' },
            { label:'Auto-Approval',     v: fmt.pct(k.auto_approval_rate?.value),t: k.auto_approval_rate?.trend,hi: true,  icon:'⚡', target:'≥70%' },
            { label:'AI Accuracy',       v: fmt.pct(k.ai_accuracy?.value),       t: k.ai_accuracy?.trend,       hi: true,  icon:'🤖', target:'≥92%' },
            { label:'Avg TAT',           v: fmt.hrs(k.avg_tat_hours?.value),     t: k.avg_tat_hours?.trend,     hi: false, icon:'⏱',  target:'<24h' },
            { label:'Approval Rate',     v: fmt.pct(k.approval_rate?.value),     t: k.approval_rate?.trend,     hi: true,  icon:'✅' },
            { label:'Appeal Rate',       v: fmt.pct(k.appeal_rate?.value),       t: k.appeal_rate?.trend,       hi: false, icon:'⚖️' },
            { label:'SLA Compliance',    v: fmt.pct(k.sla_compliance?.value),    t: k.sla_compliance?.trend,    hi: true,  icon:'📊', target:'≥98%' },
            { label:'Overturn Rate',     v: fmt.pct(k.overturn_rate?.value),     t: k.overturn_rate?.trend,     hi: false, icon:'↩️' },
            { label:'Denial Rate',       v: fmt.pct(k.denial_rate?.value),       t: k.denial_rate?.trend,       hi: false, icon:'❌' },
            { label:'Reviewer Prod.',    v: k.reviewer_productivity?.value,      t: k.reviewer_productivity?.trend, hi:true,icon:'👤', target:'>15/day' },
            { label:'Cost per PA',       v: fmt.currency(k.cost_per_pa?.value),  t: k.cost_per_pa?.trend,       hi: false, icon:'💲' },
            { label:'Provider NPS',      v: k.provider_satisfaction?.value,      t: k.provider_satisfaction?.trend,hi:true,icon:'⭐' },
            { label:'System Uptime',     v: fmt.pct(k.system_uptime?.value),     t: 0,                          hi: true,  icon:'🟢', target:'≥99.9%' },
            { label:'In Queue',          v: k.in_queue?.value,                   t: k.in_queue?.trend,          hi: false, icon:'📥' },
            { label:'Inter-Rater Rel.',  v: fmt.pct(k.inter_rater_reliability?.value ?? 91.5), t: 0.3, hi: true, icon:'🤝', target:'≥90%' },
            { label:'Guideline Adher.',  v: fmt.pct(k.guideline_adherence?.value ?? 99.2),      t: 0.1, hi: true, icon:'📖', target:'100%' },
            { label:'Doc Complete',      v: fmt.pct(k.documentation_completeness?.value ?? 96.8),t: 0.4,hi: true, icon:'📎', target:'≥95%' },
          ].map(m => (
            <div key={m.label} className="bg-white border border-slate-200 rounded-xl p-3 hover:shadow-sm transition-shadow">
              <div className="flex items-center justify-between mb-1">
                <span className="text-base">{m.icon}</span>
                {m.t !== undefined && m.t !== 0 && (
                  <span className={cn('text-[10px] font-bold', (m.hi ? m.t > 0 : m.t < 0) ? 'text-green-600' : 'text-red-600')}>
                    {m.t > 0 ? '↑' : '↓'}{Math.abs(m.t).toFixed(1)}%
                  </span>
                )}
              </div>
              <p className="text-lg font-extrabold text-slate-900 leading-none">{m.v || '—'}</p>
              <p className="text-[10px] text-slate-400 font-semibold mt-1 uppercase tracking-wide truncate">{m.label}</p>
              {m.target && <p className="text-[9px] text-primary-600 font-bold mt-0.5">Target: {m.target}</p>}
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <Tabs tabs={TABS} active={tab} onChange={setTab} />

          <div className="p-5">
            {/* Overview */}
            {tab === 'overview' && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">PA Volume — Decisions Breakdown</p>
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={vol.slice(-14)} margin={{ top:4, right:4, left:-20, bottom:0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize:10, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize:10, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ background:'#1e293b', border:'none', borderRadius:'8px', color:'#f8fafc', fontSize:'12px' }} />
                          <Legend wrapperStyle={{ fontSize:11 }} />
                          <Bar dataKey="approved" name="Approved" stackId="a" fill="#4CAF50" radius={[0,0,0,0]} />
                          <Bar dataKey="denied"   name="Denied"   stackId="a" fill="#F44336" />
                          <Bar dataKey="pended"   name="Pended"   stackId="a" fill="#FF9800" radius={[2,2,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Decision Distribution</p>
                    <div className="flex items-center justify-center h-52">
                      <PieChart width={200} height={200}>
                        <Pie data={decisionPie} cx={100} cy={100} innerRadius={55} outerRadius={80}
                          dataKey="value" nameKey="name" paddingAngle={3}>
                          {decisionPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} contentStyle={{ background:'#1e293b', border:'none', borderRadius:'8px', color:'#f8fafc', fontSize:'12px' }} />
                        <Legend wrapperStyle={{ fontSize:11 }} />
                      </PieChart>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAT */}
            {tab === 'tat' && (
              <div className="space-y-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Average Turnaround Time vs 24h Target</p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={tat} margin={{ top:4, right:4, left:-20, bottom:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize:10, fill:'#94a3b8' }} axisLine={false} tickLine={false} interval={Math.floor(tat.length/7)} />
                      <YAxis tick={{ fontSize:10, fill:'#94a3b8' }} axisLine={false} tickLine={false} unit="h" />
                      <Tooltip contentStyle={{ background:'#1e293b', border:'none', borderRadius:'8px', color:'#f8fafc', fontSize:'12px' }} />
                      <ReferenceLine y={24} stroke="#F44336" strokeDasharray="5 5" label={{ value:'24h Target', position:'insideTopRight', fontSize:10, fill:'#F44336' }} />
                      <Line type="monotone" dataKey="avg_hours" name="Avg TAT (h)" stroke="#3949ab" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label:'Avg TAT',     value: fmt.hrs(k.avg_tat_hours?.value) },
                    { label:'Within 24h',  value: '96.4%' },
                    { label:'> 3 days',    value: '1.2%' },
                  ].map(s => (
                    <div key={s.label} className="text-center p-4 bg-slate-50 rounded-xl">
                      <p className="text-2xl font-extrabold text-slate-900">{s.value}</p>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide mt-1">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Performance */}
            {tab === 'ai' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="text-center p-4 bg-slate-50 rounded-xl"><GaugeChart value={k.ai_accuracy?.value||93.8} label="AI Accuracy" /></div>
                  <div className="text-center p-4 bg-slate-50 rounded-xl"><GaugeChart value={k.auto_approval_rate?.value||71.2} label="Auto-Approval" /></div>
                  <div className="text-center p-4 bg-slate-50 rounded-xl"><GaugeChart value={85.4} label="AI-Reviewer Agmt" /></div>
                  <div className="text-center p-4 bg-slate-50 rounded-xl"><GaugeChart value={k.inter_rater_reliability?.value ?? 91.5} label="Inter-Rater Rel." /></div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                  <div className="text-center p-4 bg-slate-50 rounded-xl"><GaugeChart value={k.guideline_adherence?.value ?? 99.2} label="Guideline Adher." /></div>
                  <div className="text-center p-4 bg-slate-50 rounded-xl"><GaugeChart value={k.documentation_completeness?.value ?? 96.8} label="Doc Completeness" /></div>
                  <div className="text-center p-4 bg-slate-50 rounded-xl"><GaugeChart value={94.1} label="Confidence Calib." /></div>
                </div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">AI Accuracy Trend vs 92% Target</p>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={ai} margin={{ top:4, right:4, left:-20, bottom:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize:10, fill:'#94a3b8' }} axisLine={false} tickLine={false} interval={Math.floor(ai.length/7)} />
                      <YAxis tick={{ fontSize:10, fill:'#94a3b8' }} axisLine={false} tickLine={false} domain={[85,100]} unit="%" />
                      <Tooltip contentStyle={{ background:'#1e293b', border:'none', borderRadius:'8px', color:'#f8fafc', fontSize:'12px' }} />
                      <ReferenceLine y={92} stroke="#FF9800" strokeDasharray="5 5" label={{ value:'92% Target', position:'insideTopRight', fontSize:10, fill:'#FF9800' }} />
                      <Line type="monotone" dataKey="accuracy" name="AI Accuracy %" stroke="#9c27b0" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* By Payer */}
            {tab === 'payers' && (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Payer</th>
                      <th className="text-right">Total</th>
                      <th className="text-right">Approved</th>
                      <th className="text-right">Denied</th>
                      <th className="text-right">Pended</th>
                      <th className="text-right">Apprvl Rate</th>
                      <th className="text-right">Avg TAT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payers.map(p => (
                      <tr key={p.payer}>
                        <td className="font-semibold">{p.payer}</td>
                        <td className="text-right mono">{p.total.toLocaleString()}</td>
                        <td className="text-right text-green-600 font-semibold">{p.approved.toLocaleString()}</td>
                        <td className="text-right text-red-600 font-semibold">{p.denied.toLocaleString()}</td>
                        <td className="text-right text-orange-600 font-semibold">{p.pended.toLocaleString()}</td>
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-slate-100 rounded-full h-1.5">
                              <div style={{ width:`${p.approval_rate}%` }} className="h-1.5 rounded-full bg-green-500" />
                            </div>
                            <span className={cn('font-bold', p.approval_rate >= 70 ? 'text-green-600' : 'text-amber-600')}>{p.approval_rate}%</span>
                          </div>
                        </td>
                        <td className="text-right text-slate-500">{p.avg_tat}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* By Service */}
            {tab === 'services' && (
              <div className="space-y-4">
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={services} layout="vertical" margin={{ top:0, right:10, left:100, bottom:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize:10, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis dataKey="service" type="category" tick={{ fontSize:10, fill:'#64748b' }} axisLine={false} tickLine={false} width={100} />
                      <Tooltip contentStyle={{ background:'#1e293b', border:'none', borderRadius:'8px', color:'#f8fafc', fontSize:'12px' }} />
                      <Bar dataKey="count" name="Cases" fill="#3949ab" radius={[0,3,3,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <table className="data-table">
                  <thead><tr><th>Service Type</th><th className="text-right">Count</th><th className="text-right">Share</th><th className="text-right">Avg TAT</th><th className="text-right">Approval Rate</th></tr></thead>
                  <tbody>
                    {services.map(s => (
                      <tr key={s.service}>
                        <td className="font-semibold">{s.service}</td>
                        <td className="text-right mono">{s.count.toLocaleString()}</td>
                        <td className="text-right text-slate-500">{s.pct}%</td>
                        <td className="text-right text-slate-500">{s.avg_tat}h</td>
                        <td className="text-right"><span className={cn('font-bold', s.approval_rate >= 70 ? 'text-green-600' : 'text-amber-600')}>{s.approval_rate}%</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Denials */}
            {tab === 'denials' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Denial Reasons</p>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={denials} layout="vertical" margin={{ top:0, right:10, left:140, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize:10, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                        <YAxis dataKey="reason" type="category" tick={{ fontSize:10, fill:'#64748b' }} axisLine={false} tickLine={false} width={140} />
                        <Tooltip contentStyle={{ background:'#1e293b', border:'none', borderRadius:'8px', color:'#f8fafc', fontSize:'12px' }} />
                        <Bar dataKey="count" name="Denials" fill="#F44336" radius={[0,3,3,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Breakdown Table</p>
                  <table className="data-table">
                    <thead><tr><th>Reason</th><th className="text-right">Count</th><th className="text-right">%</th></tr></thead>
                    <tbody>
                      {denials.map(d => (
                        <tr key={d.reason}>
                          <td className="text-xs">{d.reason}</td>
                          <td className="text-right font-bold">{d.count.toLocaleString()}</td>
                          <td className="text-right text-slate-500">{d.pct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Reviewer Performance */}
            {tab === 'reviewers' && (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Reviewer</th>
                      <th>Role</th>
                      <th className="text-right">Cases</th>
                      <th className="text-right">Avg Time</th>
                      <th className="text-right">AI Agmt</th>
                      <th className="text-right">SLA %</th>
                      <th className="text-right">Overturn %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewers.map((r, i) => (
                      <tr key={r.name}>
                        <td className="text-slate-400 font-bold">#{i+1}</td>
                        <td className="font-semibold">{r.name}</td>
                        <td><span className={cn('badge', r.role.includes('MD') ? 'badge-purple' : 'badge-blue')}>{r.role}</span></td>
                        <td className="text-right font-bold">{r.cases}</td>
                        <td className="text-right text-slate-500">{r.avg_time}h</td>
                        <td className="text-right"><span className={cn('font-semibold', r.ai_agreement >= 94 ? 'text-green-600' : r.ai_agreement >= 90 ? 'text-amber-600' : 'text-red-600')}>{r.ai_agreement}%</span></td>
                        <td className="text-right"><span className={cn('font-semibold', r.sla >= 99 ? 'text-green-600' : r.sla >= 97 ? 'text-amber-600' : 'text-red-600')}>{r.sla}%</span></td>
                        <td className="text-right text-slate-500">{r.overturn}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Appeals */}
            {tab === 'appeals' && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label:'Total Appeals',     value:'821',   trend:'+6.4%', color:'text-slate-800' },
                  { label:'Appeal Rate',        value:'6.4%',  trend:'-0.8%', color:'text-green-600' },
                  { label:'Overturn Rate',      value:'31.2%', trend:'+2.1%', color:'text-orange-600' },
                  { label:'Avg Resolution',     value:'18.4d', trend:'-1.2d', color:'text-blue-600' },
                  { label:'Standard Appeals',   value:'687',   trend:'+4.1%', color:'text-slate-800' },
                  { label:'Expedited Appeals',  value:'134',   trend:'+9.2%', color:'text-slate-800' },
                  { label:'Pending Decision',   value:'94',    trend:null,     color:'text-amber-600' },
                  { label:'P2P Requested',      value:'42',    trend:null,     color:'text-purple-600' },
                ].map(s => (
                  <div key={s.label} className="p-4 bg-slate-50 rounded-xl text-center">
                    <p className={cn('text-2xl font-extrabold', s.color)}>{s.value}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-1">{s.label}</p>
                    {s.trend && <p className={cn('text-[11px] font-semibold mt-1', s.trend.startsWith('-') ? 'text-green-600' : 'text-red-600')}>{s.trend}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </AdminLayout>
    </>
  );
};

export default AnalyticsPage;
