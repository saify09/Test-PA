import React, { useState } from 'react';
import type { TrackingResult } from '../lib/types';
import type { NextPage } from 'next';
import Head from 'next/head';
import Layout from '../components/layout/Layout';
import { Card, Button, Alert } from '../components/ui';
import { paApi } from '../lib/api';
import { formatDate, formatDateTime, statusLabel, statusClass, cn } from '../lib/utils';
import { Search, CheckCircle, Clock, XCircle, Activity } from 'lucide-react';

const TrackingPage: NextPage = () => {
  const [paNumber, setPaNumber] = useState('');
  const [memberId, setMemberId] = useState('');
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paNumber && !memberId) return;
    setLoading(true);
    setNotFound(false);
    setResult(null);
    try {
      const res = await paApi.list({ search: paNumber || memberId, limit: 1 });
      if (res.data.items?.length > 0) setResult(res.data.items[0]);
      else setNotFound(true);
    } catch {
      // Demo
      if (paNumber.startsWith('PA-')) {
        setResult({
          pa_number: paNumber, patient_name: 'Sarah Johnson',
          status: 'IN_REVIEW', urgency: 'ROUTINE',
          submitted_at: '2026-03-07T08:30:00Z',
          service_description: 'MRI Lumbar Spine',
          ai_score: 94,
          events: [
            { label: 'PA Submitted', time: '2026-03-07 08:30 AM', done: true },
            { label: 'AI Processing', time: '2026-03-07 08:33 AM', done: true },
            { label: 'Clinical Review', time: '2026-03-07 10:00 AM', done: true },
            { label: 'Decision Pending', time: 'Estimated: Today by 5 PM', done: false },
          ],
        });
      } else setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head><title>Quick Status Check | Provider Portal</title></Head>
      <Layout title="Quick Status Check">
        <div className="max-w-xl mx-auto space-y-6">
          <Card title="Check PA Status" subtitle="Enter a PA number or member ID to view status">
            <form onSubmit={handleSearch} className="space-y-4">
              <div className="space-y-1">
                <label className="form-label">PA Number</label>
                <input
                  type="text"
                  className="form-input font-mono"
                  placeholder="PA-2026-001234"
                  value={paNumber}
                  onChange={e => setPaNumber(e.target.value.toUpperCase())}
                />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400">or</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <div className="space-y-1">
                <label className="form-label">Member ID</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="MB12345678"
                  value={memberId}
                  onChange={e => setMemberId(e.target.value)}
                />
              </div>
              <Button type="submit" loading={loading} icon={<Search size={15} />} className="w-full">
                Check Status
              </Button>
            </form>
          </Card>

          {notFound && (
            <Alert type="warning" title="Not Found">
              No PA request found with the provided information. Please verify the PA number or member ID.
            </Alert>
          )}

          {result && (
            <Card title="PA Status" subtitle={result.pa_number}>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{result.patient_name}</p>
                    <p className="text-sm text-gray-500">{result.service_description}</p>
                  </div>
                  <span className={statusClass(result.status)}>{statusLabel(result.status)}</span>
                </div>

                {result.events && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Progress</p>
                    {result.events.map((ev: TrackingResult["events"][0], i: number) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className={cn('w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
                          ev.done ? 'bg-green-100' : 'bg-gray-100'
                        )}>
                          {ev.done ? <CheckCircle size={12} className="text-green-600" /> : <Clock size={12} className="text-gray-400" />}
                        </div>
                        <div>
                          <p className={cn('text-sm font-medium', ev.done ? 'text-gray-900' : 'text-gray-400')}>{ev.label}</p>
                          <p className="text-xs text-gray-400">{ev.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-400">Submitted {formatDateTime(result.submitted_at)}</p>
                  {result.ai_score && <p className="text-xs text-gray-400">AI Confidence Score: {result.ai_score}%</p>}
                </div>
              </div>
            </Card>
          )}
        </div>
      </Layout>
    </>
  );
};

export default TrackingPage;
