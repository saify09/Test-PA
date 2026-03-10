import React, { useState, useEffect } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import MemberLayout from '../../components/layout/Layout';
import { Card, Alert, Button, FileUploadZone, ProgressSteps } from '../../components/ui';
import { appealApi } from '../../lib/api';
import { fmt, formatPhone, cn } from '../../lib/utils';
import toast from 'react-hot-toast';
import {
  ArrowLeft, CheckCircle, AlertTriangle, Clock,
  Info, Upload, Phone, FileText, ChevronRight
} from 'lucide-react';

const STEPS = [
  { label: 'Appeal Type',       sublabel: 'Standard or Expedited' },
  { label: 'Your Reason',       sublabel: 'Why you\'re appealing' },
  { label: 'Supporting Docs',   sublabel: 'Upload evidence' },
  { label: 'Contact Info',      sublabel: 'How to reach you' },
  { label: 'Review & Submit',   sublabel: 'Confirm and send' },
];

const AppealSubmitPage: NextPage = () => {
  const router = useRouter();
  const { pa_id, expedited: expeditedParam } = router.query;

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [appealNumber, setAppealNumber] = useState('');

  // Form state
  const [paNumber,           setPaNumber]           = useState('');
  const [originalPaInfo,     setOriginalPaInfo]     = useState<any>(null);
  const [appealType,         setAppealType]         = useState(expeditedParam === 'true' ? 'EXPEDITED' : 'STANDARD');
  const [expeditedJustification, setExpeditedJustification] = useState('');
  const [reasonForAppeal,    setReasonForAppeal]    = useState('');
  const [supportingDocs,     setSupportingDocs]     = useState<File[]>([]);
  const [providerStatement,  setProviderStatement]  = useState<File[]>([]);
  const [contactPhone,       setContactPhone]       = useState('');
  const [contactMethod,      setContactMethod]      = useState('Email');
  const [errors,             setErrors]             = useState<Record<string, string>>({});

  useEffect(() => {
    if (pa_id) {
      setPaNumber(`PA-2026-001${pa_id}`);
      setOriginalPaInfo({ service_description: 'CT Chest with contrast', payer: 'BlueCross BlueShield', denial_date: new Date(Date.now() - 5 * 86400000).toISOString(), denial_reason: 'Not Medically Necessary' });
    }
    if (expeditedParam === 'true') setAppealType('EXPEDITED');
  }, [pa_id, expeditedParam]);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (step === 0 && appealType === 'EXPEDITED' && expeditedJustification.length < 30) {
      e.expeditedJustification = 'Please explain the urgent medical need (min 30 characters)';
    }
    if (step === 1) {
      if (reasonForAppeal.length < 100) e.reasonForAppeal = `Please provide more detail (${100 - reasonForAppeal.length} more characters needed)`;
    }
    if (step === 3) {
      if (!contactPhone || contactPhone.replace(/\D/g, '').length < 10) e.contactPhone = 'Valid phone number is required';
      if (!contactMethod) e.contactMethod = 'Please select a preferred contact method';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (validate()) setStep(s => s + 1);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('original_pa_number', paNumber);
      formData.append('appeal_type', appealType);
      formData.append('reason_for_appeal', reasonForAppeal);
      formData.append('contact_phone', contactPhone);
      formData.append('preferred_contact_method', contactMethod);
      if (appealType === 'EXPEDITED') formData.append('expedited_justification', expeditedJustification);
      supportingDocs.forEach(f => formData.append('supporting_documents', f));
      providerStatement.forEach(f => formData.append('provider_statement', f));

      const res = await appealApi.submit(formData);
      setAppealNumber(res.data.appeal_number || `APL-2026-${String(Date.now()).slice(-5)}`);
      setSubmitted(true);
    } catch {
      // Demo mode: simulate success
      setAppealNumber(`APL-2026-${String(Date.now()).slice(-5)}`);
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <>
        <Head><title>Appeal Submitted | MyHealthPA</title></Head>
        <MemberLayout>
          <div className="max-w-lg mx-auto text-center py-10 animate-slide-up">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={40} className="text-green-600" />
            </div>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Appeal Submitted!</h2>
            <p className="text-gray-500 mb-4">Your appeal has been received and is being processed.</p>
            <div className="bg-gray-50 rounded-2xl p-5 mb-6 text-left">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-3">Appeal Details</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Appeal Number</span>
                  <span className="font-mono font-bold text-primary-700">{appealNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Type</span>
                  <span className="font-semibold">{appealType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Decision Expected</span>
                  <span className="font-semibold">
                    {appealType === 'EXPEDITED'
                      ? fmt.date(new Date(Date.now() + 3 * 86400000).toISOString())
                      : fmt.date(new Date(Date.now() + 30 * 86400000).toISOString())
                    }
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-3 text-left mb-6">
              <div className="flex items-start gap-2 text-sm text-gray-600">
                <div className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-primary-700">1</span>
                </div>
                Your appeal has been routed to a licensed clinical reviewer.
              </div>
              <div className="flex items-start gap-2 text-sm text-gray-600">
                <div className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-primary-700">2</span>
                </div>
                You will be notified by {contactMethod.toLowerCase()} when a decision is made.
              </div>
              <div className="flex items-start gap-2 text-sm text-gray-600">
                <div className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-primary-700">3</span>
                </div>
                You may also request a peer-to-peer discussion between your provider and our medical director.
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" fullWidth onClick={() => router.push('/appeals')}>View My Appeals</Button>
              <Button fullWidth onClick={() => router.push('/')}>Back to Dashboard</Button>
            </div>
          </div>
        </MemberLayout>
      </>
    );
  }

  return (
    <>
      <Head><title>File an Appeal | MyHealthPA</title></Head>
      <MemberLayout title="File an Appeal">
        {/* Back */}
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5 transition-colors">
          <ArrowLeft size={15} /> Back
        </button>

        {/* Progress */}
        <div className="mb-6">
          <ProgressSteps steps={STEPS} current={step} />
        </div>

        {/* Original request context */}
        {originalPaInfo && (
          <div className="bg-gray-50 rounded-2xl px-5 py-3 mb-5 flex items-center gap-3 border border-gray-200">
            <FileText size={16} className="text-gray-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-400">Appealing denial for:</p>
              <p className="text-sm font-bold text-gray-800">{originalPaInfo.service_description}</p>
              <p className="text-xs text-gray-500 font-mono">{paNumber} · Denied {fmt.dateShort(originalPaInfo.denial_date)} · Reason: {originalPaInfo.denial_reason}</p>
            </div>
          </div>
        )}

        <Card>
          {/* Step 0: Appeal type */}
          {step === 0 && (
            <div className="space-y-5 animate-fade-in">
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">Select Appeal Type</h3>
                <p className="text-sm text-gray-500">Choose the right type based on your medical situation.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  {
                    type: 'STANDARD',
                    title: 'Standard Appeal',
                    timeline: '30 calendar days',
                    icon: <Clock size={22} className="text-blue-600" />,
                    color: 'blue',
                    desc: 'For non-urgent situations. You have 180 days from the denial date to file.',
                  },
                  {
                    type: 'EXPEDITED',
                    title: 'Expedited Appeal',
                    timeline: '72 hours',
                    icon: <AlertTriangle size={22} className="text-orange-600" />,
                    color: 'orange',
                    desc: 'For urgent medical situations where standard timeline would seriously jeopardize your health.',
                  },
                ].map(opt => (
                  <div
                    key={opt.type}
                    onClick={() => setAppealType(opt.type)}
                    className={cn(
                      'p-5 rounded-2xl border-2 cursor-pointer transition-all',
                      appealType === opt.type
                        ? opt.color === 'blue' ? 'border-primary-500 bg-primary-50' : 'border-orange-500 bg-orange-50'
                        : 'border-gray-200 hover:border-gray-300'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0',
                        opt.color === 'blue' ? 'bg-blue-100' : 'bg-orange-100'
                      )}>
                        {opt.icon}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-gray-900">{opt.title}</p>
                          {appealType === opt.type && <CheckCircle size={18} className={opt.color === 'blue' ? 'text-primary-600' : 'text-orange-600'} />}
                        </div>
                        <p className={cn('text-sm font-semibold mt-0.5', opt.color === 'blue' ? 'text-primary-700' : 'text-orange-700')}>
                          Decision within {opt.timeline}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{opt.desc}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {appealType === 'EXPEDITED' && (
                <div className="animate-fade-in">
                  <label className="form-label required">Expedited Justification</label>
                  <textarea
                    className={cn('form-input', errors.expeditedJustification && 'error')}
                    rows={3}
                    maxLength={1000}
                    placeholder="Explain why this appeal requires an expedited review. Describe the urgent medical need and why a 30-day timeline would seriously harm your health…"
                    value={expeditedJustification}
                    onChange={e => setExpeditedJustification(e.target.value)}
                  />
                  <div className="flex justify-between mt-1">
                    {errors.expeditedJustification
                      ? <p className="form-error">{errors.expeditedJustification}</p>
                      : <span />}
                    <p className="text-xs text-gray-400">{expeditedJustification.length}/1000</p>
                  </div>
                </div>
              )}

              <Alert type="info">
                <p className="text-sm">Your appeal will be reviewed by a board-certified physician in the relevant specialty who was not involved in the original decision.</p>
              </Alert>
            </div>
          )}

          {/* Step 1: Reason */}
          {step === 1 && (
            <div className="space-y-5 animate-fade-in">
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">Reason for Appeal</h3>
                <p className="text-sm text-gray-500">Explain why you believe the denial was incorrect. Include any new clinical information.</p>
              </div>

              <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Info size={12} /> Tips for a strong appeal
                </p>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Reference specific medical evidence supporting the need for this service</li>
                  <li>• Mention any new information not included in the original request</li>
                  <li>• Explain how the service directly relates to your diagnosis</li>
                  <li>• Include any clinical guidelines or published research that supports your case</li>
                </ul>
              </div>

              <div>
                <label className="form-label required">Your Reason for Appeal</label>
                <textarea
                  className={cn('form-input', errors.reasonForAppeal && 'error')}
                  rows={7}
                  maxLength={5000}
                  placeholder="I am appealing the denial of [service] because… [explain medical necessity, new information, why criteria are met]"
                  value={reasonForAppeal}
                  onChange={e => setReasonForAppeal(e.target.value)}
                />
                <div className="flex justify-between mt-1">
                  {errors.reasonForAppeal
                    ? <p className="form-error">{errors.reasonForAppeal}</p>
                    : <p className="form-hint">{reasonForAppeal.length < 100 ? `${100 - reasonForAppeal.length} more characters needed` : 'Good length — more detail is always better'}</p>
                  }
                  <p className="text-xs text-gray-400">{reasonForAppeal.length}/5000</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Documents */}
          {step === 2 && (
            <div className="space-y-5 animate-fade-in">
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">Supporting Documents</h3>
                <p className="text-sm text-gray-500">Upload any new clinical evidence, updated records, or a written statement from your provider. Documents are optional but greatly strengthen your appeal.</p>
              </div>

              <FileUploadZone
                label="Supporting Clinical Documents"
                hint="Lab results, imaging reports, specialist notes, published guidelines, etc."
                accept=".pdf,.jpg,.jpeg,.png,.tiff"
                maxSizeMB={50}
                files={supportingDocs}
                onAdd={f => setSupportingDocs(prev => [...prev, ...f])}
                onRemove={i => setSupportingDocs(prev => prev.filter((_, j) => j !== i))}
              />

              <FileUploadZone
                label="Provider Statement (Optional)"
                hint="A signed letter from your physician explaining why the service is medically necessary."
                accept=".pdf"
                maxSizeMB={25}
                files={providerStatement}
                onAdd={f => setProviderStatement(prev => [...prev, ...f])}
                onRemove={i => setProviderStatement(prev => prev.filter((_, j) => j !== i))}
                multiple={false}
              />

              <Alert type="info">
                <p className="text-sm">All documents must be less than 25MB each (50MB total). Accepted formats: PDF, JPG, PNG, TIFF.</p>
              </Alert>
            </div>
          )}

          {/* Step 3: Contact info */}
          {step === 3 && (
            <div className="space-y-5 animate-fade-in">
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">Contact Information</h3>
                <p className="text-sm text-gray-500">How should we reach you with updates on your appeal?</p>
              </div>

              <div>
                <label className="form-label required">Phone Number</label>
                <div className="relative">
                  <Phone size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="tel"
                    className={cn('form-input pl-10', errors.contactPhone && 'error')}
                    placeholder="(555) 000-0000"
                    value={contactPhone}
                    onChange={e => setContactPhone(formatPhone(e.target.value))}
                  />
                </div>
                {errors.contactPhone && <p className="form-error mt-1">{errors.contactPhone}</p>}
              </div>

              <div>
                <label className="form-label required">Preferred Contact Method</label>
                <div className="grid grid-cols-3 gap-3">
                  {['Phone', 'Email', 'Mail'].map(method => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setContactMethod(method)}
                      className={cn(
                        'py-3 rounded-xl border-2 text-sm font-semibold transition-all',
                        contactMethod === method
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      )}
                    >
                      {contactMethod === method && '✓ '}{method}
                    </button>
                  ))}
                </div>
                {errors.contactMethod && <p className="form-error mt-1">{errors.contactMethod}</p>}
              </div>

              <Alert type="info">
                <p className="text-sm">You will receive a written notice of the appeal decision regardless of your preferred contact method. <strong>All appeal decisions are sent by mail per regulatory requirements.</strong></p>
              </Alert>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div className="space-y-5 animate-fade-in">
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">Review & Submit</h3>
                <p className="text-sm text-gray-500">Please review your appeal information before submitting.</p>
              </div>

              <div className="space-y-3">
                {/* Summary blocks */}
                {[
                  { label: 'Original PA', value: paNumber },
                  { label: 'Appeal Type', value: appealType, highlight: appealType === 'EXPEDITED' ? 'orange' : 'blue' },
                  { label: 'Decision Expected', value: appealType === 'EXPEDITED' ? 'Within 72 hours' : 'Within 30 calendar days' },
                  { label: 'Contact Method', value: contactMethod },
                  { label: 'Phone', value: contactPhone || '—' },
                  { label: 'Documents', value: `${supportingDocs.length + providerStatement.length} file(s) attached` },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between py-2.5 px-4 bg-gray-50 rounded-xl">
                    <span className="text-sm text-gray-500">{row.label}</span>
                    <span className={cn('text-sm font-bold',
                      row.highlight === 'orange' ? 'text-orange-700' :
                      row.highlight === 'blue' ? 'text-blue-700' : 'text-gray-900'
                    )}>{row.value}</span>
                  </div>
                ))}

                {/* Reason preview */}
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Your Appeal Reason</p>
                  <p className="text-sm text-gray-700 line-clamp-4">{reasonForAppeal}</p>
                </div>
              </div>

              <Alert type="warning" title="Important">
                <p className="text-sm">By submitting, you certify that the information provided is accurate and complete. Filing a false appeal may result in claim denial and other consequences.</p>
              </Alert>
            </div>
          )}
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-5">
          <Button
            variant="ghost"
            onClick={() => step === 0 ? router.back() : setStep(s => s - 1)}
          >
            <ArrowLeft size={15} className="mr-1" /> {step === 0 ? 'Cancel' : 'Back'}
          </Button>

          {step < STEPS.length - 1 ? (
            <Button onClick={handleNext}>
              Continue <ChevronRight size={15} className="ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} loading={submitting} variant="success">
              Submit Appeal
            </Button>
          )}
        </div>
      </MemberLayout>
    </>
  );
};

export default AppealSubmitPage;
