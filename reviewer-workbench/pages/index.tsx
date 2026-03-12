import type { QueueMetrics, ReviewerMetrics, QueueItem } from '../lib/types';
import React, { useState, useEffect } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '../components/layout/Layout';
import { Card, StatCard, Button, Alert, Spinner, EmptyState } from '../components/ui';
import { queueApi, metricsApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { deadlineLabel, cn } from '../lib/utils';
import {
  CheckCircle, AlertTriangle, Target, Play, ChevronRight,
  ListFilter, BarChart2, TrendingUp
} from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

const ReviewerDashboard: NextPage = () => {
  const { user } = useAuth();
  const router = useRouter();
  useState<QueueMetrics | null>(null);
  const [myMetrics, setMyMetrics] = useState<QueueMetrics | null>(null);
  const [myQueue, setMyQueue] = useState<any[]>([]);
  const [urgentCases, setUrgentCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, metricsRes, myRes, urgentRes] = await Promise.all([
        queueApi.stats(),
        metricsApi.reviewerStats(),
        queueApi.list({ assigned_to: 'me', limit: 5 }),
        queueApi.list({ urgency: 'EMERGENT', limit: 5 }),
      ]);
      setQueueStats(statsRes.data);
      setMyMetrics(metricsRes.data);
      setMyQueue(myRes.data.items || []);
      setUrgentCases(urgentRes.data.items || []);
    } catch {
      setQueueStats({ total_pending: 47, urgent_count: 8, assigned_to_me: 5, overdue_count: 2, new_today: 12, sla_at_risk: 3 });
      setMyMetrics({ completed_today: 11, daily_target: 20, avg_review_time: 12, ai_agreement_rate: 94, sla_compliance: 98, weekly_data: [{ day: 'M', count: 14 }, { day: 'T', count: 18 }, { day: 'W', count: 12 }, { day: 'T', count: 16 }, { day: 'F', count: 11 }] });
      setMyQueue([
        { pa_id: '1', patient_name: 'Sarah Johnson', service_description: 'MRI Lumbar Spine', urgency: 'ROUTINE', ai_score: 94, deadline: new Date(Date.now() + 6 * 3600000).toISOString() },
        { pa_id: '3', patient_name: 'Lisa Martinez', service_description: 'Humira 40mg', urgency: 'URGENT', ai_score: 76, deadline: new Date(Date.now() + 2 * 3600000).toISOString() },
      ]);
      setUrgentCases([
        { pa_id: '4', patient_name: 'Robert Williams', service_description: 'Cardiac Catheterization', urgency: 'EMERGENT', ai_score: 99, deadline: new Date(Date.now() + 1 * 3600000).toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <Head><title>Dashboard | Reviewer Workbench</title></Head>
      <Layout title="Reviewer Dashboard">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{greeting}, {user?.full_name?.split(' ')[0] || 'Reviewer'}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </div>
          <Link href="/queue"><Button icon={<Play size={14} />}>Start Review</Button></Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <StatCard label="Total in Queue" value={queueStats?.total_pending || 0} icon={<ListFilter size={18} />} color="bg-blue-50 text-blue-600" sub={`${queueStats?.new_today || 0} new today`} onClick={() => router.push('/queue')} />
          <StatCard label="Emergent / Urgent" value={queueStats?.urgent_count || 0} icon={<AlertTriangle size={18} />} color="bg-red-50 text-red-600" sub="Need priority review" onClick={() => router.push('/queue')} />
          <StatCard label="Assigned to Me" value={queueStats?.assigned_to_me || 0} icon={<Target size={18} />} color="bg-purple-50 text-purple-600" sub={`${queueStats?.overdue_count || 0} overdue`} />
          <StatCard label="Completed Today" value={myMetrics?.completed_today || 0} icon={<CheckCircle size={18} />} color="bg-green-50 text-green-600" sub={`${myMetrics?.avg_review_time || 0} min avg`} />
        </div>

        {queueStats?.sla_at_risk > 0 && (
          <Alert type="warning" className="mb-4" title={`${queueStats.sla_at_risk} cases approaching SLA deadline`}>
            These cases must be decided within 4 hours to meet regulatory requirements.
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          {/* Urgent */}
          <Card title="Emergent Cases" subtitle="Requires immediate review" noPad
            action={<Link href="/queue"><button className="text-xs text-blue-600 hover:underline">View queue</button></Link>}>
            {loading ? <div className="p-4 flex justify-center"><Spinner /></div> :
              urgentCases.length === 0 ? <div className="p-6 text-center text-sm text-gray-400">No emergent cases</div> :
              urgentCases.map(c => <CaseRow key={c.pa_id} cas={c} onClick={() => router.push(`/review/${c.pa_id}`)} />)
            }
          </Card>

          {/* My queue */}
          <Card title="Assigned to Me" noPad
            action={<Link href="/queue?assigned=me"><button className="text-xs text-blue-600 hover:underline">View all</button></Link>}>
            {loading ? <div className="p-4 flex justify-center"><Spinner /></div> :
              myQueue.length === 0 ? <div className="p-6 text-center text-sm text-gray-400">No assigned cases</div> :
              myQueue.map(c => <CaseRow key={c.pa_id} cas={c} onClick={() => router.push(`/review/${c.pa_id}`)} />)
            }
          </Card>

          {/* Metrics */}
          <Card title="My Performance Today">
            {loading ? <Spinner /> : (
              <div className="space-y-3">
                <PerfBar label="Cases Reviewed" value={myMetrics?.completed_today || 0} target={myMetrics?.daily_target || 20} unit="" />
                <PerfBar label="AI Agreement" value={myMetrics?.ai_agreement_rate || 0} target={90} unit="%" />
                <PerfBar label="SLA Compliance" value={myMetrics?.sla_compliance || 0} target={98} unit="%" />
                <PerfBar label="Avg Review Time" value={myMetrics?.avg_review_time || 0} target={15} unit=" min" invert />
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-2">This week</p>
                  <div className="h-16">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={myMetrics?.weekly_data || []} margin={{ top: 0, right: 0, bottom: 0, left: -10 }}>
                        <Bar dataKey="count" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                        <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </Layout>
    </>
  );
};

const CaseRow: React.FC<{ cas: QueueItem; onClick: () => void }> = ({ cas, onClick }) => {
  const dl = deadlineLabel(cas.deadline);
  return (
    <div onClick={onClick} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors last:border-0">
      <div className={cn('w-1.5 h-8 rounded-full flex-shrink-0', cas.urgency === 'EMERGENT' ? 'bg-red-500' : cas.urgency === 'URGENT' ? 'bg-orange-400' : 'bg-blue-300')} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{cas.patient_name}</p>
        <p className="text-xs text-gray-500 truncate">{cas.service_description}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={cn('text-xs font-bold', dl.urgent ? 'text-red-600' : dl.warning ? 'text-orange-500' : 'text-gray-400')}>{dl.label}</p>
        {cas.ai_score !== undefined && <p className={cn('text-[10px]', cas.ai_score >= 90 ? 'text-green-600' : 'text-orange-500')}>AI: {cas.ai_score}%</p>}
      </div>
      <ChevronRight size={13} className="text-gray-300 flex-shrink-0" />
    </div>
  );
};

const PerfBar: React.FC<{ label: string; value: number; target: number; unit: string; invert?: boolean }> = ({ label, value, target, unit, invert }) => {
  const pct = Math.min(100, (value / target) * 100);
  const good = invert ? value <= target : value >= target * 0.9;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">{label}</span>
        <span className={cn('font-bold', good ? 'text-green-600' : 'text-orange-500')}>{value}{unit}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', good ? 'bg-green-500' : 'bg-orange-400')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

export default ReviewerDashboard;
