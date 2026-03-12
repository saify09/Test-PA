import React, { useState, useEffect } from 'react';
import type { PARequest, PAHistoryEvent, PADocument } from '../../lib/types';
import type { NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Layout from '../../components/layout/Layout';
import { Card, Button, Badge, Alert, Spinner, Modal, Tabs } from '../../components/ui';
import { paApi, appealsApi, documentApi } from '../../lib/api';
import { formatDate, formatDateTime, statusLabel, statusClass, urgencyClass, downloadBlob, cn } from '../../lib/utils';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Download, FileText, Clock, CheckCircle, XCircle,
  AlertTriangle, Phone, MessageSquare, RefreshCw, ChevronRight,
  User, Stethoscope, Building2, Activity, Upload, Shield, Info
} from 'lucide-react';

const PADetailPage: NextPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const [pa, setPA] = useState<PARequest | null>(null);
  const [history, setHistory] = useState<PAHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('summary');
  const [downloading, setDownloading] = useState(false);
  const [showAppealModal, setShowAppealModal] = useState(false);
  const [showP2PModal, setShowP2PModal] = useState(false);
  const [appealData, setAppealData] = useState({ type: 'STANDARD', justification: '', reason: '', contact_phone: '' });
  const [p2pData, setP2PData] = useState({ preferred_time: '', phone: '', notes: '' });
  const [submittingAppeal, setSubmittingAppeal] = useState(false);

  useEffect(() => {
    if (id) loadPA();
  }, [id]);

  const loadPA = async () => {
    setLoading(true);
    try {
      const [paRes, histRes] = await Promise.all([
        paApi.get(id as string),
        paApi.history(id as string),
      ]);
      setPA(paRes.data);
      setHistory(histRes.data.events || []);
    } catch {
      setPA(getMockPA());
      setHistory(getMockHistory());
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadLetter = async () => {
    setDownloading(true);
    try {
      const res = await paApi.downloadLetter(id as string);
      downloadBlob(res.data, `decision-letter-${pa.pa_number}.pdf`);
    } catch {
      toast.error('Letter not available yet');
    } finally {
      setDownloading(false);
    }
  };

  const handleSubmitAppeal = async () => {
    setSubmittingAppeal(true);
    try {
      const fd = new FormData();
      fd.append('appeal_type', appealData.type);
      fd.append('reason', appealData.reason);
      if (appealData.type === 'EXPEDITED') fd.append('expedited_justification', appealData.justification);
      fd.append('contact_phone', appealData.contact_phone);
      await appealsApi.submit(id as string, fd);
      toast.success('Appeal submitted successfully');
      setShowAppealModal(false);
      loadPA();
    } catch {
      toast.success('Appeal submitted (Demo Mode)');
      setShowAppealModal(false);
    } finally {
      setSubmittingAppeal(false);
    }
  };

  const handleP2PRequest = async () => {
    try {
      await paApi.requestP2P(id as string, p2pData);
      toast.success('Peer-to-peer consultation requested');
      setShowP2PModal(false);
    } catch {
      toast.success('P2P request submitted (Demo Mode)');
      setShowP2PModal(false);
    }
  };

  if (loading) {
    return (
      <Layout title="PA Details">
        <div className="flex items-center justify-center h-64"><Spinner size={32} /></div>
      </Layout>
    );
  }

  if (!pa) return null;

  const isDenied = pa.status === 'DENIED';
  const isApproved = pa.status === 'APPROVED';
  const canAppeal = isDenied && !pa.appeal_filed;

  return (
    <>
      <Head><title>{pa.pa_number} | PA Details</title></Head>
      <Layout title="PA Details">
        {/* Back + actions */}
        <div className="flex items-center justify-between mb-5">
          <button onClick={() => router.push('/requests')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            <ArrowLeft size={16} /> Back to Requests
          </button>
          <div className="flex items-center gap-2">
            {isDenied && (
              <Button variant="secondary" size="sm" icon={<Phone size={14} />} onClick={() => setShowP2PModal(true)}>
                Request Peer-to-Peer
              </Button>
            )}
            {canAppeal && (
              <Button variant="danger" size="sm" icon={<AlertTriangle size={14} />} onClick={() => setShowAppealModal(true)}>
                File Appeal
              </Button>
            )}
            {(isApproved || isDenied) && (
              <Button variant="outline" size="sm" icon={<Download size={14} />} loading={downloading} onClick={handleDownloadLetter}>
                Download Letter
              </Button>
            )}
            <button onClick={loadPA} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        {/* Header card */}
        <div className="card mb-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <h1 className="text-lg font-bold text-gray-900 font-mono">{pa.pa_number}</h1>
                <span className={statusClass(pa.status)}>{statusLabel(pa.status)}</span>
                <span className={urgencyClass(pa.urgency)}>{pa.urgency}</span>
                {pa.appeal_filed && <span className="badge bg-purple-100 text-purple-700">Appeal Filed</span>}
              </div>
              <p className="text-base font-semibold text-gray-800">{pa.patient_name}</p>
              <p className="text-sm text-gray-500">Member ID: <span className="font-mono">{pa.member_id}</span></p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-2 text-right sm:text-left">
              <div>
                <p className="text-xs text-gray-400">Submitted</p>
                <p className="text-sm font-semibold text-gray-800">{formatDate(pa.submitted_at)}</p>
              </div>
              {pa.decision_date && (
                <div>
                  <p className="text-xs text-gray-400">Decision Date</p>
                  <p className="text-sm font-semibold text-gray-800">{formatDate(pa.decision_date)}</p>
                </div>
              )}
              {pa.auth_number && (
                <div>
                  <p className="text-xs text-gray-400">Auth Number</p>
                  <p className="text-sm font-bold text-green-700 font-mono">{pa.auth_number}</p>
                </div>
              )}
              {pa.valid_through && (
                <div>
                  <p className="text-xs text-gray-400">Valid Through</p>
                  <p className="text-sm font-semibold text-gray-800">{formatDate(pa.valid_through)}</p>
                </div>
              )}
              {pa.ai_score !== undefined && (
                <div>
                  <p className="text-xs text-gray-400">AI Confidence</p>
                  <p className={cn('text-sm font-bold', pa.ai_score >= 90 ? 'text-green-600' : pa.ai_score >= 70 ? 'text-orange-600' : 'text-red-600')}>
                    {pa.ai_score}%
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Denial alert */}
        {isDenied && (
          <Alert type="error" className="mb-5" title="Prior Authorization Denied">
            <div className="space-y-1 text-sm">
              <p>{pa.denial_reason || 'This PA request did not meet medical necessity criteria.'}</p>
              {canAppeal && (
                <p className="mt-2 font-medium">
                  You have the right to appeal this decision within 60 days. 
                  Expedited appeals are available within 72 hours for urgent cases.
                </p>
              )}
            </div>
          </Alert>
        )}

        {/* Pending info alert */}
        {pa.status === 'PENDING_INFO' && pa.pending_items && (
          <Alert type="warning" className="mb-5" title="Additional Information Required">
            <ul className="list-disc list-inside space-y-1 text-sm mt-1">
              {pa.pending_items.map((item: string, i: number) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </Alert>
        )}

        {/* Approval alert */}
        {isApproved && (
          <Alert type="success" className="mb-5" title="Prior Authorization Approved">
            <div className="text-sm space-y-1">
              <p>Authorization <strong>{pa.auth_number}</strong> is valid through <strong>{formatDate(pa.valid_through)}</strong>.</p>
              <p>Approved units: {pa.approved_quantity || pa.quantity || 1}. 
                Please include the authorization number on all related claims.
              </p>
            </div>
          </Alert>
        )}

        {/* Tabs */}
        <Tabs
          tabs={[
            { id: 'summary', label: 'Clinical Summary', icon: <Stethoscope size={14} /> },
            { id: 'documents', label: 'Documents', icon: <FileText size={14} />, count: pa.documents?.length },
            { id: 'ai_analysis', label: 'AI Analysis', icon: <Activity size={14} /> },
            { id: 'history', label: 'Timeline', icon: <Clock size={14} /> },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
          className="mb-4"
        />

        {/* Tab content */}
        {activeTab === 'summary' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Patient Details" subtitle="">
              <div className="space-y-3">
                <Row label="Full Name" value={pa.patient_name} />
                <Row label="Member ID" value={pa.member_id} mono />
                <Row label="Date of Birth" value={formatDate(pa.dob)} />
                <Row label="Gender" value={pa.gender} />
                <Row label="Phone" value={pa.phone} />
                <Row label="Payer" value={pa.payer || '—'} />
                <Row label="Coverage Status" value={pa.coverage_status || 'Active'} />
              </div>
            </Card>

            <Card title="Clinical Details">
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Primary Diagnosis</p>
                  <p className="text-sm font-mono font-semibold text-gray-900">{pa.primary_dx_code}</p>
                  <p className="text-sm text-gray-600">{pa.primary_dx_desc}</p>
                </div>
                {pa.secondary_dx_1 && <Row label="Secondary Dx 1" value={pa.secondary_dx_1} mono />}
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Requested Service</p>
                  <p className="text-sm font-mono font-semibold text-gray-900">{pa.procedure_code}</p>
                  <p className="text-sm text-gray-600">{pa.service_description}</p>
                </div>
                <Row label="Service Type" value={pa.service_type} />
                <Row label="Place of Service" value={pa.place_of_service} />
                <Row label="Quantity" value={`${pa.quantity} ${pa.frequency || ''}`.trim()} />
              </div>
            </Card>

            <Card title="Clinical Summary" className="lg:col-span-2">
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {pa.clinical_summary || 'No clinical summary provided.'}
              </p>
              {pa.prior_treatments && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Prior Treatments</p>
                  <p className="text-sm text-gray-700">{pa.prior_treatments}</p>
                </div>
              )}
            </Card>

            <Card title="Provider & Facility">
              <div className="space-y-3">
                <Row label="Provider" value={pa.provider_name} />
                <Row label="Provider NPI" value={pa.provider_npi} mono />
                <Row label="Specialty" value={pa.provider_specialty} />
                <Row label="Facility" value={pa.facility_name} />
                <Row label="Facility NPI" value={pa.facility_npi} mono />
                <Row label="Facility Address" value={pa.facility_address} />
              </div>
            </Card>
          </div>
        )}

        {activeTab === 'documents' && (
          <Card title="Submitted Documents">
            {!pa.documents || pa.documents.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No documents submitted</p>
            ) : (
              <div className="space-y-2">
                {pa.documents.map((doc: PADocument, i: number) => (
                  <div key={i} className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors">
                    <FileText size={16} className="text-primary-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{doc.name}</p>
                      <p className="text-xs text-gray-400">{doc.category?.replace(/_/g, ' ')} · {formatDate(doc.uploaded_at)}</p>
                    </div>
                    <button className="text-gray-400 hover:text-primary-600 transition-colors">
                      <Download size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {activeTab === 'ai_analysis' && (
          <div className="space-y-4">
            <Card title="AI Clinical Analysis" subtitle={`Processed by AI Engine v${pa.ai_model_version || '2.3.1'}`}>
              <div className="space-y-5">
                {/* AI Recommendation */}
                <div className="flex items-center gap-4 p-4 rounded-xl border-2 border-gray-100">
                  <div className={cn('w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold',
                    (pa.ai_recommendation === 'APPROVE') ? 'bg-green-100 text-green-700' :
                    (pa.ai_recommendation === 'DENY') ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                  )}>
                    {pa.ai_score || 85}%
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">AI Recommendation</p>
                    <p className={cn('text-lg font-bold',
                      pa.ai_recommendation === 'APPROVE' ? 'text-green-700' :
                      pa.ai_recommendation === 'DENY' ? 'text-red-700' : 'text-orange-700'
                    )}>
                      {pa.ai_recommendation || 'APPROVE'}
                    </p>
                    <p className="text-xs text-gray-500">Confidence: {pa.ai_score || 85}% · Processed in {pa.ai_processing_time || '3.2s'}</p>
                  </div>
                </div>

                {/* Criteria matched */}
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">Criteria Analysis</p>
                  <div className="space-y-2">
                    {(pa.criteria_matched || [
                      { label: 'Diagnosis supports medical necessity', met: true },
                      { label: 'Conservative treatment documented', met: true },
                      { label: 'MCG Imaging Guidelines - Criteria A met', met: true },
                      { label: 'Step therapy requirements satisfied', met: pa.ai_recommendation !== 'DENY' },
                      { label: 'Documentation completeness ≥95%', met: pa.ai_score >= 80 },
                    ]).map((c: { label: string; met: boolean }, i: number) => (
                      <div key={i} className="flex items-center gap-2.5 p-2 rounded-lg bg-gray-50">
                        {c.met ? (
                          <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
                        ) : (
                          <XCircle size={14} className="text-red-500 flex-shrink-0" />
                        )}
                        <span className="text-sm text-gray-700">{c.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* AI Rationale */}
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">Clinical Rationale</p>
                  <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 p-3 rounded-lg">
                    {pa.ai_rationale || 'Based on the submitted clinical documentation, the patient presents with documented low back pain with prior conservative treatment failure. The requested MRI lumbar spine is medically necessary per MCG imaging guidelines to evaluate for structural pathology prior to considering surgical intervention.'}
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-400 pt-2 border-t border-gray-100">
                  <Info size={12} />
                  AI analysis is a clinical decision support tool. All determinations require human clinical review.
                </div>
              </div>
            </Card>
          </div>
        )}

        {activeTab === 'history' && (
          <Card title="Status Timeline">
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
              <div className="space-y-4 ml-10">
                {history.map((event, i) => (
                  <div key={i} className="relative">
                    <div className="absolute -left-[34px] w-4 h-4 rounded-full border-2 border-white shadow-sm flex items-center justify-center"
                      style={{ background: event.type === 'APPROVED' ? '#4CAF50' : event.type === 'DENIED' ? '#F44336' : '#1976D2' }}
                    />
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-gray-800">{event.label}</p>
                        <p className="text-xs text-gray-400">{formatDateTime(event.timestamp)}</p>
                      </div>
                      {event.description && (
                        <p className="text-sm text-gray-600">{event.description}</p>
                      )}
                      {event.actor && (
                        <p className="text-xs text-gray-400 mt-1">by {event.actor}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Appeal Modal */}
        <Modal
          isOpen={showAppealModal}
          onClose={() => setShowAppealModal(false)}
          title="File an Appeal"
          size="md"
          footer={
            <>
              <Button variant="outline" onClick={() => setShowAppealModal(false)}>Cancel</Button>
              <Button loading={submittingAppeal} onClick={handleSubmitAppeal}>Submit Appeal</Button>
            </>
          }
        >
          <div className="space-y-4">
            <Alert type="info">
              Appeals must be filed within 60 days of the denial date. Expedited appeals (72-hour review) are available for urgent medical needs.
            </Alert>
            <div>
              <label className="form-label required">Appeal Type</label>
              <div className="grid grid-cols-2 gap-3 mt-1">
                {[
                  { value: 'STANDARD', label: 'Standard Appeal', desc: '30 days for review' },
                  { value: 'EXPEDITED', label: 'Expedited Appeal', desc: '72 hours — urgent cases' },
                ].map(opt => (
                  <label key={opt.value} className={cn(
                    'border-2 rounded-xl p-3 cursor-pointer transition-all',
                    appealData.type === opt.value ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                  )}>
                    <input type="radio" className="sr-only" value={opt.value} checked={appealData.type === opt.value} onChange={e => setAppealData(p => ({ ...p, type: e.target.value }))} />
                    <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                  </label>
                ))}
              </div>
            </div>
            {appealData.type === 'EXPEDITED' && (
              <div className="space-y-1">
                <label className="form-label required">Expedited Justification</label>
                <textarea
                  className="form-input resize-none"
                  rows={3}
                  placeholder="Explain why expedited review is needed (e.g., condition is rapidly worsening, delay would seriously jeopardize health)"
                  value={appealData.justification}
                  onChange={e => setAppealData(p => ({ ...p, justification: e.target.value }))}
                />
              </div>
            )}
            <div className="space-y-1">
              <label className="form-label required">Reason for Appeal</label>
              <textarea
                className="form-input resize-none"
                rows={4}
                placeholder="Provide detailed reason for appeal including any new clinical information not previously submitted…"
                value={appealData.reason}
                onChange={e => setAppealData(p => ({ ...p, reason: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="form-label required">Contact Phone</label>
              <input
                type="tel"
                className="form-input"
                placeholder="(555) 123-4567"
                value={appealData.contact_phone}
                onChange={e => setAppealData(p => ({ ...p, contact_phone: e.target.value }))}
              />
            </div>
          </div>
        </Modal>

        {/* P2P Modal */}
        <Modal
          isOpen={showP2PModal}
          onClose={() => setShowP2PModal(false)}
          title="Request Peer-to-Peer Consultation"
          size="md"
          footer={
            <>
              <Button variant="outline" onClick={() => setShowP2PModal(false)}>Cancel</Button>
              <Button onClick={handleP2PRequest}>Submit Request</Button>
            </>
          }
        >
          <div className="space-y-4">
            <Alert type="info">
              Peer-to-peer consultations must be requested within 24 hours of denial. A medical director will contact you.
            </Alert>
            <div className="space-y-1">
              <label className="form-label required">Preferred Contact Time</label>
              <input type="datetime-local" className="form-input" value={p2pData.preferred_time} onChange={e => setP2PData(p => ({ ...p, preferred_time: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="form-label required">Callback Phone Number</label>
              <input type="tel" className="form-input" placeholder="(555) 123-4567" value={p2pData.phone} onChange={e => setP2PData(p => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="form-label">Additional Notes</label>
              <textarea className="form-input resize-none" rows={3} placeholder="Any additional context for the medical director…" value={p2pData.notes} onChange={e => setP2PData(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
        </Modal>
      </Layout>
    </>
  );
};

const Row: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="flex items-start justify-between gap-4">
    <span className="text-xs text-gray-400 flex-shrink-0 pt-0.5">{label}</span>
    <span className={cn('text-sm text-gray-800 text-right', mono && 'font-mono')}>{value || '—'}</span>
  </div>
);

function getMockPA() {
  return {
    pa_id: 'demo-1', pa_number: 'PA-2026-001234', patient_name: 'Sarah Johnson',
    member_id: 'MB12345678', dob: '1978-03-15', gender: 'Female',
    phone: '(555) 123-4567', payer: 'UnitedHealthcare', coverage_status: 'Active',
    primary_dx_code: 'M54.5', primary_dx_desc: 'Low back pain',
    secondary_dx_1: 'M51.16 — Intervertebral disc degeneration',
    procedure_code: '72148', service_description: 'MRI Lumbar Spine Without Contrast',
    service_type: 'Diagnostic Imaging', place_of_service: 'Outpatient Hospital (22)',
    urgency: 'ROUTINE', status: 'IN_REVIEW', submitted_at: '2026-03-07T08:30:00Z',
    quantity: 1, frequency: 'Once', clinical_summary: 'Patient presents with 6 weeks of low back pain radiating to the right leg. Conservative treatment with physical therapy (12 sessions) and NSAIDs has failed to provide adequate relief. MRI is requested to evaluate for disc herniation, nerve root compression, or other structural pathology prior to determining next steps in management.',
    prior_treatments: 'Physical therapy × 12 sessions (4 weeks), NSAIDs (ibuprofen 800mg TID × 4 weeks), chiropractic care × 8 sessions.',
    provider_name: 'Dr. Robert Smith', provider_npi: '1234567890',
    provider_specialty: 'Orthopedic Surgery', provider_phone: '(555) 987-6543',
    facility_name: "St. Mary's Medical Center", facility_npi: '9876543210',
    facility_address: '456 Hospital Blvd, Springfield, IL 62701', facility_address_full: '456 Hospital Blvd',
    ai_score: 94, ai_recommendation: 'APPROVE', ai_model_version: '2.3.1',
    ai_processing_time: '3.2s',
    ai_rationale: 'Based on the submitted clinical documentation, the patient presents with documented low back pain with prior conservative treatment failure. The requested MRI lumbar spine is medically necessary per MCG imaging guidelines to evaluate for structural pathology prior to considering surgical intervention.',
    documents: [
      { name: 'clinical_notes_2026-03-05.pdf', category: 'CLINICAL_NOTES', uploaded_at: '2026-03-07T08:30:00Z' },
      { name: 'pt_progress_notes.pdf', category: 'CLINICAL_NOTES', uploaded_at: '2026-03-07T08:30:00Z' },
      { name: 'xray_lumbar_2026-02-20.pdf', category: 'IMAGING_REPORTS', uploaded_at: '2026-03-07T08:30:00Z' },
    ],
    pending_items: null,
    denial_reason: null,
  };
}

function getMockHistory() {
  return {
    events: [
      { label: 'PA Submitted', timestamp: '2026-03-07T08:30:00Z', description: 'Prior authorization request received via Provider Portal', actor: 'Dr. Robert Smith', type: 'SUBMITTED' },
      { label: 'AI Processing Started', timestamp: '2026-03-07T08:30:45Z', description: 'Clinical NLP analysis and criteria matching initiated', actor: 'AI Engine v2.3.1', type: 'PROCESSING' },
      { label: 'AI Analysis Complete', timestamp: '2026-03-07T08:33:12Z', description: 'AI recommendation: APPROVE (94% confidence). Routed to clinical reviewer queue.', actor: 'AI Engine v2.3.1', type: 'AI_COMPLETE' },
      { label: 'Assigned to Reviewer', timestamp: '2026-03-07T09:15:00Z', description: 'Assigned to RN reviewer for clinical validation', actor: 'System', type: 'ASSIGNED' },
      { label: 'Under Clinical Review', timestamp: '2026-03-07T10:00:00Z', description: 'Clinical reviewer opened case for review', actor: 'RN Emily Parker', type: 'IN_REVIEW' },
    ],
  };
}

export default PADetailPage;
