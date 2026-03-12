import type { ReviewerMetrics, QueueMetrics } from '../lib/types';
import React, { useState, useEffect } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import Layout from '../components/layout/Layout';
import { Card, StatCard, Spinner } from '../components/ui';
import { metricsApi } from '../lib/api';
import { cn } from '../lib/utils';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import { CheckCircle, Clock, Activity, Target, TrendingUp, Award } from 'lucide-react';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const MetricsPage: NextPage = () => {
  const [data, setData] = useState<QueueMetrics | null>(null);
  const [aiData, setAiData] = useState<QueueMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  useEffect(() => { loadData(); }, [period]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [metricsRes, aiRes] = await Promise.all([
        metricsApi.reviewerStats(),
        metricsApi.aiAccuracy(),
      ]);
      setData(metricsRes.data);
      setAiData(aiRes.data);
    } catch {
      setData(mockData());
      setAiData(mockAiData());
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Layout title="My Metrics"><div className="flex justify-center pt-20"><Spinner size={32} /></div></Layout>;

  return (
    <>
      <Head><title>My Metrics | Reviewer Workbench</title></Head>
      <Layout title="My Performance Metrics">
        {/* Period selector */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm text-gray-500">Your clinical review performance</p>
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {(['7d', '30d', '90d'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={cn('px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  period === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}>
                {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>
        </div>

        {/* KPI stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <StatCard label="Total Reviewed" value={data?.total_reviewed || 0} icon={<CheckCircle size={18} />} color="bg-blue-50 text-blue-600" sub={`vs ${data?.prev_total || 0} prev period`} />
          <StatCard label="Avg Review Time" value={`${data?.avg_review_time || 0}m`} icon={<Clock size={18} />} color="bg-purple-50 text-purple-600" sub={`Target: ≤15 min`} />
          <StatCard label="AI Agreement" value={`${data?.ai_agreement_rate || 0}%`} icon={<Activity size={18} />} color="bg-green-50 text-green-600" sub={`Target: ≥90%`} />
          <StatCard label="SLA Compliance" value={`${data?.sla_compliance || 0}%`} icon={<Target size={18} />} color="bg-orange-50 text-orange-600" sub={`Target: ≥98%`} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Daily review volume */}
          <Card title="Daily Review Volume" subtitle="Cases reviewed per day">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.daily_volume || []} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Bar dataKey="count" name="Reviews" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Decisions breakdown */}
          <Card title="Decision Distribution" subtitle="Your approval vs denial rates">
            <div className="flex items-center gap-4">
              <div className="h-48 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data?.decisions || []} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                      {(data?.decisions || []).map((_: ReviewerMetrics, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {(data?.decisions || []).map((d: ReviewerMetrics, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <div>
                      <p className="text-xs font-medium text-gray-700">{d.name}</p>
                      <p className="text-xs text-gray-400">{d.value} ({d.pct}%)</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Review time trend */}
          <Card title="Review Time Trend" subtitle="Average minutes per case over time">
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data?.time_trend || []} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: number) => [`${v} min`, 'Avg Time']} />
                  <Line type="monotone" dataKey="avg_time" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="target" stroke="#e5e7eb" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* AI agreement trend */}
          <Card title="AI Agreement Rate" subtitle="How often you agree with AI recommendation">
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={aiData?.agreement_trend || []} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[80, 100]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: number) => [`${v}%`, 'Agreement']} />
                  <Line type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="team_avg" stroke="#e5e7eb" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-gray-400 mt-1">Dashed line = team average</p>
          </Card>
        </div>

        {/* Performance comparison */}
        <Card title="Team Performance Comparison" subtitle="Your ranking vs. peer reviewers">
          <div className="space-y-3">
            {(data?.team_ranking || []).map((r: ReviewerMetrics, i: number) => (
              <div key={i} className={cn('flex items-center gap-3 p-3 rounded-lg', r.is_me ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50')}>
                <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                  i === 0 ? 'bg-yellow-400 text-yellow-900' : i === 1 ? 'bg-gray-300 text-gray-700' : i === 2 ? 'bg-orange-300 text-orange-900' : 'bg-gray-100 text-gray-600'
                )}>
                  {i + 1}
                </div>
                <p className={cn('flex-1 text-sm font-medium', r.is_me ? 'text-blue-800' : 'text-gray-700')}>
                  {r.name} {r.is_me && <span className="text-xs text-blue-500">(You)</span>}
                </p>
                <div className="flex gap-6 text-xs text-right">
                  <div>
                    <p className="text-gray-400">Reviews</p>
                    <p className="font-bold text-gray-800">{r.total}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Avg Time</p>
                    <p className="font-bold text-gray-800">{r.avg_time}m</p>
                  </div>
                  <div>
                    <p className="text-gray-400">AI Agree</p>
                    <p className={cn('font-bold', r.ai_agreement >= 90 ? 'text-green-700' : 'text-orange-600')}>{r.ai_agreement}%</p>
                  </div>
                  <div>
                    <p className="text-gray-400">SLA</p>
                    <p className={cn('font-bold', r.sla >= 98 ? 'text-green-700' : 'text-orange-600')}>{r.sla}%</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </Layout>
    </>
  );
};

function mockData() {
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - 29 + i);
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count: Math.floor(8 + Math.random() * 12),
      avg_time: Math.floor(10 + Math.random() * 8),
      target: 15,
    };
  });
  return {
    total_reviewed: 287, prev_total: 243, avg_review_time: 12, ai_agreement_rate: 94, sla_compliance: 98,
    daily_volume: days,
    time_trend: days.map(d => ({ date: d.date, avg_time: d.avg_time, target: 15 })),
    decisions: [
      { name: 'Approved', value: 198, pct: 69 },
      { name: 'Denied', value: 54, pct: 19 },
      { name: 'Pended', value: 35, pct: 12 },
    ],
    team_ranking: [
      { name: 'Dr. James Kim', total: 312, avg_time: 10, ai_agreement: 96, sla: 99, is_me: false },
      { name: 'RN Sarah Parker', total: 287, avg_time: 12, ai_agreement: 94, sla: 98, is_me: true },
      { name: 'RN Mike Torres', total: 265, avg_time: 14, ai_agreement: 91, sla: 97, is_me: false },
      { name: 'Dr. Lisa Wong', total: 241, avg_time: 11, ai_agreement: 95, sla: 99, is_me: false },
    ],
  };
}

function mockAiData() {
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - 29 + i);
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      rate: Math.floor(88 + Math.random() * 10),
      team_avg: 92,
    };
  });
  return { agreement_trend: days };
}

export default MetricsPage;
