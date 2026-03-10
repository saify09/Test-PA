import React, { useState, useEffect } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import MemberLayout from '../../components/layout/Layout';
import { Card, StatusBadge, Spinner, EmptyState, Button, Alert } from '../../components/ui';
import { appealApi } from '../../lib/api';
import { fmt, statusLabel, cn } from '../../lib/utils';
import { MessageSquare, ChevronRight, Plus, AlertTriangle, Clock, CheckCircle } from 'lucide-react';

const AppealsPage: NextPage = () => {
  const router = useRouter();
  const [appeals, setAppeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await appealApi.list();
      setAppeals(res.data.items || []);
    } catch {
      setAppeals(mockAppeals());
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head><title>My Appeals | MyHealthPA</title></Head>
      <MemberLayout title="My Appeals">
        <Alert type="info" className="mb-5" title="Your Right to Appeal">
          If your prior authorization is denied, you have the right to appeal. Standard appeals are decided within 30 days; expedited appeals within 72 hours for urgent medical situations.
        </Alert>

        <div className="flex justify-end mb-4">
          <Link href="/appeals/submit">
            <Button icon={<Plus size={15} />}>File New Appeal</Button>
          </Link>
        </div>

        <Card noPad>
          {loading ? (
            <div className="flex justify-center py-14"><Spinner /></div>
          ) : appeals.length === 0 ? (
            <EmptyState
              icon={<MessageSquare size={40} />}
              title="No appeals on file"
              description="If a prior authorization is denied, you can file an appeal here."
              action={<Link href="/appeals/submit"><Button size="sm" icon={<Plus size={13} />}>File an Appeal</Button></Link>}
            />
          ) : (
            appeals.map(a => <AppealRow key={a.appeal_id} appeal={a} onClick={() => router.push(`/appeals/${a.appeal_id}`)} />)
          )}
        </Card>
      </MemberLayout>
    </>
  );
};

const AppealRow: React.FC<{ appeal: any; onClick: () => void }> = ({ appeal, onClick }) => {
  const isExpedited = appeal.appeal_type === 'EXPEDITED';
  const statusColors: Record<string, string> = {
    SUBMITTED:  'bg-blue-100 text-blue-700',
    IN_REVIEW:  'bg-amber-100 text-amber-700',
    APPROVED:   'bg-green-100 text-green-700',
    DENIED:     'bg-red-100 text-red-700',
    WITHDRAWN:  'bg-gray-100 text-gray-600',
  };
  return (
    <div
      onClick={onClick}
      className="group flex items-center gap-4 px-5 py-4 border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-all last:border-0"
    >
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
        appeal.status === 'APPROVED' ? 'bg-green-100' : appeal.status === 'DENIED' ? 'bg-red-100' : 'bg-purple-100'
      )}>
        <MessageSquare size={18} className={
          appeal.status === 'APPROVED' ? 'text-green-600' : appeal.status === 'DENIED' ? 'text-red-600' : 'text-purple-600'
        } />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-mono text-xs font-bold text-primary-600">{appeal.appeal_number}</span>
          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', isExpedited ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600')}>
            {isExpedited ? 'EXPEDITED' : 'STANDARD'}
          </span>
        </div>
        <p className="text-sm font-bold text-gray-900 truncate">{appeal.service_description}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          Orig. PA: <span className="font-mono">{appeal.original_pa_number}</span>
          {' · '}Submitted {fmt.dateShort(appeal.submitted_at)}
          {appeal.decision_deadline && ` · Deadline: ${fmt.dateShort(appeal.decision_deadline)}`}
        </p>
        {appeal.status === 'IN_REVIEW' && appeal.decision_deadline && (
          <p className="text-xs text-amber-600 font-semibold mt-0.5 flex items-center gap-1">
            <Clock size={10} /> Decision due by {fmt.date(appeal.decision_deadline)}
          </p>
        )}
        {appeal.status === 'APPROVED' && (
          <p className="text-xs text-green-600 font-semibold mt-0.5 flex items-center gap-1">
            <CheckCircle size={10} /> Appeal overturned — authorization granted
          </p>
        )}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-semibold', statusColors[appeal.status] || 'bg-gray-100 text-gray-600')}>
          {appeal.status}
        </span>
        <ChevronRight size={15} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
      </div>
    </div>
  );
};

function mockAppeals() {
  return [
    {
      appeal_id: '1', appeal_number: 'APL-2026-00041',
      original_pa_number: 'PA-2026-001198',
      service_description: 'CT Chest with contrast',
      appeal_type: 'STANDARD', status: 'IN_REVIEW',
      submitted_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      decision_deadline: new Date(Date.now() + 27 * 86400000).toISOString(),
    },
    {
      appeal_id: '2', appeal_number: 'APL-2026-00038',
      original_pa_number: 'PA-2026-001152',
      service_description: 'Knee Arthroscopy',
      appeal_type: 'EXPEDITED', status: 'APPROVED',
      submitted_at: new Date(Date.now() - 10 * 86400000).toISOString(),
      decision_deadline: new Date(Date.now() - 7 * 86400000).toISOString(),
    },
  ];
}

export default AppealsPage;
