/**
 * Shared TypeScript types for Provider Portal.
 * Replaces all `any` usages — FLS §1, §5 field names.
 */

// ── PA Request (FLS §1.2 status dashboard fields) ────────────────────────────
export interface PARequest {
  pa_id:              string;
  pa_number:          string;
  patient_name:       string;
  member_id:          string;
  service_description: string;
  primary_diagnosis:  string;
  urgency:            'ROUTINE' | 'URGENT' | 'EMERGENT' | 'EXPEDITED';
  status:             'SUBMITTED' | 'IN_REVIEW' | 'PENDING_INFO' | 'APPROVED' |
                      'DENIED' | 'AUTO_APPROVED' | 'AUTO_DENIED' | 'PENDED' |
                      'CANCELLED' | 'EXPIRED';
  submitted_at:       string;
  decision_date?:     string;
  auth_number?:       string;
  valid_through?:     string;
  days_pending:       number;
  ai_score?:          number;
  deadline?:          string;
  appeal_status?:     'NO_APPEAL' | 'IN_APPEAL' | 'RESOLVED';
  payer_code?:        string;
}

// ── PA History Event ──────────────────────────────────────────────────────────
export interface PAHistoryEvent {
  event_id:    string;
  event_type:  string;
  event_date:  string;
  description: string;
  actor?:      string;
  actor_role?: string;
  metadata?:   Record<string, string>;
}

// ── Document ──────────────────────────────────────────────────────────────────
export interface PADocument {
  doc_id:      string;
  filename:    string;
  doc_type:    string;
  size_bytes:  number;
  uploaded_at: string;
  uploaded_by: string;
  url?:        string;
}

// ── Appeal ────────────────────────────────────────────────────────────────────
export interface Appeal {
  appeal_id:       string;
  pa_number:       string;
  appeal_type:     'STANDARD' | 'EXPEDITED';
  status:          'SUBMITTED' | 'IN_REVIEW' | 'UPHELD' | 'OVERTURNED' | 'WITHDRAWN';
  submitted_at:    string;
  decision_date?:  string;
  reason:          string;
  outcome_notes?:  string;
}

// ── Stats ─────────────────────────────────────────────────────────────────────
export interface PAStats {
  total:              number;
  pending:            number;
  approved:           number;
  denied:             number;
  auto_approval_rate: number;
  avg_tat_hours:      number;
}

// ── Trend data point (for charts) ─────────────────────────────────────────────
export interface TrendPoint {
  date:         string;
  submitted:    number;
  approved:     number;
  denied:       number;
  auto_approved?: number;
}

// ── Tracking result ────────────────────────────────────────────────────────────
export interface TrackingResult {
  pa_number:     string;
  status:        PARequest['status'];
  patient_name?: string;
  service?:      string;
  submitted_at:  string;
  decision_date?: string;
  auth_number?:  string;
  valid_through?: string;
  events:        PAHistoryEvent[];
}

// ── Notification ──────────────────────────────────────────────────────────────
export interface Notification {
  notif_id:   string;
  type:       'DECISION' | 'STATUS_CHANGE' | 'INFO_REQUEST' | 'SYSTEM';
  title:      string;
  message:    string;
  read:       boolean;
  created_at: string;
  pa_number?: string;
  action_url?: string;
}

// ── Lookup results ─────────────────────────────────────────────────────────────
export interface ICD10Result {
  code:        string;
  description: string;
  category?:   string;
}

export interface CPTResult {
  code:        string;
  description: string;
  category?:   string;
}

export interface NPIResult {
  npi:          string;
  name:         string;
  specialty?:   string;
  address?:     string;
  phone?:       string;
  in_network?:  boolean;
}

// ── API error (FLS §8) ────────────────────────────────────────────────────────
export interface APIError {
  error:            boolean;
  code:             string;
  message:          string;
  suggested_action?: string;
  field?:           string;
}
