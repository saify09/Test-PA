import React, { useState, useEffect } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import MemberLayout from '../../components/layout/Layout';
import { Card, Alert, StatusBadge, Spinner, Button, Tabs, Modal } from '../../components/ui';
import { paApi } from '../../lib/api';
import { fmt, statusLabel, daysUntilExpiry, cn, downloadBlob } from '../../lib/utils';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Download, AlertTriangle, CheckCircle, Clock,
  FileText, User, Stethoscope, Calendar, Shield, Info,
  MessageSquare, Phone, ChevronRight, XCircle, ExternalLink
} from 'lucide-react';

const RequestDetailPage: NextPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const [request, setRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('details');
  const [downloading, setDownloading] = useState(false);
  const [appealModalOpen, setAppealModalOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    paApi.get(id as string)
      .then(r => setRequest(r.data))
      .catch(() => setRequest(mockRequest(id as string)))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDownload = async () => {
    if (!id) return;
    setDownloading(true);
    try {
      const res = await paApi.downloadLetter(id as string);
      downloadBlob(res.data, `PA_Letter_${request?.pa_number}.pdf`);
      toast.success('Letter downloaded');
    } catch {
      toast.success('Letter download started (demo mode)');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return (
    <MemberLayout>
      <div className="flex justify-center pt-20"><Spinner size={32} /></div>
    </MemberLayout>
  );

  if (!request) return (
    <MemberLayout>
      <div className="text-center py-20">
        <p className="text-gray-400">Request not found</p>
        <Link href="/requests"><button className="mt-4 text-primary-600 hover:underline text-sm">Back to requests</button></Link>
      </div>
    </MemberLayout>
  );

  const daysLeft    = daysUntilExpiry(request.auth_valid_through);
  const canAppeal   = request.status === 'DENIED' && !request.has_active_appeal;
  const needsAction = request.status === 'PENDING_INFO';
  const isApproved  = request.status === 'APPROVED';
  const isDenied    = request.status === 'DENIED';

  const TABS = [
    { id: 'details',   label: 'Request Details', icon: <FileText size={14} /> },
    { id: 'timeline',  label: 'Timeline',         icon: <Clock size={14} /> },
    { id: 'documents', label: 'Documents',        icon: <FileText size={14} />, count: request.documents?.length },
  ];

  return (
    <>
      <Head><title>{request.pa_number} | MyHealthPA</title></Head>
      <MemberLayout>
        {/* Back */}
        <div className="mb-4">
          <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            <ArrowLeft size={15} /> Back to My Requests
          </button>
        </div>

        {/* Header card */}
        <div className={cn('rounded-3xl p-6 mb-5 relative overflow-hidden',
          isApproved ? 'bg-gradient-to-br from-green-600 to-green-700' :
          isDenied   ? 'bg-gradient-to-br from-red-600 to-red-700' :
          needsAction ? 'bg-gradient-to-br from-amber-500 to-amber-600' :
          'bg-gradient-to-br from-primary-700 to-primary-800'
        )}>
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-12 translate-x-12" />
          <div className="relative">
            <div className="flex items-start justify-between gap-4">
              <div className="text-white">
                <p className="font-mono text-sm font-bold text-white/70 mb-1">{request.pa_number}</p>
                <h2 className="text-xl font-extrabold leading-tight">{request.service_description}</h2>
                <p className="text-sm text-white/70 mt-1">{request.provider_name} · {request.payer}</p>
              </div>
              <div className="flex flex-col gap-2 flex-shrink-0">
                {(isApproved || isDenied) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDownload}
                    loading={downloading}
                    icon={<Download size={13} />}
                    className="!border-white/40 !text-white hover:!bg-white/20 !rounded-xl"
                  >
                    Download Letter
                  </Button>
                )}
                {canAppeal && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAppealModalOpen(true)}
                    icon={<MessageSquare size={13} />}
                    className="!border-white/40 !text-white hover:!bg-white/20 !rounded-xl"
                  >
                    File Appeal
                  </Button>
                )}
              </div>
            </div>

            {/* Status line */}
            <div className="flex items-center gap-3 mt-4 flex-wrap">
              <div className="flex items-center gap-1.5 bg-white/15 px-3 py-1.5 rounded-full">
                <div className={cn('w-2 h-2 rounded-full', isApproved ? 'bg-green-300' : isDenied ? 'bg-red-300' : 'bg-white/60')} />
                <span className="text-sm font-bold text-white">{statusLabel(request.status)}</span>
              </div>
              <span className="text-sm text-white/60">Submitted {fmt.dateShort(request.submitted_at)}</span>
              {request.decision_date && <span className="text-sm text-white/60">Decided {fmt.dateShort(request.decision_date)}</span>}
              {isApproved && request.auth_number && (
                <span className="font-mono text-sm font-bold text-white/80">Auth# {request.auth_number}</span>
              )}
            </div>

            {/* Auth expiry warning */}
            {isApproved && daysLeft !== null && daysLeft <= 30 && daysLeft >= 0 && (
              <div className="mt-3 flex items-center gap-2 bg-white/15 rounded-xl px-3 py-2 w-fit">
                <AlertTriangle size={14} className="text-yellow-200" />
                <span className="text-xs font-semibold text-yellow-100">Authorization expires in {daysLeft} days</span>
              </div>
            )}
          </div>
        </div>

        {/* Action alerts */}
        {needsAction && (
          <Alert type="warning" className="mb-4" title="Action Required — Additional Information Needed">
            Your healthcare provider needs to submit additional information before this request can be reviewed.
            {request.pend_items?.length > 0 && (
              <ul className="mt-2 space-y-1">
                {request.pend_items.map((item: string, i: number) => (
                  <li key={i} className="text-sm">• {item}</li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-sm font-semibold">Please contact your provider: {request.provider_phone || '(555) 000-0000'}</p>
          </Alert>
        )}

        {isDenied && !request.has_active_appeal && (
          <Alert type="error" className="mb-4" title="Prior Authorization Denied">
            <p>Your request was denied. You have the right to appeal this decision.</p>
            <div className="mt-3 flex gap-2 flex-wrap">
              <button
                onClick={() => setAppealModalOpen(true)}
                className="text-sm font-bold underline text-red-700"
              >
                File a Standard Appeal (30 days) →
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={() => router.push(`/appeals/submit?pa_id=${request.pa_id}&expedited=true`)}
                className="text-sm font-bold underline text-red-700"
              >
                File Expedited Appeal (72 hours)
              </button>
            </div>
          </Alert>
        )}

        {isApproved && (
          <Alert type="success" className="mb-4" title="Prior Authorization Approved">
            Your request has been approved. Please share the authorization number with your provider.
            {request.auth_number && (
              <p className="font-mono font-bold text-lg mt-1">Auth #{request.auth_number}</p>
            )}
            {request.auth_valid_through && (
              <p className="text-sm mt-0.5">Valid through: <strong>{fmt.date(request.auth_valid_through)}</strong></p>
            )}
          </Alert>
        )}

        {/* Tabs */}
        <Card noPad className="mb-4">
          <Tabs tabs={TABS} active={tab} onChange={setTab} />

          {/* Details tab */}
          {tab === 'details' && (
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Service info */}
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Stethoscope size={12} /> Service Information
                </h4>
                <div className="space-y-2">
                  <InfoRow label="Service" value={request.service_description} />
                  <InfoRow label="CPT Code" value={<span className="mono">{request.procedure_code}</span>} />
                  <InfoRow label="Diagnosis" value={<span className="mono">{request.primary_diagnosis}</span>} />
                  <InfoRow label="Urgency" value={request.urgency} />
                  {request.service_from_date && <InfoRow label="Service Date" value={fmt.dateShort(request.service_from_date)} />}
                  {request.quantity && <InfoRow label="Quantity" value={`${request.quantity} ${request.unit_type || ''}`} />}
                </div>
              </div>

              {/* Provider info */}
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <User size={12} /> Provider Information
                </h4>
                <div className="space-y-2">
                  <InfoRow label="Provider" value={request.provider_name} />
                  <InfoRow label="Facility" value={request.facility_name || '—'} />
                  <InfoRow label="NPI" value={<span className="mono">{request.provider_npi}</span>} />
                  <InfoRow label="Phone" value={request.provider_phone || '—'} />
                  <InfoRow label="Payer" value={request.payer} />
                </div>
              </div>

              {/* Decision info (if applicable) */}
              {(isApproved || isDenied) && (
                <div className="sm:col-span-2">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <Shield size={12} /> Decision Details
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <DetailBox label="Decision" value={statusLabel(request.status)} highlight={isApproved ? 'green' : 'red'} />
                    <DetailBox label="Decision Date" value={fmt.dateShort(request.decision_date)} />
                    {isApproved && <DetailBox label="Auth Number" value={request.auth_number} mono />}
                    {isApproved && <DetailBox label="Valid Through" value={fmt.dateShort(request.auth_valid_through)} highlight={daysLeft !== null && daysLeft <= 30 ? 'orange' : undefined} />}
                    {isDenied && request.denial_reason && <DetailBox label="Denial Reason" value={request.denial_reason.replace(/_/g, ' ')} />}
                    {isDenied && request.appeal_deadline && <DetailBox label="Appeal Deadline" value={fmt.dateShort(request.appeal_deadline)} highlight="orange" />}
                  </div>
                  {isDenied && request.denial_notes && (
                    <div className="mt-3 p-4 bg-red-50 border border-red-100 rounded-xl">
                      <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-1">Denial Explanation</p>
                      <p className="text-sm text-gray-700">{request.denial_notes}</p>
                    </div>
                  )}
                  {isApproved && request.approval_notes && (
                    <div className="mt-3 p-4 bg-green-50 border border-green-100 rounded-xl">
                      <p className="text-xs font-bold text-green-600 uppercase tracking-wide mb-1">Approval Notes</p>
                      <p className="text-sm text-gray-700">{request.approval_notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Timeline tab */}
          {tab === 'timeline' && (
            <div className="p-5">
              <div className="timeline-track space-y-6">
                {(request.timeline || []).map((event: any, i: number) => (
                  <div key={i} className="relative flex items-start gap-4">
                    <div className={cn('timeline-dot-wrap -left-3.5 top-0',
                      event.type === 'APPROVED' ? 'bg-green-100' :
                      event.type === 'DENIED'   ? 'bg-red-100' :
                      event.type === 'SUBMITTED' ? 'bg-blue-100' : 'bg-gray-100'
                    )}>
                      {event.type === 'APPROVED' ? <CheckCircle size={14} className="text-green-600" /> :
                       event.type === 'DENIED'   ? <XCircle size={14} className="text-red-600" /> :
                       event.type === 'SUBMITTED' ? <FileText size={14} className="text-blue-600" /> :
                       <Clock size={14} className="text-gray-500" />}
                    </div>
                    <div className="flex-1 pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-gray-900">{event.label}</p>
                        <p className="text-xs text-gray-400 flex-shrink-0">{fmt.dateTime(event.timestamp)}</p>
                      </div>
                      <p className="text-sm text-gray-600 mt-0.5">{event.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Documents tab */}
          {tab === 'documents' && (
            <div className="p-5 space-y-2">
              {(request.documents || []).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No documents available</p>
              ) : (request.documents || []).map((doc: any, i: number) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-[9px] font-extrabold text-red-600">PDF</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{doc.name}</p>
                    <p className="text-xs text-gray-400">{doc.category?.replace(/_/g, ' ')} · Uploaded {fmt.dateShort(doc.uploaded_at)}</p>
                  </div>
                  <button className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                    <Download size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* What happens next */}
        {['SUBMITTED', 'IN_REVIEW'].includes(request.status) && (
          <Card title="What Happens Next?" className="mb-4">
            <div className="space-y-3">
              {[
                { step: 1, label: 'Clinical Review', desc: 'A licensed clinical reviewer will evaluate your request against medical criteria, typically within 1-2 business days.', done: request.status === 'IN_REVIEW' },
                { step: 2, label: 'Decision Made', desc: 'You and your provider will receive written notice of the decision.', done: false },
                { step: 3, label: 'If Approved', desc: 'Your provider can schedule the service. Keep the authorization number for your records.', done: false },
                { step: 4, label: 'If Denied', desc: 'You have the right to appeal within 30 days (or 72 hours for expedited appeals).', done: false },
              ].map(s => (
                <div key={s.step} className={cn('flex items-start gap-3 p-3 rounded-xl', s.done ? 'bg-green-50' : 'bg-gray-50')}>
                  <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5',
                    s.done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
                  )}>
                    {s.done ? '✓' : s.step}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">{s.label}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Help */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 bg-white rounded-2xl border border-gray-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Phone size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Have questions?</p>
              <p className="text-xs text-gray-500">Call Member Services: <strong>1-800-555-0100</strong></p>
              <p className="text-xs text-gray-400">Mon–Fri 8am–6pm</p>
            </div>
          </div>
          <div className="p-4 bg-white rounded-2xl border border-gray-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
              <Info size={18} className="text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Know your rights</p>
              <a href="#" className="text-xs text-primary-600 hover:underline flex items-center gap-1">
                Member grievance & appeals guide <ExternalLink size={10} />
              </a>
            </div>
          </div>
        </div>

        {/* Appeal quick-launch modal */}
        <Modal isOpen={appealModalOpen} onClose={() => setAppealModalOpen(false)} title="File an Appeal" size="sm"
          footer={
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setAppealModalOpen(false)}>Cancel</Button>
              <Button onClick={() => { setAppealModalOpen(false); router.push(`/appeals/submit?pa_id=${request.pa_id}`); }}>
                Continue to Appeal Form
              </Button>
            </div>
          }>
          <div className="space-y-4 text-sm text-gray-700">
            <p>You are filing an appeal for <strong className="font-mono">{request.pa_number}</strong>.</p>
            <div className="space-y-3">
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                <p className="font-bold text-blue-800 mb-1">Standard Appeal</p>
                <p className="text-blue-700">Decision within <strong>30 calendar days</strong>. For non-urgent situations.</p>
              </div>
              <div className="p-4 bg-orange-50 rounded-xl border border-orange-200">
                <p className="font-bold text-orange-800 mb-1">Expedited Appeal</p>
                <p className="text-orange-700">Decision within <strong>72 hours</strong>. For urgent medical situations where delay could harm your health.</p>
                <button
                  onClick={() => { setAppealModalOpen(false); router.push(`/appeals/submit?pa_id=${request.pa_id}&expedited=true`); }}
                  className="mt-2 text-xs font-bold text-orange-700 underline"
                >
                  Request Expedited Review →
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-400">Appeal deadline: <strong>{fmt.date(request.appeal_deadline || new Date(Date.now() + 30 * 86400000).toISOString())}</strong></p>
          </div>
        </Modal>
      </MemberLayout>
    </>
  );
};

const InfoRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="info-row">
    <span className="info-label">{label}</span>
    <span className="info-value">{value}</span>
  </div>
);

const DetailBox: React.FC<{
  label: string; value: string; mono?: boolean;
  highlight?: 'green' | 'red' | 'orange';
}> = ({ label, value, mono, highlight }) => (
  <div className={cn('p-3 rounded-xl',
    highlight === 'green'  ? 'bg-green-50 border border-green-200' :
    highlight === 'red'    ? 'bg-red-50 border border-red-200' :
    highlight === 'orange' ? 'bg-orange-50 border border-orange-200' :
    'bg-gray-50 border border-gray-200'
  )}>
    <p className="text-xs text-gray-400 font-medium mb-1">{label}</p>
    <p className={cn('text-sm font-bold',
      mono ? 'font-mono' : '',
      highlight === 'green' ? 'text-green-800' : highlight === 'red' ? 'text-red-800' : highlight === 'orange' ? 'text-orange-700' : 'text-gray-900'
    )}>
      {value || '—'}
    </p>
  </div>
);

function mockRequest(id: string) {
  const approved = id === '1';
  const denied   = id === '4';
  const pending  = id === '3';
  return {
    pa_id: id, pa_number: `PA-2026-00123${id}`,
    service_description: approved ? 'MRI Lumbar Spine without contrast' : denied ? 'CT Chest with contrast' : pending ? 'Humira 40mg Injection' : 'Physical Therapy',
    provider_name: 'Dr. Robert Smith', provider_npi: '1234567890',
    provider_phone: '(555) 123-4567', facility_name: 'City Medical Center',
    payer: 'BlueCross BlueShield',
    procedure_code: approved ? '72148' : denied ? '71250' : 'J0135',
    primary_diagnosis: approved ? 'M54.5' : denied ? 'R91.8' : 'M06.00',
    urgency: 'ROUTINE', quantity: 1, unit_type: 'unit',
    submitted_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    status: approved ? 'APPROVED' : denied ? 'DENIED' : pending ? 'PENDING_INFO' : 'IN_REVIEW',
    decision_date: (approved || denied) ? new Date(Date.now() - 5 * 86400000).toISOString() : null,
    auth_number: approved ? 'AUTH-882341' : null,
    auth_valid_through: approved ? new Date(Date.now() + 90 * 86400000).toISOString() : null,
    denial_reason: denied ? 'NOT_MEDICALLY_NECESSARY' : null,
    denial_notes: denied ? 'Clinical documentation does not support medical necessity for CT chest. Standard chest X-ray would be appropriate initial imaging per current guidelines.' : null,
    approval_notes: approved ? 'Approved for MRI lumbar spine without contrast. Prior conservative care documented.' : null,
    appeal_deadline: denied ? new Date(Date.now() + 23 * 86400000).toISOString() : null,
    has_active_appeal: false,
    pend_items: pending ? ['Recent rheumatology consultation note', 'Documentation of prior DMARD therapy failure', 'TB screening results'] : [],
    documents: [
      { name: 'clinical_notes.pdf', category: 'CLINICAL_NOTES', uploaded_at: new Date(Date.now() - 7 * 86400000).toISOString() },
      { name: 'prescription_order.pdf', category: 'PRESCRIPTION', uploaded_at: new Date(Date.now() - 7 * 86400000).toISOString() },
    ],
    timeline: [
      { label: 'Request Submitted', type: 'SUBMITTED', timestamp: new Date(Date.now() - 7 * 86400000).toISOString(), description: 'Your prior authorization request was submitted by Dr. Robert Smith.' },
      { label: 'Received by Insurance', type: 'RECEIVED', timestamp: new Date(Date.now() - 7 * 86400000 + 1800000).toISOString(), description: 'BlueCross BlueShield received and acknowledged your request.' },
      { label: 'Clinical Review Started', type: 'IN_REVIEW', timestamp: new Date(Date.now() - 6 * 86400000).toISOString(), description: 'A licensed clinical reviewer has begun evaluating your request.' },
      ...(approved ? [{ label: 'Request Approved', type: 'APPROVED', timestamp: new Date(Date.now() - 5 * 86400000).toISOString(), description: 'Your prior authorization was approved. Auth #AUTH-882341.' }] : []),
      ...(denied ? [{ label: 'Request Denied', type: 'DENIED', timestamp: new Date(Date.now() - 5 * 86400000).toISOString(), description: 'Your prior authorization was not approved. See denial details above.' }] : []),
    ],
  };
}

export default RequestDetailPage;
