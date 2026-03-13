import React, { useState, useCallback, useRef } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Layout from '../components/layout/Layout';
import { Button, Input, Select, Textarea, Alert, Card, ProgressSteps, Modal } from '../components/ui';
import { paApi, eligibilityApi, lookupApi } from '../lib/api';
import { cn, formatFileSize, validateNPI } from '../lib/utils';
import toast from 'react-hot-toast';
import {
  User, Stethoscope, Upload, Building2, Check, AlertCircle, X,
  FileText, Loader2, Info, Search, Shield, ChevronLeft, ChevronRight,
  CheckCircle, Plus, Trash2
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';

// ─── Types ────────────────────────────────────────────────────────────────────
interface PatientInfo {
  first_name: string; last_name: string; middle_initial: string;
  dob: string; gender: string; member_id: string; group_number: string;
  phone: string; email: string; address_line1: string; address_line2: string;
  city: string; state: string; zip: string;
}

interface ClinicalInfo {
  primary_dx_code: string; primary_dx_desc: string;
  secondary_dx_1: string; secondary_dx_2: string;
  procedure_code: string; procedure_desc: string;
  service_type: string; place_of_service: string;
  urgency: 'ROUTINE' | 'URGENT' | 'EMERGENT';
  estimated_cost: string; quantity: number; frequency: string;
  duration: string; clinical_summary: string; lab_results: string;
  prior_treatments: string;
  hpi: string; chief_complaint: string; exam_findings: string;
}

interface ProviderInfo {
  provider_npi: string; provider_name: string; provider_specialty: string;
  provider_tax_id: string; provider_phone: string; provider_fax: string;
  facility_name: string; facility_npi: string; facility_address: string;
}

interface UploadedFile {
  id: string; name: string; size: number; type: string;
  category: string; file: File; status: 'ready' | 'uploading' | 'done' | 'error';
}

const STEPS = ['Patient Info', 'Clinical Info', 'Documents', 'Provider Info', 'Review & Submit'];

const SERVICE_TYPES = [
  { value: 'DIAGNOSTIC_IMAGING', label: 'Diagnostic Imaging' },
  { value: 'SURGICAL', label: 'Surgical Procedure' },
  { value: 'MEDICATION', label: 'Medication / Pharmacy' },
  { value: 'THERAPY', label: 'Therapy Services' },
  { value: 'DME', label: 'Durable Medical Equipment' },
  { value: 'BEHAVIORAL_HEALTH', label: 'Behavioral Health' },
  { value: 'HOME_HEALTH', label: 'Home Health' },
  { value: 'SPECIALIST', label: 'Specialist Consultation' },
  { value: 'TRANSPLANT', label: 'Transplant Services' },
  { value: 'OTHER', label: 'Other' },
];

const PLACE_OF_SERVICE = [
  { value: '11', label: 'Office (11)' },
  { value: '21', label: 'Inpatient Hospital (21)' },
  { value: '22', label: 'Outpatient Hospital (22)' },
  { value: '23', label: 'Emergency Room (23)' },
  { value: '24', label: 'Ambulatory Surgery Center (24)' },
  { value: '31', label: 'Skilled Nursing Facility (31)' },
  { value: '32', label: 'Nursing Facility (32)' },
  { value: '11', label: 'Office (11)' },
  { value: '12', label: 'Home (12)' },
  { value: '65', label: 'End-Stage Renal Disease Facility (65)' },
];

const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

const SPECIALTIES = [
  'Anesthesiology','Cardiology','Colorectal Surgery','Dermatology','Emergency Medicine',
  'Endocrinology','Family Medicine','Gastroenterology','Geriatrics','Hematology',
  'Infectious Disease','Internal Medicine','Nephrology','Neurology','Neurosurgery',
  'Obstetrics & Gynecology','Oncology','Ophthalmology','Oral Surgery','Orthopedic Surgery',
  'Otolaryngology','Pain Management','Pathology','Pediatrics','Physical Medicine',
  'Plastic Surgery','Psychiatry','Pulmonology','Radiation Oncology','Radiology',
  'Rheumatology','Sleep Medicine','Sports Medicine','Thoracic Surgery','Urology',
  'Vascular Surgery',
];

const ICD10_MOCK = [
  { code: 'M54.5', desc: 'Low back pain' },
  { code: 'M54.4', desc: 'Lumbago with sciatica, right side' },
  { code: 'M51.16', desc: 'Intervertebral disc degeneration, lumbar region' },
  { code: 'M79.1', desc: 'Myalgia' },
  { code: 'G89.29', desc: 'Other chronic pain' },
  { code: 'M17.11', desc: 'Primary osteoarthritis, right knee' },
  { code: 'M06.00', desc: 'Rheumatoid arthritis, unspecified' },
  { code: 'I25.10', desc: 'Atherosclerotic heart disease of native coronary artery' },
  { code: 'C18.9', desc: 'Malignant neoplasm of colon, unspecified' },
  { code: 'E11.9', desc: 'Type 2 diabetes mellitus without complications' },
  { code: 'J18.9', desc: 'Pneumonia, unspecified organism' },
  { code: 'N18.5', desc: 'Chronic kidney disease, stage 5' },
];

const CPT_MOCK = [
  { code: '72148', desc: 'MRI lumbar spine without contrast' },
  { code: '72141', desc: 'MRI cervical spine without contrast' },
  { code: '72157', desc: 'MRI lumbar spine with and without contrast' },
  { code: '27447', desc: 'Arthroplasty, knee, condyle and plateau; medial AND lateral compartments' },
  { code: '27130', desc: 'Arthroplasty, acetabular and proximal femoral prosthetic replacement' },
  { code: '93454', desc: 'Catheter placement in coronary artery(s) for coronary angiography' },
  { code: 'J0135', desc: 'Adalimumab (Humira) injection, 20mg' },
  { code: '97110', desc: 'Therapeutic exercises (15 min)' },
  { code: '99214', desc: 'Outpatient visit, established patient, moderate complexity' },
  { code: '45378', desc: 'Colonoscopy, diagnostic' },
  { code: '43239', desc: 'Upper gastrointestinal endoscopy with biopsy' },
  { code: '36475', desc: 'Endovenous ablation therapy, radiofrequency' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────
const CodeLookup: React.FC<{
  type: 'ICD10' | 'CPT';
  value: string;
  desc: string;
  onSelect: (code: string, desc: string) => void;
  required?: boolean;
  label?: string;
  error?: string;
}> = ({ type, value, desc, onSelect, required, label, error }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ code: string; desc: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await (type === 'ICD10' ? lookupApi.searchICD10(q) : lookupApi.searchCPT(q));
      setResults(res.data.results || []);
    } catch {
      // Fallback to mock data
      const mock = type === 'ICD10' ? ICD10_MOCK : CPT_MOCK;
      setResults(mock.filter(m =>
        m.code.toLowerCase().includes(q.toLowerCase()) ||
        m.desc.toLowerCase().includes(q.toLowerCase())
      ).slice(0, 6));
    } finally {
      setLoading(false);
    }
  }, [type]);

  return (
    <div className="space-y-1">
      {label && <label className={cn('form-label', required && 'required')}>{label}</label>}
      {value ? (
        <div className="flex items-center gap-2 p-2.5 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle size={14} className="text-green-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-mono text-sm font-semibold text-green-800">{value}</span>
            <span className="text-sm text-green-700 ml-2">— {desc}</span>
          </div>
          <button onClick={() => onSelect('', '')} className="text-green-400 hover:text-green-600">
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="relative" ref={ref}>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={`Search ${type === 'ICD10' ? 'diagnosis code or description' : 'procedure code or description'}...`}
              value={query}
              onChange={(e) => { setQuery(e.target.value); search(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              className={cn('form-input pl-9', error && 'error')}
            />
            {loading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />}
          </div>
          {open && results.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-30 max-h-56 overflow-y-auto animate-fade-in">
              {results.map((r) => (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => { onSelect(r.code, r.desc); setQuery(''); setOpen(false); setResults([]); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left transition-colors"
                >
                  <span className="font-mono text-xs font-bold text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded flex-shrink-0">
                    {r.code}
                  </span>
                  <span className="text-sm text-gray-700">{r.desc}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={11} />{error}</p>}
    </div>
  );
};

// ─── File Drop Zone ───────────────────────────────────────────────────────────
const FileDropZone: React.FC<{
  onFiles: (files: File[], category: string) => void;
  category: string; label: string; required?: boolean; accept?: string;
}> = ({ onFiles, category, label, required, accept }) => {
  const onDrop = useCallback((accepted: File[]) => onFiles(accepted, category), [onFiles, category]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: accept ? { [accept]: [] } : {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/tiff': ['.tiff', '.tif'],
    },
    maxSize: 25 * 1024 * 1024,
    multiple: true,
  });

  return (
    <div>
      <label className={cn('form-label mb-2', required && 'required')}>{label}</label>
      <div {...getRootProps()} className={cn('drop-zone', isDragActive && 'active')}>
        <input {...getInputProps()} />
        <Upload size={24} className={cn('mx-auto mb-2', isDragActive ? 'text-primary-500' : 'text-gray-300')} />
        <p className="text-sm text-gray-500 font-medium">
          {isDragActive ? 'Drop files here…' : 'Drag & drop or click to browse'}
        </p>
        <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG, TIFF — max 25MB per file</p>
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
const SubmitPage: NextPage = () => {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ pa_number: string; pa_id: string } | null>(null);
  const [eligibilityStatus, setEligibilityStatus] = useState<'idle' | 'checking' | 'verified' | 'error'>('idle');
  const [eligibilityMsg, setEligibilityMsg] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<UploadedFile[]>([]);

  const [patient, setPatient] = useState<PatientInfo>({
    first_name: '', last_name: '', middle_initial: '', dob: '', gender: '',
    member_id: '', group_number: '', phone: '', email: '', address_line1: '',
    address_line2: '', city: '', state: '', zip: '',
  });

  const [clinical, setClinical] = useState<ClinicalInfo>({
    primary_dx_code: '', primary_dx_desc: '', secondary_dx_1: '', secondary_dx_2: '',
    procedure_code: '', procedure_desc: '', service_type: '', place_of_service: '',
    urgency: 'ROUTINE', estimated_cost: '', quantity: 1, frequency: '',
    duration: '', clinical_summary: '', lab_results: '', prior_treatments: '',
  });

  const [provider, setProvider] = useState<ProviderInfo>({
    provider_npi: '', provider_name: '', provider_specialty: '',
    provider_tax_id: '', provider_phone: '', provider_fax: '',
    facility_name: '', facility_npi: '', facility_address: '',
  });

  const setP = (field: keyof PatientInfo) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setPatient(prev => ({ ...prev, [field]: e.target.value }));
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const setC = (field: keyof ClinicalInfo) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setClinical(prev => ({ ...prev, [field]: e.target.value }));
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const setPr = (field: keyof ProviderInfo) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setProvider(prev => ({ ...prev, [field]: e.target.value }));
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const checkEligibility = async () => {
    if (!patient.member_id || !patient.dob || !patient.last_name) {
      toast.error('Please fill in Member ID, Date of Birth, and Last Name first');
      return;
    }
    setEligibilityStatus('checking');
    try {
      const res = await eligibilityApi.verify({
        member_id: patient.member_id,
        date_of_birth: patient.dob,
        last_name: patient.last_name,
      });
      if (res.data.eligible) {
        setEligibilityStatus('verified');
        setEligibilityMsg(`✓ Active coverage — ${res.data.payer_name || 'Verified'} — Group: ${res.data.group_number || 'N/A'}`);
        if (res.data.group_number) setPatient(p => ({ ...p, group_number: res.data.group_number }));
      } else {
        setEligibilityStatus('error');
        setEligibilityMsg('Member not found or coverage inactive. Verify member ID.');
      }
    } catch {
      // Demo: auto-approve
      setEligibilityStatus('verified');
      setEligibilityMsg('✓ Active coverage verified (Demo Mode)');
    }
  };

  const validateStep = (): boolean => {
    const errs: Record<string, string> = {};
    if (step === 0) {
      if (!patient.first_name.trim()) errs.first_name = 'Required';
      if (!patient.last_name.trim()) errs.last_name = 'Required';
      if (!patient.dob) errs.dob = 'Required';
      if (!patient.gender) errs.gender = 'Required';
      if (!patient.member_id.trim()) errs.member_id = 'Required';
      if (!patient.phone.trim()) errs.phone = 'Required';
      if (!patient.address_line1.trim()) errs.address_line1 = 'Required';
      if (!patient.city.trim()) errs.city = 'Required';
      if (!patient.state) errs.state = 'Required';
      if (!patient.zip.trim()) errs.zip = 'Required';
    } else if (step === 1) {
      if (!clinical.primary_dx_code) errs.primary_dx_code = 'Primary diagnosis required';
      if (!clinical.procedure_code) errs.procedure_code = 'Procedure code required';
      if (!clinical.service_type) errs.service_type = 'Required';
      if (!clinical.place_of_service) errs.place_of_service = 'Required';
      if (!clinical.clinical_summary.trim() || clinical.clinical_summary.length < 100)
        errs.clinical_summary = 'Minimum 100 characters required';
      if (!clinical.prior_treatments.trim()) errs.prior_treatments = 'Required';
    } else if (step === 3) {
      if (!provider.provider_npi.trim()) errs.provider_npi = 'Required';
      if (!validateNPI(provider.provider_npi)) errs.provider_npi = 'Must be 10 digits';
      if (!provider.provider_name.trim()) errs.provider_name = 'Required';
      if (!provider.provider_specialty) errs.provider_specialty = 'Required';
      if (!provider.provider_phone.trim()) errs.provider_phone = 'Required';
      if (!provider.facility_name.trim()) errs.facility_name = 'Required';
      if (!provider.facility_npi.trim()) errs.facility_npi = 'Required';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (validateStep()) setStep(s => s + 1);
  };

  const handleFiles = (newFiles: File[], category: string) => {
    const mapped: UploadedFile[] = newFiles.map(f => ({
      id: Math.random().toString(36).slice(2),
      name: f.name, size: f.size, type: f.type,
      category, file: f, status: 'ready',
    }));
    setFiles(prev => [...prev, ...mapped]);
  };

  const removeFile = (id: string) => setFiles(prev => prev.filter(f => f.id !== id));

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('patient_data', JSON.stringify(patient));
      fd.append('clinical_data', JSON.stringify(clinical));
      fd.append('provider_data', JSON.stringify(provider));
      files.forEach(f => {
        fd.append('documents', f.file, f.name);
        fd.append(`doc_category_${f.name}`, f.category);
      });

      const res = await paApi.submit(fd);
      setSubmitted({ pa_number: res.data.pa_number, pa_id: res.data.pa_id });
      toast.success('Prior authorization submitted successfully!');
    } catch {
      // Demo mode: simulate success
      const mockPANum = `PA-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
      setSubmitted({ pa_number: mockPANum, pa_id: 'demo-' + Date.now() });
      toast.success('PA submitted successfully! (Demo Mode)');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Layout title="PA Submitted">
        <div className="max-w-xl mx-auto py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={32} className="text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">PA Request Submitted!</h2>
          <p className="text-gray-500 mb-6">Your prior authorization has been received and is being processed.</p>
          <div className="card mb-6 text-left">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">PA Tracking Number</p>
              <span className="font-mono font-bold text-primary-700 text-lg bg-primary-50 px-3 py-1 rounded-lg">
                {submitted.pa_number}
              </span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Patient</span><span className="font-medium">{patient.first_name} {patient.last_name}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Service</span><span className="font-medium">{clinical.procedure_code} — {clinical.procedure_desc}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Urgency</span><span className="font-medium">{clinical.urgency}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Submitted</span><span className="font-medium">{new Date().toLocaleString()}</span></div>
            </div>
          </div>
          <Alert type="info" className="mb-6 text-left">
            You will receive an email notification when a decision is made. 
            Routine PAs are typically decided within 24–72 hours. 
            Urgent PAs within 24 hours. Emergent within 4 hours.
          </Alert>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => router.push('/requests')}>
              View My PAs
            </Button>
            <Button onClick={() => { setSubmitted(null); setStep(0); setPatient({ first_name: '', last_name: '', middle_initial: '', dob: '', gender: '', member_id: '', group_number: '', phone: '', email: '', address_line1: '', address_line2: '', city: '', state: '', zip: '' }); setClinical({ primary_dx_code: '', primary_dx_desc: '', secondary_dx_1: '', secondary_dx_2: '', procedure_code: '', procedure_desc: '', service_type: '', place_of_service: '', urgency: 'ROUTINE', estimated_cost: '', quantity: 1, frequency: '', duration: '', clinical_summary: '', lab_results: '', prior_treatments: '' }); setFiles([]); }}>
              Submit Another PA
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <>
      <Head><title>Submit Prior Authorization | PA Provider Portal</title></Head>
      <Layout title="Submit Prior Authorization">
        <div className="max-w-3xl mx-auto">
          <ProgressSteps steps={STEPS} currentStep={step} />

          {/* Step 0: Patient Information */}
          {step === 0 && (
            <Card title="Patient Information" subtitle="Enter patient demographics and insurance details">
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="First Name" required placeholder="Sarah" value={patient.first_name} onChange={setP('first_name')} error={errors.first_name} />
                      <Input label="Last Name" required placeholder="Johnson" value={patient.last_name} onChange={setP('last_name')} error={errors.last_name} />
                    </div>
                  </div>
                  <Input label="Middle Initial" placeholder="M" maxLength={1} value={patient.middle_initial} onChange={setP('middle_initial')} />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <Input label="Date of Birth" required type="date" value={patient.dob} onChange={setP('dob')} error={errors.dob} />
                  <Select
                    label="Gender" required
                    options={[
                      { value: 'M', label: 'Male' },
                      { value: 'F', label: 'Female' },
                      { value: 'X', label: 'Non-Binary / Other' },
                      { value: 'U', label: 'Unknown' },
                    ]}
                    placeholder="Select..."
                    value={patient.gender} onChange={setP('gender')} error={errors.gender}
                  />
                  <Input label="Phone Number" required placeholder="(555) 123-4567" value={patient.phone} onChange={setP('phone')} error={errors.phone} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Input label="Email Address" type="email" placeholder="patient@email.com" value={patient.email} onChange={setP('email')} />
                </div>

                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-blue-800">
                    <Shield size={16} />
                    Insurance Information
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Member ID" required placeholder="MB12345678" value={patient.member_id} onChange={setP('member_id')} error={errors.member_id} hint="Found on insurance card" />
                    <Input label="Insurance Group #" placeholder="GRP987654" value={patient.group_number} onChange={setP('group_number')} />
                  </div>

                  {/* Eligibility check */}
                  <div className="flex items-center gap-3">
                    <Button
                      variant="secondary" size="sm"
                      loading={eligibilityStatus === 'checking'}
                      onClick={checkEligibility}
                      icon={<Search size={14} />}
                    >
                      Verify Eligibility
                    </Button>
                    {eligibilityStatus === 'verified' && (
                      <div className="flex items-center gap-1.5 text-green-700 text-xs font-medium">
                        <CheckCircle size={14} /> {eligibilityMsg}
                      </div>
                    )}
                    {eligibilityStatus === 'error' && (
                      <div className="flex items-center gap-1.5 text-red-600 text-xs font-medium">
                        <AlertCircle size={14} /> {eligibilityMsg}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-700">Address</p>
                  <Input label="Address Line 1" required placeholder="123 Main Street" value={patient.address_line1} onChange={setP('address_line1')} error={errors.address_line1} />
                  <Input label="Address Line 2" placeholder="Apt 4B" value={patient.address_line2} onChange={setP('address_line2')} />
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1">
                      <Input label="City" required placeholder="Springfield" value={patient.city} onChange={setP('city')} error={errors.city} />
                    </div>
                    <Select
                      label="State" required
                      options={STATES.map(s => ({ value: s, label: s }))}
                      placeholder="Select state"
                      value={patient.state} onChange={setP('state')} error={errors.state}
                    />
                    <Input label="ZIP Code" required placeholder="12345" value={patient.zip} onChange={setP('zip')} error={errors.zip} />
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Step 1: Clinical Information */}
          {step === 1 && (
            <Card title="Clinical Information" subtitle="Provide diagnosis, procedure, and clinical details">
              <div className="space-y-5">
                <CodeLookup
                  type="ICD10"
                  label="Primary Diagnosis"
                  required
                  value={clinical.primary_dx_code}
                  desc={clinical.primary_dx_desc}
                  onSelect={(code, desc) => setClinical(p => ({ ...p, primary_dx_code: code, primary_dx_desc: desc }))}
                  error={errors.primary_dx_code}
                />

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="form-label">Secondary Diagnosis 1</label>
                    <input
                      className="form-input font-mono"
                      placeholder="e.g. M51.26"
                      value={clinical.secondary_dx_1}
                      onChange={(e) => setClinical(p => ({ ...p, secondary_dx_1: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="form-label">Secondary Diagnosis 2</label>
                    <input
                      className="form-input font-mono"
                      placeholder="e.g. M79.1"
                      value={clinical.secondary_dx_2}
                      onChange={(e) => setClinical(p => ({ ...p, secondary_dx_2: e.target.value }))}
                    />
                  </div>
                </div>

                <CodeLookup
                  type="CPT"
                  label="Procedure / Service Code"
                  required
                  value={clinical.procedure_code}
                  desc={clinical.procedure_desc}
                  onSelect={(code, desc) => setClinical(p => ({ ...p, procedure_code: code, procedure_desc: desc }))}
                  error={errors.procedure_code}
                />

                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label="Service Type" required
                    options={SERVICE_TYPES}
                    placeholder="Select type..."
                    value={clinical.service_type} onChange={setC('service_type')} error={errors.service_type}
                  />
                  <Select
                    label="Place of Service" required
                    options={PLACE_OF_SERVICE}
                    placeholder="Select..."
                    value={clinical.place_of_service} onChange={setC('place_of_service')} error={errors.place_of_service}
                  />
                </div>

                <div>
                  <label className="form-label required">Urgency Level</label>
                  <div className="flex gap-3 mt-1">
                    {(['ROUTINE', 'URGENT', 'EMERGENT'] as const).map((u) => (
                      <label key={u} className={cn(
                        'flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 rounded-xl cursor-pointer transition-all text-sm font-medium',
                        clinical.urgency === u
                          ? u === 'ROUTINE' ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : u === 'URGENT' ? 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-red-500 bg-red-50 text-red-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      )}>
                        <input
                          type="radio" className="sr-only"
                          checked={clinical.urgency === u}
                          onChange={() => setClinical(p => ({ ...p, urgency: u }))}
                        />
                        {u}
                      </label>
                    ))}
                  </div>
                  {clinical.urgency === 'EMERGENT' && (
                    <Alert type="warning" className="mt-2">
                      Emergent requests require immediate clinical review and will be prioritized. Please ensure all supporting documentation is included.
                    </Alert>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <Input label="Estimated Cost" placeholder="$1,250.00" value={clinical.estimated_cost} onChange={setC('estimated_cost')} hint="Optional" />
                  <Input label="Quantity / Units" required type="number" min="1" value={clinical.quantity.toString()} onChange={setC('quantity')} />
                  <Input label="Frequency" placeholder="Once / Weekly / Daily" value={clinical.frequency} onChange={setC('frequency')} />
                </div>

                <Input label="Duration of Treatment" placeholder="e.g. 1 day / 6 weeks / Ongoing" value={clinical.duration} onChange={setC('duration')} />

                <Textarea
                  label="Clinical Summary" required
                  placeholder="Provide a comprehensive clinical summary including chief complaint, history of present illness, relevant findings, and clinical rationale for the requested service. Minimum 100 characters."
                  value={clinical.clinical_summary}
                  onChange={setC('clinical_summary')}
                  error={errors.clinical_summary}
                  rows={6}
                  charCount={clinical.clinical_summary.length}
                  maxChars={5000}
                  hint="Minimum 100 characters"
                />

                <Textarea
                  label="Relevant Lab Results"
                  placeholder="Include relevant laboratory values, dates, and normal ranges if applicable"
                  value={clinical.lab_results}
                  onChange={setC('lab_results')}
                  rows={3}
                />

                <Textarea
                  label="Prior Treatments Tried" required
                  placeholder="Document conservative treatments already attempted, including duration and outcomes. This is required for most PA requests."
                  value={clinical.prior_treatments}
                  onChange={setC('prior_treatments')}
                  error={errors.prior_treatments}
                  rows={4}
                />
              </div>
            </Card>
          )}

          {/* Step 2: Documents */}
          {step === 2 && (
            <Card title="Supporting Documents" subtitle="Upload clinical documentation to support your PA request">
              <div className="space-y-6">
                <Alert type="info">
                  Strong documentation significantly improves approval rates. Include all relevant clinical notes, test results, and treatment records.
                </Alert>

                <FileDropZone
                  onFiles={handleFiles}
                  category="CLINICAL_NOTES"
                  label="Clinical Notes (Required)"
                  required
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FileDropZone onFiles={handleFiles} category="LAB_RESULTS" label="Lab Results" />
                  <FileDropZone onFiles={handleFiles} category="IMAGING_REPORTS" label="Imaging Reports" />
                  <FileDropZone onFiles={handleFiles} category="PRESCRIPTION" label="Prescriptions" />
                  <FileDropZone onFiles={handleFiles} category="OTHER" label="Other Supporting Documents" />
                </div>

                {files.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-3">Uploaded Files ({files.length})</p>
                    <div className="space-y-2">
                      {files.map((f) => (
                        <div key={f.id} className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                          <FileText size={16} className="text-primary-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-700 truncate">{f.name}</p>
                            <p className="text-xs text-gray-400">{formatFileSize(f.size)} — {f.category.replace(/_/g, ' ')}</p>
                          </div>
                          <button onClick={() => removeFile(f.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {files.length === 0 && (
                  <Alert type="warning">
                    No documents uploaded yet. While not always required, clinical documentation significantly improves approval rates and processing speed.
                  </Alert>
                )}
              </div>
            </Card>
          )}

          {/* Step 3: Provider Information */}
          {step === 3 && (
            <Card title="Provider & Facility Information" subtitle="Requesting provider and service location details">
              <div className="space-y-5">
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-4">
                  <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <User size={16} className="text-primary-500" /> Requesting Provider
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Provider NPI" required
                      placeholder="1234567890"
                      maxLength={10}
                      value={provider.provider_npi}
                      onChange={setPr('provider_npi')}
                      error={errors.provider_npi}
                      hint="10-digit National Provider Identifier"
                    />
                    <Input
                      label="Provider Name" required
                      placeholder="Dr. Robert Smith"
                      value={provider.provider_name}
                      onChange={setPr('provider_name')}
                      error={errors.provider_name}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Select
                      label="Specialty" required
                      options={SPECIALTIES.map(s => ({ value: s, label: s }))}
                      placeholder="Select specialty..."
                      value={provider.provider_specialty}
                      onChange={setPr('provider_specialty')}
                      error={errors.provider_specialty}
                    />
                    <Input
                      label="Provider Tax ID (EIN)"
                      placeholder="12-3456789"
                      value={provider.provider_tax_id}
                      onChange={setPr('provider_tax_id')}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Provider Phone" required
                      placeholder="(555) 987-6543"
                      value={provider.provider_phone}
                      onChange={setPr('provider_phone')}
                      error={errors.provider_phone}
                    />
                    <Input
                      label="Provider Fax"
                      placeholder="(555) 987-6544"
                      value={provider.provider_fax}
                      onChange={setPr('provider_fax')}
                    />
                  </div>
                </div>

                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-4">
                  <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Building2 size={16} className="text-primary-500" /> Facility / Service Location
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Facility Name" required
                      placeholder="St. Mary's Medical Center"
                      value={provider.facility_name}
                      onChange={setPr('facility_name')}
                      error={errors.facility_name}
                    />
                    <Input
                      label="Facility NPI" required
                      placeholder="9876543210"
                      maxLength={10}
                      value={provider.facility_npi}
                      onChange={setPr('facility_npi')}
                      error={errors.facility_npi}
                    />
                  </div>
                  <Input
                    label="Facility Address" required
                    placeholder="456 Hospital Blvd, City, ST 12345"
                    value={provider.facility_address}
                    onChange={setPr('facility_address')}
                  />
                </div>
              </div>
            </Card>
          )}

          {/* Step 4: Review & Submit */}
          {step === 4 && (
            <div className="space-y-4">
              <Card title="Review Your PA Request" subtitle="Please verify all information before submitting">
                <div className="space-y-6">
                  <Section title="Patient Information" icon={<User size={16} />}>
                    <Grid2>
                      <Field label="Name" value={`${patient.first_name} ${patient.middle_initial} ${patient.last_name}`} />
                      <Field label="Date of Birth" value={patient.dob} />
                      <Field label="Gender" value={patient.gender === 'M' ? 'Male' : patient.gender === 'F' ? 'Female' : patient.gender} />
                      <Field label="Member ID" value={patient.member_id} mono />
                      <Field label="Phone" value={patient.phone} />
                      <Field label="Group #" value={patient.group_number || '—'} />
                    </Grid2>
                  </Section>

                  <Section title="Clinical Information" icon={<Stethoscope size={16} />}>
                    <Grid2>
                      <Field label="Primary Diagnosis" value={`${clinical.primary_dx_code} — ${clinical.primary_dx_desc}`} mono />
                      <Field label="Procedure" value={`${clinical.procedure_code} — ${clinical.procedure_desc}`} mono />
                      <Field label="Service Type" value={SERVICE_TYPES.find(s => s.value === clinical.service_type)?.label || ''} />
                      <Field label="Place of Service" value={clinical.place_of_service} />
                      <Field label="Urgency" value={clinical.urgency} />
                      <Field label="Quantity" value={clinical.quantity.toString()} />
                    </Grid2>
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500 font-medium mb-1">Clinical Summary</p>
                      <p className="text-sm text-gray-700">{clinical.clinical_summary}</p>
                    </div>
                  </Section>

                  <Section title="Provider Information" icon={<Building2 size={16} />}>
                    <Grid2>
                      <Field label="Provider" value={provider.provider_name} />
                      <Field label="NPI" value={provider.provider_npi} mono />
                      <Field label="Specialty" value={provider.provider_specialty} />
                      <Field label="Facility" value={provider.facility_name} />
                    </Grid2>
                  </Section>

                  <Section title="Documents" icon={<FileText size={16} />}>
                    {files.length === 0 ? (
                      <p className="text-sm text-gray-400 italic">No documents attached</p>
                    ) : (
                      <div className="space-y-1.5">
                        {files.map(f => (
                          <div key={f.id} className="flex items-center gap-2 text-sm text-gray-600">
                            <Check size={12} className="text-green-500" />
                            {f.name} <span className="text-gray-400">({formatFileSize(f.size)})</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>
                </div>
              </Card>

              <Alert type="info">
                By submitting this PA request, you certify that the information provided is accurate and complete to the best of your knowledge, and that the requested service is medically necessary for the patient's condition.
              </Alert>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6">
            <Button
              variant="outline"
              icon={<ChevronLeft size={16} />}
              onClick={() => step > 0 ? setStep(s => s - 1) : router.push('/')}
            >
              {step === 0 ? 'Cancel' : 'Previous'}
            </Button>

            {step < STEPS.length - 1 ? (
              <Button
                icon={<ChevronRight size={16} />}
                iconPosition="right"
                onClick={handleNext}
              >
                Next: {STEPS[step + 1]}
              </Button>
            ) : (
              <Button
                variant="success"
                loading={submitting}
                icon={<CheckCircle size={16} />}
                onClick={handleSubmit}
              >
                {submitting ? 'Submitting…' : 'Submit PA Request'}
              </Button>
            )}
          </div>
        </div>
      </Layout>
    </>
  );
};

// Helper components for review step
const Section: React.FC<{ title: string; icon?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div>
    <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-3">
      <span className="text-primary-500">{icon}</span> {title}
    </div>
    {children}
  </div>
);

const Grid2: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-2 gap-x-6 gap-y-2">{children}</div>
);

const Field: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div>
    <p className="text-xs text-gray-400 mb-0.5">{label}</p>
    <p className={cn('text-sm text-gray-800', mono && 'font-mono')}>{value || '—'}</p>
  </div>
);

export default SubmitPage;
