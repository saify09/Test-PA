/**
 * Shared TypeScript types for Reviewer Workbench.
 * Replaces all `any` usages — FLS §2 field names.
 */

// ── Queue item (FLS §2.1 review queue fields) ─────────────────────────────────
export interface QueueItem {
  pa_id:            string;
  pa_number:        string;
  patient_name:     string;
  member_id:        string;
  service_type:     string;
  diagnosis:        string;
  urgency:          'ROUTINE' | 'URGENT' | 'EMERGENT' | 'EXPEDITED';
  deadline:         string;
  received_at:      string;
  days_in_queue:    number;
  ai_score:         number;
  ai_recommendation: 'APPROVE' | 'DENY' | 'REVIEW_REQUIRED';
  assigned_to?:     string;
  payer:            string;
  priority_score:   number;
  documentation_complete: boolean;
}

// ── Case data (FLS §2.2 case detail) ─────────────────────────────────────────
export interface CaseData {
  pa_id:         string;
  pa_number:     string;
  patient:       PatientDemographics;
  clinical:      ClinicalSummary;
  provider:      ProviderInfo;
  submission:    SubmissionInfo;
  payer:         string;
  urgency:       string;
  status:        string;
  assigned_to?:  string;
  draft_decision?: string;
  draft_notes?:  string;
}

// ── Patient demographics (FLS §2.2.1) ────────────────────────────────────────
export interface PatientDemographics {
  full_name:        string;
  dob:              string;
  gender:           string;
  member_id:        string;
  insurance_group:  string;
  payer_name:       string;
  coverage_status:  'ACTIVE' | 'INACTIVE' | 'PENDING';
  effective_date:   string;
  termination_date?: string;
  pcp?:             string;
  contact_phone:    string;
  email?:           string;
}

// ── Clinical summary (FLS §2.2.2) ────────────────────────────────────────────
export interface ClinicalSummary {
  primary_diagnosis:     string;
  primary_dx_code:       string;
  secondary_diagnoses:   DiagnosisItem[];
  requested_service:     string;
  procedure_code:        string;
  service_category:      string;
  clinical_summary:      string;
  chief_complaint?:      string;
  hpi?:                  string;
  exam_findings?:        string;
  relevant_labs?:        LabValue[];
  medications?:          string[];
  prior_treatments:      string;
  treatment_duration?:   string;
  clinical_rationale:    string;
}

export interface DiagnosisItem {
  code:        string;
  description: string;
}

export interface LabValue {
  name:   string;
  value:  string;
  unit?:  string;
  flag?:  'HIGH' | 'LOW' | 'NORMAL';
}

// ── AI analysis (FLS §2.2.3) ─────────────────────────────────────────────────
export interface AIAnalysis {
  recommendation:           'APPROVE' | 'DENY' | 'REVIEW_REQUIRED';
  confidence_score:         number;
  risk_score:               'LOW' | 'MEDIUM' | 'HIGH';
  rationale_summary:        string;
  criteria_met:             CriteriaItem[];
  criteria_unmet:           CriteriaItem[];
  criteria_na:              CriteriaItem[];
  documentation_completeness: number;
  missing_documentation:    string[];
  supporting_evidence:      EvidenceItem[];
  conflicting_factors:      string[];
  similar_cases_analyzed:   number;
  similar_cases_outcome:    { approved: number; denied: number };
  treatment_timeline:       TimelineItem[];
  model_version:            string;
  processing_time_ms:       number;
}

export interface CriteriaItem {
  criterion:   string;
  status:      'MET' | 'UNMET' | 'NA';
  evidence?:   string;
  guideline?:  string;
}

export interface EvidenceItem {
  source:      string;
  citation:    string;
  relevance:   string;
  url?:        string;
}

export interface TimelineItem {
  date:        string;
  event:       string;
  type:        'treatment' | 'diagnosis' | 'test' | 'referral';
}

// ── Guidelines (FLS §2.2.4) ───────────────────────────────────────────────────
export interface Guidelines {
  guideline_name:    string;
  guideline_version: string;
  criteria_text:     string;
  must_meet:         GuidelineCriteria[];
  should_meet:       GuidelineCriteria[];
  exclusion_criteria: GuidelineCriteria[];
  guideline_url?:    string;
}

export interface GuidelineCriteria {
  criterion:  string;
  met:        boolean | null;
  notes?:     string;
}

// ── Provider info ─────────────────────────────────────────────────────────────
export interface ProviderInfo {
  name:      string;
  npi:       string;
  specialty: string;
  phone:     string;
  fax?:      string;
  tax_id?:   string;
  facility:  string;
  facility_npi?: string;
  address?:  string;
}

// ── Submission info ───────────────────────────────────────────────────────────
export interface SubmissionInfo {
  pa_number:     string;
  submitted_at:  string;
  requested_start_date: string;
  requested_units: number;
  place_of_service: string;
  documents:     ReviewDocument[];
}

export interface ReviewDocument {
  doc_id:      string;
  filename:    string;
  doc_type:    string;
  uploaded_at: string;
  url?:        string;
}

// ── History event ─────────────────────────────────────────────────────────────
export interface CaseHistoryEvent {
  event_id:    string;
  event_type:  string;
  timestamp:   string;
  actor:       string;
  actor_role:  string;
  description: string;
  details?:    Record<string, string>;
}

// ── Reviewer metrics ──────────────────────────────────────────────────────────
export interface ReviewerMetrics {
  reviewer_id:       string;
  reviewer_name:     string;
  cases_today:       number;
  cases_this_week:   number;
  avg_review_time_min: number;
  agreement_with_ai: number;
  approval_rate:     number;
  denial_rate:       number;
  sla_compliance:    number;
}

export interface QueueMetrics {
  total_in_queue:     number;
  urgent_count:       number;
  overdue_count:      number;
  avg_wait_hours:     number;
  ai_auto_approved:   number;
  reviewers_online:   number;
}

// ── Decision form (FLS §2.2.5) ────────────────────────────────────────────────
export interface DecisionForm {
  decision:           'APPROVE' | 'DENY' | 'PEND' | '';
  clinical_notes:     string;
  denial_reason?:     string;
  denial_sub_reason?: string;
  alternative_treatment?: string;
  pend_reason?:       string;
  information_requested?: string[];
  approved_quantity?: number;
  approved_duration?: number;
  approved_duration_unit?: 'DAYS' | 'WEEKS' | 'MONTHS' | 'VISITS';
  auth_start_date?:   string;
  auth_end_date?:     string;
  require_md_review:  boolean;
}

// ── API error (FLS §8) ────────────────────────────────────────────────────────
export interface APIError {
  error:             boolean;
  code:              string;
  message:           string;
  suggested_action?: string;
}
