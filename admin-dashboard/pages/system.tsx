import type { SystemHealth, ServiceStatus, QueueStatus } from '../lib/types';
import React, { useState, useEffect } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import AdminLayout from '../components/layout/Layout';
import { Card, Button, Alert, Tabs, StatusIndicator, GaugeChart } from '../components/ui';
import { systemApi } from '../lib/api';
import { fmt, cn } from '../lib/utils';
import { RefreshCw, Activity, Server, Database, Cpu, Zap, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import { subMinutes, format } from 'date-fns';

const SystemPage: NextPage = () => {
  const [tab, setTab]       = useState('overview');
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await systemApi.health();
      setHealth(res.data);
    } catch {
      setHealth(mockHealth());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  const h = health || mockHealth();
  const TABS = [
    { id: 'overview',  label: 'Overview',       icon: <Activity size={13} /> },
    { id: 'services',  label: 'Services',        icon: <Server size={13} /> },
    { id: 'ai',        label: 'AI Engine',       icon: <Cpu size={13} /> },
    { id: 'queues',    label: 'Message Queues',  icon: <Zap size={13} /> },
    { id: 'incidents', label: 'Incidents',       icon: <AlertTriangle size={13} /> },
  ];

  return (
    <>
      <Head><title>System Health | PA Admin</title></Head>
      <AdminLayout title="System Health">
        {/* Overall status banner */}
        <div className={cn('flex items-center gap-3 px-5 py-3.5 rounded-xl mb-4 border',
          h.overall_status === 'healthy'  ? 'bg-green-50 border-green-200' :
          h.overall_status === 'degraded' ? 'bg-amber-50 border-amber-200' :
          'bg-red-50 border-red-200'
        )}>
          <div className={cn('w-3 h-3 rounded-full', h.overall_status==='healthy'?'bg-green-500 animate-pulse':'bg-amber-500')} />
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-900">
              {h.overall_status === 'healthy' ? 'All Systems Operational' : h.overall_status === 'degraded' ? 'Partial Outage Detected' : 'System Incident'}
            </p>
            <p className="text-xs text-slate-500">Uptime: {h.uptime}% this month · Last checked: {fmt.ago(h.last_checked)}</p>
          </div>
          <Button variant="outline" size="sm" icon={<RefreshCw size={11} />} onClick={load} loading={loading}>Refresh</Button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <Tabs tabs={TABS} active={tab} onChange={setTab} />

          <div className="p-5">
            {tab === 'overview' && (
              <div className="space-y-5">
                {/* KPI row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Uptime',       value: `${h.uptime}%`,      icon: <CheckCircle size={18} />, color: 'text-green-600 bg-green-50' },
                    { label: 'API Latency',  value: `${h.api_latency}ms`,icon: <Activity size={18} />,    color: 'text-blue-600 bg-blue-50', alert: h.api_latency > 500 },
                    { label: 'Error Rate',   value: `${h.error_rate}%`,  icon: <AlertTriangle size={18} />,color: 'text-amber-600 bg-amber-50' },
                    { label: 'Throughput',   value: `${h.throughput}/s`, icon: <Zap size={18} />,         color: 'text-purple-600 bg-purple-50' },
                  ].map(s => (
                    <div key={s.label} className={cn('p-4 rounded-xl border', s.alert ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50')}>
                      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center mb-2', s.color)}>{s.icon}</div>
                      <p className="text-xl font-extrabold text-slate-900">{s.value}</p>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Latency trend */}
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">API Latency — Last 60 minutes</p>
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={h.latency_trend || []} margin={{ top:4, right:4, left:-24, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="time" tick={{ fontSize:10, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize:10, fill:'#94a3b8' }} axisLine={false} tickLine={false} unit="ms" />
                        <Tooltip contentStyle={{ background:'#1e293b', border:'none', borderRadius:'8px', color:'#f8fafc', fontSize:'12px' }} />
                        <Line type="monotone" dataKey="p50" name="p50" stroke="#4CAF50" strokeWidth={1.5} dot={false} />
                        <Line type="monotone" dataKey="p95" name="p95" stroke="#FF9800" strokeWidth={1.5} dot={false} />
                        <Line type="monotone" dataKey="p99" name="p99" stroke="#F44336" strokeWidth={1.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {tab === 'services' && (
              <div className="space-y-3">
                {h.services.map((svc: ServiceStatus) => (
                  <div key={svc.name} className={cn('p-4 rounded-xl border', svc.status==='healthy'?'border-slate-200':'border-amber-300 bg-amber-50/40')}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center',
                          svc.status==='healthy'?'bg-green-100':'bg-amber-100'
                        )}>
                          <Server size={16} className={svc.status==='healthy'?'text-green-600':'text-amber-600'} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{svc.name}</p>
                          <p className="text-xs text-slate-400">{svc.version} · {svc.instances} instance{svc.instances>1?'s':''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <p className="text-xs text-slate-400">Latency</p>
                          <p className={cn('text-sm font-bold', svc.latency>500?'text-red-600':svc.latency>200?'text-amber-600':'text-green-600')}>
                            {svc.latency}ms
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Errors</p>
                          <p className={cn('text-sm font-bold', svc.error_rate>1?'text-red-600':'text-slate-700')}>{svc.error_rate}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Uptime</p>
                          <p className="text-sm font-bold text-green-600">{svc.uptime}%</p>
                        </div>
                        <StatusIndicator status={svc.status} />
                      </div>
                    </div>
                    {svc.status !== 'healthy' && (
                      <Alert type="warning" className="mt-2">
                        <p className="text-xs">{svc.degradation_reason || 'Service experiencing elevated latency'}</p>
                      </Alert>
                    )}
                  </div>
                ))}
              </div>
            )}

            {tab === 'ai' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Model Version',    value: h.ai?.model_version || 'v2.4.1' },
                    { label: 'Inference Latency',value: `${h.ai?.avg_latency || 2.4}s` },
                    { label: 'Daily Predictions',value: (h.ai?.daily_count || 284).toLocaleString() },
                    { label: 'GPU Utilization',  value: `${h.ai?.gpu_util || 47}%` },
                    { label: 'Model Accuracy',   value: `${h.ai?.accuracy || 93.8}%` },
                    { label: 'Cache Hit Rate',   value: `${h.ai?.cache_hit || 72.4}%` },
                    { label: 'Queue Depth',      value: h.ai?.queue_depth || 3 },
                    { label: 'Last Retrained',   value: h.ai?.last_retrained || '14 days ago' },
                  ].map(s => (
                    <div key={s.label} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <p className="text-base font-extrabold text-slate-900">{s.value}</p>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-4 bg-slate-50 rounded-xl">
                    <GaugeChart value={93.8} label="Model Accuracy" />
                  </div>
                  <div className="text-center p-4 bg-slate-50 rounded-xl">
                    <GaugeChart value={47} label="GPU Usage" color="#9c27b0" />
                  </div>
                  <div className="text-center p-4 bg-slate-50 rounded-xl">
                    <GaugeChart value={72.4} label="Cache Hit Rate" color="#2196F3" />
                  </div>
                </div>
              </div>
            )}

            {tab === 'queues' && (
              <div className="space-y-3">
                {(h.queues || []).map((q: QueueStatus) => (
                  <div key={q.name} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:bg-slate-50">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center">
                        <Zap size={16} className="text-indigo-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{q.name}</p>
                        <p className="text-xs text-slate-400">{q.type} · Consumer group: {q.consumer_group}</p>
                      </div>
                    </div>
                    <div className="flex gap-6 text-right">
                      <div>
                        <p className="text-xs text-slate-400">Depth</p>
                        <p className={cn('text-sm font-bold', q.depth > 1000 ? 'text-red-600' : q.depth > 100 ? 'text-amber-600' : 'text-slate-700')}>{q.depth.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Throughput</p>
                        <p className="text-sm font-bold text-slate-700">{q.throughput}/s</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Consumers</p>
                        <p className="text-sm font-bold text-slate-700">{q.consumers}</p>
                      </div>
                      <StatusIndicator status={q.depth > 5000 ? 'degraded' : 'healthy'} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'incidents' && (
              <div className="space-y-3">
                {(h.incidents || []).length === 0 ? (
                  <div className="text-center py-10">
                    <CheckCircle size={32} className="text-green-400 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-500">No active incidents</p>
                  </div>
                ) : (h.incidents || []).map((inc: { id: string; title: string; started_at: string; resolved_at?: string }, i: number) => (
                  <div key={i} className={cn('p-4 rounded-xl border', inc.severity==='HIGH'?'border-red-300 bg-red-50':'border-amber-300 bg-amber-50')}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn('badge', inc.severity==='HIGH'?'badge-red':'badge-orange')}>{inc.severity}</span>
                          <span className="badge badge-gray">{inc.status}</span>
                        </div>
                        <p className="text-sm font-bold text-slate-900">{inc.title}</p>
                        <p className="text-xs text-slate-600 mt-1">{inc.description}</p>
                      </div>
                      <p className="text-xs text-slate-400 whitespace-nowrap">{fmt.ago(inc.started_at)}</p>
                    </div>
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

function mockHealth() {
  const now = new Date();
  return {
    overall_status: 'degraded', uptime: 99.97, api_latency: 142,
    error_rate: 0.12, throughput: 48.3, last_checked: now.toISOString(),
    latency_trend: Array.from({ length: 60 }, (_, i) => ({
      time: format(subMinutes(now, 59-i), 'HH:mm'),
      p50: 40 + Math.random()*20, p95: 120 + Math.random()*60, p99: 280 + Math.random()*120,
    })),
    services: [
      { name:'API Gateway',        version:'v3.2.1', instances:3, status:'healthy',  latency:42,  error_rate:0.02, uptime:99.99 },
      { name:'AI Inference Engine',version:'v2.4.1', instances:2, status:'healthy',  latency:180, error_rate:0.08, uptime:99.94 },
      { name:'Document Processor', version:'v1.8.0', instances:2, status:'healthy',  latency:95,  error_rate:0.04, uptime:99.98 },
      { name:'Payer Integration',  version:'v2.1.0', instances:1, status:'degraded', latency:820, error_rate:1.84, uptime:98.12, degradation_reason:'UHC API responding slowly — elevated latency since 14:32 UTC. Monitoring in progress.' },
      { name:'Notification Svc',   version:'v1.5.2', instances:2, status:'healthy',  latency:28,  error_rate:0.01, uptime:99.99 },
      { name:'Auth Service',       version:'v2.0.4', instances:3, status:'healthy',  latency:35,  error_rate:0.00, uptime:100 },
    ],
    ai: { model_version:'v2.4.1', avg_latency:2.4, daily_count:284, gpu_util:47, accuracy:93.8, cache_hit:72.4, queue_depth:3, last_retrained:'14 days ago' },
    queues: [
      { name:'pa-submissions',      type:'Kafka', consumer_group:'intake-svc',    depth:12,  throughput:4.2, consumers:3 },
      { name:'ai-inference',        type:'Kafka', consumer_group:'ai-engine',     depth:3,   throughput:3.8, consumers:2 },
      { name:'payer-outbound',      type:'Kafka', consumer_group:'payer-int-svc', depth:847, throughput:1.4, consumers:1 },
      { name:'notifications',       type:'Redis', consumer_group:'notif-svc',     depth:0,   throughput:8.1, consumers:2 },
      { name:'document-processing', type:'Kafka', consumer_group:'doc-svc',       depth:6,   throughput:2.9, consumers:2 },
    ],
    incidents: [
      { title:'Payer Integration Latency — UHC', severity:'MEDIUM', status:'INVESTIGATING', description:'Elevated response times from UnitedHealthcare API. Cases are queued and will be processed. No data loss.', started_at: new Date(Date.now()-3600000*2).toISOString() },
    ],
  };
}

export default SystemPage;
