import React, { useState, useEffect } from 'react';
import type { Appeal } from '../lib/types';
import type { NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Layout from '../components/layout/Layout';
import { Card, Button, EmptyState, Spinner } from '../components/ui';
import { paApi } from '../lib/api';
import { formatDate, statusLabel, cn } from '../lib/utils';
import { AlertTriangle, Clock, CheckCircle, XCircle, ChevronRight, FilePlus2 } from 'lucide-react';

const AppealsPage: NextPage = () => {
  const router = useRouter();
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    paApi.list({ status: 'APPEALED' })
      .then(r => setAppeals(r.data.items || []))
      .catch(() => setAppeals(getMockAppeals()))
      .finally(() => setLoading(false));
  }, []);

  const statusIcon = (s: string) => {
    if (s === 'APPEAL_APPROVED') return <CheckCircle size={16} className="text-green-500" />;
    if (s === 'APPEAL_DENIED') return <XCircle size={16} className="text-red-500" />;
    return <Clock size={16} className="text-orange-500" />;
  };

  return (
    <>
      <Head><title>Appeals | Provider Portal</title></Head>
      <Layout title="Appeals">
        <Card
          title="My Appeals"
          subtitle="Track the status of your appeal requests"
          padding={false}
        >
          {loading ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : appeals.length === 0 ? (
            <EmptyState
              icon={<AlertTriangle size={36} />}
              title="No appeals on file"
              description="Denied PA requests can be appealed within 60 days of the denial date."
            />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>PA Number</th>
                  <th>Patient</th>
                  <th>Service</th>
                  <th>Appeal Type</th>
                  <th>Filed Date</th>
                  <th>Deadline</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {appeals.map((a) => (
                  <tr key={a.pa_id} className="cursor-pointer" onClick={() => router.push(`/requests/${a.pa_id}`)}>
                    <td><span className="font-mono text-xs font-bold text-primary-700">{a.pa_number}</span></td>
                    <td><span className="text-sm font-medium text-gray-900">{a.patient_name}</span></td>
                    <td><span className="text-sm text-gray-600">{a.service_description}</span></td>
                    <td><span className="text-sm text-gray-700">{a.appeal_type || 'Standard'}</span></td>
                    <td><span className="text-sm text-gray-600">{formatDate(a.appeal_filed_at || a.submitted_at)}</span></td>
                    <td>
                      <span className={cn('text-sm font-medium', a.appeal_deadline_days < 3 ? 'text-red-600' : 'text-gray-700')}>
                        {a.appeal_deadline_days ? `${a.appeal_deadline_days}d left` : '—'}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {statusIcon(a.appeal_status || 'IN_REVIEW')}
                        <span className="text-sm text-gray-700">{a.appeal_status_label || 'Under Review'}</span>
                      </div>
                    </td>
                    <td><ChevronRight size={14} className="text-gray-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </Layout>
    </>
  );
};

function getMockAppeals() {
  return [
    {
      pa_id: '5', pa_number: 'PA-2026-001238', patient_name: 'Emily Davis',
      service_description: 'Chemotherapy FOLFOX', appeal_type: 'Expedited',
      submitted_at: '2026-03-07T10:00:00Z', appeal_filed_at: '2026-03-08T11:00:00Z',
      appeal_deadline_days: 1, appeal_status: 'IN_REVIEW', appeal_status_label: 'Under Review',
    },
  ];
}

export default AppealsPage;
