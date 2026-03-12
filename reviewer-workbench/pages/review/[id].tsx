import type { CaseData, AIAnalysis, Guidelines, CaseHistoryEvent, ReviewDocument } from '../../lib/types';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Layout from '../../components/layout/Layout';
import { Button, Card, Tabs, Alert, Spinner, Modal, Select, Textarea, AIScoreGauge, CriteriaItem, Badge } from '../../components/ui';
import { reviewApi, queueApi } from '../../lib/api';
import { fmt, deadlineLabel, urgencyClass, cn } from '../../lib/utils';
import toast from 'react-hot-toast';
import {
  ArrowLeft, ChevronRight, User, Stethoscope, Activity, BookOpen,
  FileText, Clock, CheckCircle, XCircle, AlertTriangle, Download,
  MessageSquare, Phone, Bookmark, RotateCcw, Save, Send,
  ChevronDown, ChevronUp, ExternalLink, Info, Shield, Zap,
  Eye, ThumbsUp, ThumbsDown, Minus
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

// ─── Constants ────────────────────────────────────────────────────────────────
const DENIAL_REASONS = [
  { value: 'NOT_MEDICALLY_NECESSARY', label: 'Not Medically Necessary' },
  { value: 'NOT_COVERED', label: 'Service Not Covered Under Plan' },
  { value: 'EXPERIMENTAL', label: 'Experimental/Investigational' },
  { value: 'STEP_THERAPY', label: 'Step Therapy Not Met' },
  { value: 'DUPLICATE', label: 'Duplicate Request' },
  { value: 'MISSING_INFO', label: 'Insufficient Clinical Information' },
  { value: 'CRITERIA_NOT_MET', label: 'Clinical Criteria Not Met' },
  { value: 'OUT_OF_NETWORK', label: 'Out of Network — No Referral' },
  { value: 'PRIOR_AUTH_NOT_REQUIRED', label: 'Prior Auth Not Required for Service' },
  { value: 'OTHER', label: 'Other (specify in notes)' },
];

const PEND_REASONS = [
  { value: 'MISSING_CLINICAL_NOTES', label: 'Missing Clinical Notes' },
  { value: 'MISSING_LAB_RESULTS', label: 'Missing Lab Results' },
  { value: 'MISSING_IMAGING', label: 'Missing Imaging Reports' },
  { value: 'PRIOR_TREATMENT_DOCS', label: 'Prior Treatment Documentation Needed' },
  { value: 'SPECIALIST_CONSULT', label: 'Specialist Consultation Note Required' },
  { value: 'PRESCRIPTION', label: 'Prescription/Order Missing' },
  { value: 'ELIGIBILITY', label: 'Eligibility Verification Needed' },
  { value: 'P2P_REQUESTED', label: 'Peer-to-Peer Consultation Requested' },
  { value: 'OTHER', label: 'Other Information Needed' },
];

const PEND_ITEMS = [
  'Recent clinical notes (within 90 days)',
  'Lab results supporting medical necessity',
  'Prior imaging reports',
  'Documentation of conservative treatment failure',
  'Specialist consultation note',
  'Prescription/physician order',
  'Formulary step therapy documentation',
  'Letter of medical necessity',
];

type Decision = '' | 'APPROVED' | 'DENIED' | 'PENDED';

// ─── Main Page ────────────────────────────────────────────────────────────────
const CaseReviewPage: NextPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Data
  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [guidelines, setGuidelines] = useState<Guidelines | null>(null);
  const [history, setHistory] = useState<CaseHistoryEvent[]>([]);
  const [documents, setDocuments] = useState<ReviewDocument[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [activeTab, setActiveTab] = useState('clinical');
  const [decision, setDecision] = useState<Decision>('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [denialReason, setDenialReason] = useState('');
  const [denialSubReason, setDenialSubReason] = useState('');
  const [altTreatment, setAltTreatment] = useState('');
  const [pendReason, setPendReason] = useState('');
  const [pendItems, setPendItems] = useState<string[]>([]);
  const [approvedQty, setApprovedQty] = useState('');
  const [approvedDuration, setApprovedDuration] = useState('');
  const [approvedDurationUnit, setApprovedDurationUnit] = useState('days');
  const [authStartDate, setAuthStartDate] = useState('');
  const [authEndDate, setAuthEndDate] = useState('');
  const [requiresMD, setRequiresMD] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmModal, setConfirmModal] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const [criteriaExpanded, setCriteriaExpanded] = useState(true);
  const [guidelinesExpanded, setGuidelinesExpanded] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { if (id) loadCase(); }, [id]);

  // Auto-save notes every 30s
  useEffect(() => {
    if (!id || !clinicalNotes) return;
    const timer = setTimeout(async () => {
      try {
        await reviewApi.saveDraft(id as string, clinicalNotes);
        setAutoSaved(true);
        setTimeout(() => setAutoSaved(false), 3000);
      } catch {}
    }, 30000);
    return () => clearTimeout(timer);
  }, [clinicalNotes, id]);

  // Auto-check MD for denials
  useEffect(() => {
    if (decision === 'DENIED') setRequiresMD(true);
  }, [decision]);

  const loadCase = async () => {
    setLoading(true);
    try {
      const [cRes, aRes, gRes, hRes, dRes] = await Promise.all([
        reviewApi.getCase(id as string),
        reviewApi.getAIAnalysis(id as string),
        reviewApi.getGuidelines(id as string),
        reviewApi.getHistory(id as string),
        reviewApi.getDocuments(id as string),
      ]);
      setCaseData(cRes.data);
      setAiAnalysis(aRes.data);
      setGuidelines(gRes.data);
      setHistory(hRes.data?.events || []);
      setDocuments(dRes.data?.documents || []);
      // Restore draft if exists
      if (cRes.data.draft_notes) setClinicalNotes(cRes.data.draft_notes);
    } catch {
      setCaseData(mockCaseData());
      setAiAnalysis(mockAIAnalysis());
      setGuidelines(mockGuidelines());
      setHistory(mockHistory());
      setDocuments(mockDocuments());
    } finally { setLoading(false); }
  };

  const validateDecision = (): boolean => {
    const errs: Record<string, string> = {};
    if (!decision) { errs.decision = 'Please select a decision'; }
    if (decision === 'DENIED') {
      if (!denialReason) errs.denialReason = 'Required for denial';
    }
    if (decision === 'PENDED') {
      if (!pendReason) errs.pendReason = 'Required';
      if (pendItems.length === 0) errs.pendItems = 'Select at least one item needed';
    }
    if (decision === 'APPROVED') {
      if (!authStartDate) errs.authStartDate = 'Required';
      if (!authEndDate) errs.authEndDate = 'Required';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleFinalizeDecision = () => {
    if (validateDecision()) setConfirmModal(true);
  };

  const handleSubmitDecision = async () => {
    setSubmitting(true);
    try {
      await reviewApi.submitDecision(id as string, {
        decision: decision as 'APPROVED' | 'DENIED' | 'PENDED',
        clinical_notes: clinicalNotes,
        ...(decision === 'APPROVED' && {
          approved_quantity: parseInt(approvedQty) || caseData?.quantity || 1,
          approved_duration: parseInt(approvedDuration),
          approved_duration_unit: approvedDurationUnit,
          auth_start_date: authStartDate,
          auth_end_date: authEndDate,
        }),
        ...(decision === 'DENIED' && {
          denial_reason: denialReason,
          denial_sub_reason: denialSubReason,
          alternative_treatment: altTreatment,
          requires_md_review: requiresMD,
        }),
        ...(decision === 'PENDED' && {
          pend_reason: pendReason,
          pend_items: pendItems,
        }),
      });
      toast.success(`Case ${decision === 'APPROVED' ? 'approved' : decision === 'DENIED' ? 'denied' : 'pended'} successfully`);
      setConfirmModal(false);
      router.push('/queue');
    } catch {
      toast.success(`Decision recorded (Demo Mode)`);
      setConfirmModal(false);
      router.push('/queue');
    } finally { setSubmitting(false); }
  };

  if (loading) return (
    <Layout title="Loading Case…">
      <div className="flex items-center justify-center h-64"><Spinner size={32} /></div>
    </Layout>
  );

  if (!caseData) return null;

  const c = caseData;
  const ai = aiAnalysis;
  const dl = deadlineLabel(c.deadline);

  return (
    <>
      <Head><title>{c.pa_number} — Review | Workbench</title></Head>
      <Layout
        title={c.pa_number}
        titleBadge={<span className={urgencyClass(c.urgency)}>{c.urgency}</span>}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => router.push('/queue')} className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
              <ArrowLeft size={16} />
            </button>
          </div>
        }
      >
        {/* Case header bar */}
        <div className="card p-4 mb-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              {/* Patient */}
              <div className="p-2.5 bg-slate-100 rounded-xl flex-shrink-0">
                <User size={20} className="text-slate-500" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h2 className="text-base font-bold text-slate-900">{c.patient_name}</h2>
                  <span className="badge badge-blue">{c.payer}</span>
                  {c.coverage_status === 'Active' && <span className="badge badge-green">✓ Eligible</span>}
                </div>
                <p className="text-xs text-slate-500">
                  <span className="font-mono">{c.member_id}</span> · DOB: {fmt.date(c.dob)} · {c.gender}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  <span className="font-semibold">{c.procedure_code}</span> — {c.service_description}
                  <span className="mx-1.5 text-slate-300">·</span>
                  <span className="font-mono text-xs">{c.primary_dx_code}</span> {c.primary_dx_desc}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-5 flex-wrap lg:flex-nowrap">
              <div className="text-center">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Deadline</p>
                <p className={cn('text-sm font-bold', dl.cls)}>{dl.label}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Received</p>
                <p className="text-xs font-semibold text-slate-700">{fmt.dateTime(c.received_at)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Assigned To</p>
                <p className="text-xs font-semibold text-slate-700">{c.assigned_to || '—'}</p>
              </div>
              <AIScoreGauge score={ai?.confidence_score || 94} size={72} />
            </div>
          </div>
        </div>

        {/* Layout: tabs left, decision panel right */}
        <div className="flex flex-col xl:flex-row gap-4">
          {/* Left: tabs */}
          <div className="flex-1 min-w-0">
            <Tabs
              tabs={[
                { id: 'clinical', label: 'Clinical Summary', icon: <Stethoscope size={13} /> },
                { id: 'ai', label: 'AI Analysis', icon: <Activity size={13} /> },
                { id: 'guidelines', label: 'Guidelines', icon: <BookOpen size={13} /> },
                { id: 'documents', label: 'Documents', icon: <FileText size={13} />, count: documents.length },
                { id: 'history', label: 'History', icon: <Clock size={13} /> },
              ]}
              active={activeTab}
              onChange={setActiveTab}
              className="mb-4"
            />

            {/* ── Clinical Summary Tab ──────────────────────────── */}
            {activeTab === 'clinical' && (
              <div className="space-y-4 animate-slide-up">
                {/* Demographics + Coverage */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Card title="Patient Demographics">
                    <div className="space-y-2.5">
                      {[
                        { l: 'Full Name', v: c.patient_name },
                        { l: 'Date of Birth', v: `${fmt.date(c.dob)} (Age: ${getAge(c.dob)})` },
                        { l: 'Gender', v: c.gender },
                        { l: 'Member ID', v: c.member_id, mono: true },
                        { l: 'Insurance Group', v: c.group_number || '—' },
                        { l: 'Payer', v: c.payer },
                        { l: 'Coverage', v: c.coverage_status, badge: c.coverage_status === 'Active' ? 'badge-green' : 'badge-red' },
                        { l: 'Effective Date', v: fmt.date(c.effective_date) },
                        { l: 'Term Date', v: c.term_date ? fmt.date(c.term_date) : 'N/A' },
                        { l: 'PCP', v: c.pcp_name || '—' },
                        { l: 'Phone', v: c.phone },
                      ].map(row => <InfoRow key={row.l} {...row} />)}
                    </div>
                  </Card>

                  <Card title="Clinical Details">
                    <div className="space-y-2.5">
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Primary Diagnosis</p>
                        <p className="font-mono text-xs font-bold text-slate-800">{c.primary_dx_code}</p>
                        <p className="text-xs text-slate-600">{c.primary_dx_desc}</p>
                      </div>
                      {c.secondary_dx_1 && (
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Secondary Dx</p>
                          <p className="text-xs text-slate-600">{c.secondary_dx_1}</p>
                          {c.secondary_dx_2 && <p className="text-xs text-slate-600">{c.secondary_dx_2}</p>}
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Requested Service</p>
                        <p className="font-mono text-xs font-bold text-slate-800">{c.procedure_code}</p>
                        <p className="text-xs text-slate-600">{c.service_description}</p>
                      </div>
                      {[
                        { l: 'Service Category', v: c.service_type },
                        { l: 'Place of Service', v: c.place_of_service },
                        { l: 'Urgency', v: c.urgency },
                        { l: 'Quantity', v: `${c.quantity} ${c.frequency || ''}`.trim() },
                        { l: 'Duration', v: c.duration || '—' },
                        { l: 'Est. Cost', v: c.estimated_cost || '—' },
                        { l: 'Provider', v: c.provider_name },
                        { l: 'Specialty', v: c.provider_specialty },
                        { l: 'Facility', v: c.facility_name },
                      ].map(row => <InfoRow key={row.l} {...row} />)}
                    </div>
                  </Card>
                </div>

                {/* Clinical narrative */}
                <Card title="Clinical Summary">
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{c.clinical_summary}</p>
                </Card>

                {/* AI-extracted clinical data */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Card title="Chief Complaint & HPI" subtitle="AI-extracted">
                    <div className="space-y-3">
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Chief Complaint</p>
                        <p className="text-sm text-slate-700">{c.chief_complaint || ai?.extracted?.chief_complaint || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">History of Present Illness</p>
                        <p className="text-sm text-slate-700">{c.hpi || ai?.extracted?.hpi || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Physical Exam Findings</p>
                        <p className="text-sm text-slate-700">{c.exam_findings || ai?.extracted?.exam_findings || '—'}</p>
                      </div>
                    </div>
                  </Card>

                  <Card title="Clinical Data" subtitle="AI-extracted">
                    <div className="space-y-3">
                      {c.lab_results && (
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Lab Results</p>
                          <p className="text-sm text-slate-700 font-mono">{c.lab_results}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Current Medications</p>
                        <div className="space-y-0.5">
                          {(ai?.extracted?.medications || ['NSAIDs (ibuprofen 800mg TID)', 'Cyclobenzaprine 5mg PRN']).map((m: string, i: number) => (
                            <p key={i} className="text-xs text-slate-600 flex items-start gap-1.5"><span className="text-slate-400 flex-shrink-0">•</span>{m}</p>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Allergies</p>
                        <p className="text-xs text-slate-600">{ai?.extracted?.allergies || 'NKDA'}</p>
                      </div>
                    </div>
                  </Card>
                </div>

                {/* Prior treatments timeline */}
                <Card title="Prior Treatments" subtitle="AI-extracted timeline">
                  <p className="text-sm text-slate-700 leading-relaxed">{c.prior_treatments}</p>
                  {ai?.treatment_timeline && (
                    <div className="mt-4 relative pl-5 border-l-2 border-slate-200 space-y-3">
                      {ai.treatment_timeline.map((t: import('../../lib/types').TimelineItem, i: number) => (
                        <div key={i} className="relative">
                          <div className="absolute -left-[21px] w-3 h-3 rounded-full bg-slate-300 border-2 border-white" />
                          <p className="text-xs text-slate-400">{t.date}</p>
                          <p className="text-sm text-slate-700">{t.treatment}</p>
                          {t.outcome && <p className="text-xs text-slate-500 italic">{t.outcome}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            )}

            {/* ── AI Analysis Tab ───────────────────────────────── */}
            {activeTab === 'ai' && (
              <div className="space-y-4 animate-slide-up">
                {/* Top: recommendation + gauge */}
                <div className="card p-5">
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <AIScoreGauge score={ai?.confidence_score || 94} size={100} />
                    <div className="flex-1 text-center sm:text-left">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">AI Recommendation</p>
                      <div className={cn('inline-flex items-center gap-2 px-4 py-2 rounded-xl text-lg font-bold',
                        ai?.recommendation === 'APPROVE' ? 'bg-green-100 text-green-800' :
                        ai?.recommendation === 'DENY' ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'
                      )}>
                        {ai?.recommendation === 'APPROVE' ? <CheckCircle size={18} /> : ai?.recommendation === 'DENY' ? <XCircle size={18} /> : <AlertTriangle size={18} />}
                        {ai?.recommendation || 'APPROVE'}
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        Model: {ai?.model_version || 'ClinicalBERT v2.3.1'} · Processed in {ai?.processing_time || '3.2s'} · {fmt.dateTime(ai?.processed_at || new Date())}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="text-center p-3 bg-slate-50 rounded-xl">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Risk Level</p>
                        <p className={cn('text-sm font-bold', ai?.risk_level === 'HIGH' ? 'text-red-600' : ai?.risk_level === 'MEDIUM' ? 'text-orange-600' : 'text-green-600')}>
                          {ai?.risk_level || 'LOW'}
                        </p>
                      </div>
                      <div className="text-center p-3 bg-slate-50 rounded-xl">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Doc Complete</p>
                        <p className={cn('text-sm font-bold', (ai?.doc_completeness || 95) >= 90 ? 'text-green-600' : 'text-orange-600')}>
                          {ai?.doc_completeness || 95}%
                        </p>
                      </div>
                      <div className="text-center p-3 bg-slate-50 rounded-xl col-span-2">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Similar Cases Analyzed</p>
                        <p className="text-sm font-bold text-slate-800">{ai?.similar_cases_count?.toLocaleString() || '2,847'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rationale */}
                <Card title="Clinical Rationale" subtitle="AI-generated explanation">
                  <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                    {ai?.rationale || 'Based on submitted documentation, the patient presents with documented low back pain with failure of conservative treatment including physical therapy and NSAIDs. The requested MRI lumbar spine is medically necessary per MCG Imaging Guidelines to evaluate for structural pathology prior to escalation of treatment. All required criteria have been met.'}
                  </p>
                </Card>

                {/* Criteria */}
                <Card
                  title="Criteria Analysis"
                  action={
                    <button onClick={() => setCriteriaExpanded(e => !e)} className="text-slate-400 hover:text-slate-600">
                      {criteriaExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  }
                >
                  {criteriaExpanded && (
                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">✓ Criteria Met</p>
                        <div className="space-y-1.5">
                          {(ai?.criteria_met || mockCriteriaMet()).map((c: import('../../lib/types').CriteriaItem, i: number) => (
                            <CriteriaItem key={i} met={true} label={c.label} detail={c.detail} />
                          ))}
                        </div>
                      </div>
                      {(ai?.criteria_unmet || []).length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">✗ Criteria Not Met</p>
                          <div className="space-y-1.5">
                            {ai.criteria_unmet.map((c: import('../../lib/types').CriteriaItem, i: number) => (
                              <CriteriaItem key={i} met={false} label={c.label} detail={c.detail} />
                            ))}
                          </div>
                        </div>
                      )}
                      {(ai?.criteria_na || []).length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">— Not Applicable</p>
                          <div className="space-y-1.5">
                            {ai.criteria_na.map((c: import('../../lib/types').CriteriaItem, i: number) => (
                              <CriteriaItem key={i} met={null} label={c.label} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Card>

                {/* Missing docs */}
                {(ai?.missing_docs || []).length > 0 && (
                  <Alert type="warning" title="Documentation Gaps">
                    <ul className="space-y-1 text-xs mt-1">
                      {ai.missing_docs.map((d: string, i: number) => <li key={i}>• {d}</li>)}
                    </ul>
                  </Alert>
                )}

                {/* Conflicting factors */}
                {(ai?.conflicting_factors || []).length > 0 && (
                  <Card title="Conflicting Factors">
                    <div className="space-y-2">
                      {ai.conflicting_factors.map((f: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-sm text-slate-700">
                          <AlertTriangle size={13} className="text-orange-500 flex-shrink-0 mt-0.5" />
                          {f}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Similar cases */}
                <Card title="Similar Cases Outcome" subtitle={`Based on ${ai?.similar_cases_count?.toLocaleString() || '2,847'} cases`}>
                  <div className="flex items-center gap-6">
                    <div className="h-28 w-28 flex-shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={[
                            { name: 'Approved', value: ai?.similar_approved_pct || 89 },
                            { name: 'Denied', value: 100 - (ai?.similar_approved_pct || 89) },
                          ]} cx="50%" cy="50%" innerRadius={28} outerRadius={44} dataKey="value">
                            <Cell fill="#43A047" />
                            <Cell fill="#E53935" />
                          </Pie>
                          <Tooltip formatter={(v: number) => `${v}%`} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-3 h-3 rounded-sm bg-green-500" />
                        <span className="text-slate-600">Approved: <strong>{ai?.similar_approved_pct || 89}%</strong></span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-3 h-3 rounded-sm bg-red-500" />
                        <span className="text-slate-600">Denied: <strong>{100 - (ai?.similar_approved_pct || 89)}%</strong></span>
                      </div>
                      <p className="text-xs text-slate-400 mt-2">
                        Cases with same CPT + primary ICD-10<br/>at similar facilities in last 12 months
                      </p>
                    </div>
                  </div>
                </Card>

                {/* Supporting evidence */}
                {ai?.supporting_evidence && (
                  <Card title="Supporting Evidence Citations">
                    <div className="space-y-2">
                      {ai.supporting_evidence.map((e: import('../../lib/types').EvidenceItem, i: number) => (
                        <div key={i} className="flex items-start gap-2.5 p-2.5 bg-blue-50 rounded-lg border border-blue-100">
                          <BookOpen size={13} className="text-blue-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-semibold text-blue-800">{e.source}</p>
                            <p className="text-xs text-blue-700 mt-0.5">{e.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* ── Guidelines Tab ────────────────────────────────── */}
            {activeTab === 'guidelines' && (
              <div className="space-y-4 animate-slide-up">
                <Card title={guidelines?.name || 'MCG: Imaging for Low Back Pain'} subtitle={`${guidelines?.version || '28th Edition, 2026'} · ${guidelines?.effective_date || 'Effective Jan 2026'}`}>
                  <div className="space-y-5">
                    {/* Overview */}
                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                      <p className="text-sm text-slate-700 leading-relaxed">
                        {guidelines?.overview || 'Lumbar spine MRI is appropriate for patients with low back pain who have failed conservative management for ≥6 weeks, have radicular symptoms, or have red flag symptoms suggesting serious pathology.'}
                      </p>
                    </div>

                    {/* Must meet ALL */}
                    <div>
                      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <span className="w-4 h-4 bg-green-500 rounded text-white text-[9px] flex items-center justify-center font-bold">A</span>
                        Must Meet ALL (Required Criteria)
                      </p>
                      <div className="space-y-2">
                        {(guidelines?.must_meet || mockMustMeet()).map((item: import('../../lib/types').GuidelineCriteria, i: number) => (
                          <div key={i} className={cn('criteria-item', item.status === 'MET' ? 'met' : item.status === 'UNMET' ? 'unmet' : 'na')}>
                            {item.status === 'MET' ? <CheckCircle size={13} className="text-green-600 flex-shrink-0 mt-0.5" /> :
                             item.status === 'UNMET' ? <XCircle size={13} className="text-red-600 flex-shrink-0 mt-0.5" /> :
                             <Minus size={13} className="text-slate-400 flex-shrink-0 mt-0.5" />}
                            <div>
                              <p className="text-xs font-semibold">{item.label}</p>
                              {item.detail && <p className="text-xs opacity-80 mt-0.5">{item.detail}</p>}
                              {item.evidence && <p className="text-[11px] italic opacity-70 mt-0.5">"{item.evidence}"</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Should meet (any) */}
                    <div>
                      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <span className="w-4 h-4 bg-blue-500 rounded text-white text-[9px] flex items-center justify-center font-bold">B</span>
                        Should Meet (Any of the Following)
                      </p>
                      <div className="space-y-2">
                        {(guidelines?.should_meet || mockShouldMeet()).map((item: import('../../lib/types').GuidelineCriteria, i: number) => (
                          <div key={i} className={cn('criteria-item', item.status === 'MET' ? 'met' : 'na')}>
                            {item.status === 'MET' ? <CheckCircle size={13} className="text-green-600 flex-shrink-0" /> : <Minus size={13} className="text-slate-400 flex-shrink-0" />}
                            <p className="text-xs">{item.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Exclusion criteria */}
                    <div>
                      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <span className="w-4 h-4 bg-red-500 rounded text-white text-[9px] flex items-center justify-center font-bold">!</span>
                        Exclusion Criteria (Red Flags)
                      </p>
                      <div className="space-y-2">
                        {(guidelines?.exclusions || mockExclusions()).map((item: import('../../lib/types').GuidelineCriteria, i: number) => (
                          <div key={i} className={cn('criteria-item', item.present ? 'unmet' : 'met')}>
                            {item.present ? <XCircle size={13} className="text-red-600 flex-shrink-0" /> : <CheckCircle size={13} className="text-green-600 flex-shrink-0" />}
                            <p className="text-xs">{item.label} — <span className="font-semibold">{item.present ? 'PRESENT' : 'Not Present'}</span></p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                      <a href="#" className="inline-flex items-center gap-1.5 text-xs text-primary-600 hover:underline font-medium">
                        <ExternalLink size={12} /> View Full MCG Guideline Document
                      </a>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* ── Documents Tab ─────────────────────────────────── */}
            {activeTab === 'documents' && (
              <div className="space-y-3 animate-slide-up">
                {documents.length === 0 ? (
                  <Alert type="warning" title="No Documents Submitted">
                    No supporting documentation was submitted with this PA request. Consider requesting additional information.
                  </Alert>
                ) : documents.map((doc, i) => (
                  <div key={i} className="card p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                    <div className="p-2.5 bg-slate-100 rounded-xl flex-shrink-0">
                      <FileText size={18} className="text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{doc.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {doc.category?.replace(/_/g,' ')} · {doc.size_kb}KB · Uploaded {fmt.date(doc.uploaded_at)}
                      </p>
                      {doc.ai_summary && (
                        <p className="text-xs text-slate-500 mt-1 italic">AI: "{doc.ai_summary}"</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"><Eye size={15} /></button>
                      <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"><Download size={15} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── History Tab ───────────────────────────────────── */}
            {activeTab === 'history' && (
              <Card title="Case Timeline" className="animate-slide-up">
                <div className="relative pl-8 border-l-2 border-slate-200 space-y-4">
                  {history.map((ev, i) => (
                    <div key={i} className="relative">
                      <div className={cn('timeline-dot -left-[21px]',
                        ev.type === 'DECISION' ? 'bg-green-500' :
                        ev.type === 'AI_COMPLETE' ? 'bg-blue-500' :
                        ev.type === 'DENIED' ? 'bg-red-500' :
                        'bg-slate-300'
                      )} />
                      <div className="card p-3">
                        <div className="flex items-start justify-between">
                          <p className="text-xs font-bold text-slate-800">{ev.label}</p>
                          <p className="text-[10px] text-slate-400 flex-shrink-0 ml-3">{fmt.dateTime(ev.timestamp)}</p>
                        </div>
                        {ev.description && <p className="text-xs text-slate-600 mt-1">{ev.description}</p>}
                        {ev.actor && <p className="text-[10px] text-slate-400 mt-1">by {ev.actor}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* ── Decision Panel (right) ──────────────────────────── */}
          <div className="xl:w-80 xl:flex-shrink-0 space-y-4">
            {/* Decision selector */}
            <div className="card p-4">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Decision</p>

              {/* 3-button decision selector */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <button
                  type="button"
                  className={cn('decision-btn decision-btn-approve', decision === 'APPROVED' && 'selected')}
                  onClick={() => setDecision('APPROVED')}
                >
                  <CheckCircle size={20} />
                  <span>Approve</span>
                </button>
                <button
                  type="button"
                  className={cn('decision-btn decision-btn-deny', decision === 'DENIED' && 'selected')}
                  onClick={() => setDecision('DENIED')}
                >
                  <XCircle size={20} />
                  <span>Deny</span>
                </button>
                <button
                  type="button"
                  className={cn('decision-btn decision-btn-pend', decision === 'PENDED' && 'selected')}
                  onClick={() => setDecision('PENDED')}
                >
                  <Clock size={20} />
                  <span>Pend</span>
                </button>
              </div>
              {errors.decision && <p className="text-xs text-red-500 mb-3">{errors.decision}</p>}

              {/* Approve fields */}
              {decision === 'APPROVED' && (
                <div className="space-y-3 border-t border-green-100 pt-3 animate-slide-up">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="form-label">Approved Qty</label>
                      <input type="number" className="form-input" placeholder={c.quantity?.toString() || '1'} value={approvedQty} onChange={e => setApprovedQty(e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label">Duration</label>
                      <input type="number" className="form-input" placeholder="e.g. 90" value={approvedDuration} onChange={e => setApprovedDuration(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Duration Unit</label>
                    <select className="form-input bg-white" value={approvedDurationUnit} onChange={e => setApprovedDurationUnit(e.target.value)}>
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                      <option value="months">Months</option>
                      <option value="visits">Visits</option>
                    </select>
                  </div>
                  <div>
                    <label className={cn('form-label', errors.authStartDate && "text-red-500")}>Auth Start Date *</label>
                    <input type="date" className={cn('form-input', errors.authStartDate && 'error')} value={authStartDate} onChange={e => setAuthStartDate(e.target.value)} />
                  </div>
                  <div>
                    <label className={cn('form-label', errors.authEndDate && "text-red-500")}>Auth End Date *</label>
                    <input type="date" className={cn('form-input', errors.authEndDate && 'error')} value={authEndDate} onChange={e => setAuthEndDate(e.target.value)} />
                  </div>
                </div>
              )}

              {/* Deny fields */}
              {decision === 'DENIED' && (
                <div className="space-y-3 border-t border-red-100 pt-3 animate-slide-up">
                  <div>
                    <label className={cn('form-label', errors.denialReason && "text-red-500")}>Denial Reason *</label>
                    <select className={cn('form-input bg-white', errors.denialReason && 'error')} value={denialReason} onChange={e => setDenialReason(e.target.value)}>
                      <option value="">Select reason…</option>
                      {DENIAL_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    {errors.denialReason && <p className="text-xs text-red-500 mt-0.5">{errors.denialReason}</p>}
                  </div>
                  <div>
                    <label className="form-label">Denial Sub-Reason</label>
                    <input type="text" className="form-input" placeholder="More specific code/reason" value={denialSubReason} onChange={e => setDenialSubReason(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Alternative Treatment</label>
                    <textarea className="form-input resize-none text-xs" rows={2} placeholder="Suggest alternative treatments..." value={altTreatment} onChange={e => setAltTreatment(e.target.value)} />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="rounded border-slate-300" checked={requiresMD} onChange={e => setRequiresMD(e.target.checked)} />
                    <span className="text-xs font-medium text-slate-700">Requires MD/Physician co-signature</span>
                  </label>
                  {requiresMD && (
                    <Alert type="warning">Denial will be held pending physician co-signature.</Alert>
                  )}
                </div>
              )}

              {/* Pend fields */}
              {decision === 'PENDED' && (
                <div className="space-y-3 border-t border-orange-100 pt-3 animate-slide-up">
                  <div>
                    <label className={cn('form-label', errors.pendReason && "text-red-500")}>Pend Reason *</label>
                    <select className={cn('form-input bg-white', errors.pendReason && 'error')} value={pendReason} onChange={e => setPendReason(e.target.value)}>
                      <option value="">Select reason…</option>
                      {PEND_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={cn('form-label', errors.pendItems && "text-red-500")}>Information Requested *</label>
                    <div className="space-y-1.5">
                      {PEND_ITEMS.map(item => (
                        <label key={item} className="flex items-start gap-2 cursor-pointer p-1.5 hover:bg-slate-50 rounded-lg">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 mt-0.5 flex-shrink-0"
                            checked={pendItems.includes(item)}
                            onChange={e => setPendItems(prev => e.target.checked ? [...prev, item] : prev.filter(i => i !== item))}
                          />
                          <span className="text-xs text-slate-700">{item}</span>
                        </label>
                      ))}
                    </div>
                    {errors.pendItems && <p className="text-xs text-red-500">{errors.pendItems}</p>}
                  </div>
                </div>
              )}
            </div>

            {/* Clinical notes */}
            <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Clinical Notes</p>
                <div className="flex items-center gap-1.5">
                  {autoSaved && (
                    <div className="flex items-center gap-1 text-[10px] text-green-600">
                      <div className="autosave-dot" />
                      Saved
                    </div>
                  )}
                  <span className="text-[10px] text-slate-400">{clinicalNotes.length}/5000</span>
                </div>
              </div>
              <textarea
                ref={notesRef}
                className="form-input resize-none text-xs"
                rows={6}
                maxLength={5000}
                placeholder="Document your clinical rationale, observations, and decision basis here. Notes are auto-saved every 30 seconds."
                value={clinicalNotes}
                onChange={e => setClinicalNotes(e.target.value)}
              />
              <p className="text-[10px] text-slate-400 mt-1">Auto-saves every 30 seconds</p>
            </div>

            {/* Action buttons */}
            <div className="space-y-2">
              <Button
                className="w-full"
                variant={decision === 'APPROVED' ? 'success' : decision === 'DENIED' ? 'danger' : decision === 'PENDED' ? 'warning' : 'primary'}
                icon={<Send size={15} />}
                onClick={handleFinalizeDecision}
                disabled={!decision}
              >
                Finalize Decision
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Save size={13} />}
                  onClick={async () => {
                    try {
                      await reviewApi.saveDraft(id as string, clinicalNotes);
                      setAutoSaved(true); toast.success('Draft saved');
                    } catch { toast.success('Draft saved (Demo)'); }
                  }}
                >
                  Save Draft
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Phone size={13} />}
                  onClick={() => toast.info('P2P request feature: open modal')}
                >
                  P2P Request
                </Button>
              </div>
            </div>

            {/* AI recommendation quick view */}
            <div className="card p-3 bg-slate-50">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">AI Recommendation</p>
              <div className={cn('flex items-center gap-2 text-sm font-bold',
                ai?.recommendation === 'APPROVE' ? 'text-green-700' :
                ai?.recommendation === 'DENY' ? 'text-red-700' : 'text-orange-700'
              )}>
                {ai?.recommendation === 'APPROVE' ? <ThumbsUp size={14} /> : ai?.recommendation === 'DENY' ? <ThumbsDown size={14} /> : <AlertTriangle size={14} />}
                {ai?.recommendation} ({ai?.confidence_score || 94}% confidence)
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Click the AI Analysis tab to see full reasoning
              </p>
            </div>
          </div>
        </div>

        {/* Confirm Decision Modal */}
        <Modal
          isOpen={confirmModal}
          onClose={() => setConfirmModal(false)}
          title="Confirm Decision"
          size="md"
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirmModal(false)}>Cancel</Button>
              <Button
                variant={decision === 'APPROVED' ? 'success' : decision === 'DENIED' ? 'danger' : 'warning'}
                loading={submitting}
                onClick={handleSubmitDecision}
              >
                Confirm {decision}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Alert type={decision === 'APPROVED' ? 'success' : decision === 'DENIED' ? 'error' : 'warning'}
              title={`Confirm: ${decision} — ${c.pa_number}`}>
              <p className="text-sm">
                You are about to <strong>{decision?.toLowerCase()}</strong> the prior authorization for:
              </p>
            </Alert>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Patient</span><span className="font-semibold">{c.patient_name}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Service</span><span className="font-semibold">{c.service_description}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Decision</span><span className="font-bold">{decision}</span></div>
              {decision === 'DENIED' && denialReason && (
                <div className="flex justify-between"><span className="text-slate-500">Denial Reason</span><span className="font-semibold text-right max-w-[200px]">{DENIAL_REASONS.find(r => r.value === denialReason)?.label}</span></div>
              )}
              {decision === 'DENIED' && (
                <Alert type="warning" className="mt-2">
                  This denial will {requiresMD ? 'require physician co-signature before communication.' : 'trigger an automatic notification to the provider and member.'}
                </Alert>
              )}
            </div>
            {!clinicalNotes && (
              <Alert type="info">No clinical notes added. Documenting your rationale is strongly recommended.</Alert>
            )}
          </div>
        </Modal>
      </Layout>
    </>
  );
};

// ─── Helper components ────────────────────────────────────────────────────────
const InfoRow: React.FC<{ l: string; v: string; mono?: boolean; badge?: string }> = ({ l, v, mono, badge }) => (
  <div className="flex items-start justify-between gap-3">
    <span className="text-[10px] text-slate-400 uppercase tracking-wide flex-shrink-0 pt-0.5">{l}</span>
    {badge ? (
      <span className={cn('badge text-[10px]', badge)}>{v}</span>
    ) : (
      <span className={cn('text-xs text-slate-800 text-right', mono && 'font-mono')}>{v || '—'}</span>
    )}
  </div>
);

function getAge(dob?: string): number {
  if (!dob) return 0;
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
}

// ─── Mock data ────────────────────────────────────────────────────────────────
function mockCaseData() {
  return {
    pa_id:'demo-1', pa_number:'PA-2026-001234', patient_name:'Sarah Johnson',
    member_id:'MB12345678', dob:'1978-03-15', gender:'Female', phone:'(555) 123-4567',
    payer:'UnitedHealthcare', coverage_status:'Active', group_number:'GRP987654',
    effective_date:'2025-01-01', term_date:null, pcp_name:'Dr. David Park (NPI: 1112223333)',
    primary_dx_code:'M54.5', primary_dx_desc:'Low back pain',
    secondary_dx_1:'M51.16 — Intervertebral disc degeneration, lumbar region',
    procedure_code:'72148', service_description:'MRI Lumbar Spine Without Contrast',
    service_type:'Diagnostic Imaging', place_of_service:'Outpatient Hospital (22)',
    urgency:'URGENT', quantity:1, frequency:'Once', duration:'1 day', estimated_cost:'$1,250',
    provider_name:'Dr. Robert Smith, MD', provider_specialty:'Orthopedic Surgery',
    facility_name:"St. Mary's Medical Center",
    received_at: new Date(Date.now()-16*3600000).toISOString(),
    deadline: new Date(Date.now()+8*3600000).toISOString(),
    assigned_to:'RN Emily Parker',
    clinical_summary:'Patient is a 48-year-old female presenting with 6 weeks of progressively worsening low back pain with right-leg radiculopathy. Pain rated 7/10, aggravated by prolonged sitting and standing. She has completed 12 sessions of physical therapy and a 4-week course of ibuprofen 800mg TID with only partial relief. She reports tingling and occasional weakness in the right lower extremity. MRI is requested to evaluate for disc herniation and nerve root compression prior to consideration of surgical intervention.',
    chief_complaint:'Low back pain with right leg radiculopathy × 6 weeks',
    hpi:'Progressive onset after lifting incident 6 weeks ago. Pain is 7/10, sharp and radiating down right posterior thigh to foot. Worse with flexion and prolonged sitting.',
    exam_findings:'Positive straight leg raise right side at 45°. Decreased sensation L4-L5 right dermatomal distribution. Motor strength 4/5 right EHL.',
    lab_results:'ESR: 12 mm/hr (normal), CRP: 0.3 mg/L (normal), CBC: WNL',
    prior_treatments:'Physical therapy × 12 sessions over 4 weeks — partial relief only. NSAIDs (ibuprofen 800mg TID × 4 weeks) — inadequate pain control. Chiropractic × 8 sessions — no lasting benefit.',
    draft_notes:'',
  };
}

function mockAIAnalysis() {
  return {
    recommendation:'APPROVE', confidence_score:94, risk_level:'LOW',
    doc_completeness:97, similar_cases_count:2847, similar_approved_pct:89,
    model_version:'ClinicalBERT v2.3.1', processing_time:'3.2s',
    processed_at: new Date(Date.now()-15*3600000).toISOString(),
    rationale:'Based on submitted documentation, the patient presents with documented low back pain with radiculopathy and failure of conservative treatment including physical therapy (12 sessions) and NSAIDs (4 weeks). Positive SLR test at 45° and dermatomal sensory deficit support structural pathology. MRI lumbar spine is medically necessary per MCG Imaging Guidelines, Criteria Set A: Low Back Pain, to evaluate for disc herniation and nerve root compression. All required criteria have been met with strong clinical documentation.',
    criteria_met: [
      { label: 'Conservative treatment ≥6 weeks documented', detail: 'PT × 12 sessions + NSAIDs × 4 weeks documented' },
      { label: 'Radicular symptoms present', detail: 'Right leg radiculopathy with positive SLR at 45°' },
      { label: 'Neurological deficit documented', detail: 'Sensory deficit L4-L5 distribution, motor 4/5 EHL' },
      { label: 'Clinical documentation complete', detail: '97% completeness score' },
      { label: 'No exclusion criteria present', detail: 'No infection, malignancy, or fracture indicators' },
    ],
    criteria_unmet: [],
    criteria_na: [{ label: 'Prior spine surgery' }, { label: 'Myelopathy' }],
    missing_docs: [],
    conflicting_factors: [],
    supporting_evidence: [
      { source: 'MCG Care Guidelines 28th Ed.', text: 'MRI indicated for radiculopathy after ≥4 weeks conservative care with positive SLR or neurological deficit' },
      { source: 'ACP/APS Low Back Pain Guideline', text: 'MRI appropriate when severe/progressive neurological deficits or serious underlying condition suspected' },
    ],
    treatment_timeline: [
      { date: 'Jan 2026', treatment: 'NSAIDs initiated (ibuprofen 800mg TID)', outcome: 'Partial relief' },
      { date: 'Jan–Feb 2026', treatment: 'Physical therapy × 12 sessions', outcome: 'Partial benefit, radiculopathy persists' },
      { date: 'Feb 2026', treatment: 'Chiropractic × 8 sessions', outcome: 'No lasting benefit' },
    ],
    extracted: {
      chief_complaint: 'Low back pain with right-sided radiculopathy × 6 weeks',
      hpi: 'Progressive onset post-lifting injury. 7/10 pain radiating L4-L5 distribution right side. Positive SLR 45°.',
      exam_findings: 'Positive SLR right 45°. Decreased sensation L4-L5 right. Motor strength 4/5 right EHL.',
      medications: ['Ibuprofen 800mg TID (ongoing)', 'Cyclobenzaprine 5mg PRN (prescribed Jan 2026)', 'Omeprazole 20mg QD (GI protection)'],
      allergies: 'NKDA',
    },
  };
}

function mockGuidelines() {
  return {
    name: 'MCG: Imaging for Low Back Pain (A-0529)',
    version: '28th Edition, 2026',
    effective_date: 'January 1, 2026',
    overview: 'Lumbar spine MRI is appropriate for patients with low back pain who have failed conservative management for ≥6 weeks, have radicular symptoms with positive neurological findings, or have red flag symptoms suggesting serious pathology (infection, malignancy, fracture).',
    must_meet: [
      { label: 'Conservative treatment failure (≥6 weeks)', status: 'MET', detail: 'PT × 12 sessions + NSAIDs documented', evidence: '12 sessions physical therapy with partial relief only' },
      { label: 'Appropriate clinical indication documented', status: 'MET', detail: 'Low back pain with radiculopathy', evidence: 'Clinical notes confirm L4-L5 radiculopathy' },
      { label: 'Physical examination documented', status: 'MET', detail: 'Positive SLR, neurological deficit noted', evidence: 'Positive SLR 45° right, sensory deficit L4-L5' },
    ],
    should_meet: [
      { label: 'Radicular pain pattern present', status: 'MET' },
      { label: 'Positive provocative test (SLR, FABER)', status: 'MET' },
      { label: 'Neurological deficit (motor/sensory/reflex)', status: 'MET' },
      { label: 'Prior imaging not diagnostic', status: 'NA' },
    ],
    exclusions: [
      { label: 'Signs of spinal infection (fever, elevated ESR)', present: false },
      { label: 'History of cancer with new back pain', present: false },
      { label: 'Cauda equina syndrome symptoms', present: false },
      { label: 'Recent significant spinal trauma', present: false },
      { label: 'Osteoporosis with vertebral fracture concern', present: false },
    ],
  };
}

function mockHistory() {
  return [
    { label: 'PA Submitted', timestamp: new Date(Date.now()-16*3600000).toISOString(), description: 'Submitted via Provider Portal by Dr. Robert Smith', actor: 'Dr. Robert Smith', type: 'SUBMITTED' },
    { label: 'AI Processing Started', timestamp: new Date(Date.now()-16*3600000+60000).toISOString(), description: 'NLP extraction, ICD-10/CPT validation, criteria matching initiated', actor: 'AI Engine v2.3.1', type: 'AI_PROCESSING' },
    { label: 'AI Analysis Complete', timestamp: new Date(Date.now()-16*3600000+3*60000).toISOString(), description: 'AI recommendation: APPROVE (94% confidence). Priority score: 78. Routed to URGENT queue.', actor: 'AI Engine v2.3.1', type: 'AI_COMPLETE' },
    { label: 'Assigned to Reviewer', timestamp: new Date(Date.now()-15*3600000).toISOString(), description: 'Auto-assigned to RN Emily Parker based on workload balancing', actor: 'System', type: 'ASSIGNED' },
    { label: 'Under Clinical Review', timestamp: new Date(Date.now()-2*3600000).toISOString(), description: 'Reviewer opened case in workbench', actor: 'RN Emily Parker', type: 'IN_REVIEW' },
  ];
}

function mockDocuments() {
  return [
    { name: 'clinical_notes_03052026.pdf', category: 'CLINICAL_NOTES', size_kb: 248, uploaded_at: new Date(Date.now()-16*3600000).toISOString(), ai_summary: 'Office visit note documenting LBP with radiculopathy, positive SLR, conservative treatment history' },
    { name: 'pt_progress_notes_Feb2026.pdf', category: 'CLINICAL_NOTES', size_kb: 182, uploaded_at: new Date(Date.now()-16*3600000).toISOString(), ai_summary: '12-session PT discharge summary — partial improvement, radiculopathy persists' },
    { name: 'xray_lumbar_02202026.pdf', category: 'IMAGING_REPORTS', size_kb: 1240, uploaded_at: new Date(Date.now()-16*3600000).toISOString(), ai_summary: 'Lumbar X-ray — mild L4-L5 disc space narrowing, no acute fracture' },
    { name: 'prescription_MRI_order.pdf', category: 'PRESCRIPTION', size_kb: 45, uploaded_at: new Date(Date.now()-16*3600000).toISOString(), ai_summary: 'MRI lumbar spine without contrast — ordered by Dr. Robert Smith' },
  ];
}

function mockCriteriaMet() {
  return [
    { label: 'Conservative treatment ≥6 weeks documented', detail: 'PT × 12 sessions + NSAIDs × 4 weeks' },
    { label: 'Radicular symptoms with positive SLR', detail: 'Positive at 45° right side' },
    { label: 'Neurological deficit present', detail: 'Sensory L4-L5, motor 4/5 EHL right' },
    { label: 'No exclusion criteria', detail: 'No infection, malignancy, or fracture signs' },
    { label: 'Documentation completeness ≥90%', detail: '97% complete' },
  ];
}

function mockMustMeet() {
  return [
    { label: 'Conservative treatment failure (≥6 weeks)', status: 'MET', detail: 'PT × 12 sessions, NSAIDs × 4 weeks', evidence: '12 sessions of PT with only partial relief documented' },
    { label: 'Appropriate clinical indication documented', status: 'MET', detail: 'LBP with L4-L5 radiculopathy' },
    { label: 'Physical examination with findings documented', status: 'MET', detail: 'Positive SLR, sensory deficit, motor weakness', evidence: 'SLR positive at 45°, 4/5 EHL strength' },
  ];
}

function mockShouldMeet() {
  return [
    { label: 'Radicular pain pattern present', status: 'MET' },
    { label: 'Positive provocative test (SLR / FABER)', status: 'MET' },
    { label: 'Objective neurological deficit', status: 'MET' },
    { label: 'Prior imaging not diagnostic', status: 'NA' },
  ];
}

function mockExclusions() {
  return [
    { label: 'Signs of spinal infection (fever, elevated ESR)', present: false },
    { label: 'History of malignancy with new back pain', present: false },
    { label: 'Cauda equina syndrome symptoms', present: false },
    { label: 'Recent significant trauma', present: false },
  ];
}

export default CaseReviewPage;
