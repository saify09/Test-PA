/**
 * Shared TypeScript types for Member Portal.
 * Replaces all `any` usages — FLS §3 field names.
 */

// ── PA Request (member view — FLS §3.1) ───────────────────────────────────────
export interface MemberPARequest {
  pa_id:            string;
  pa_number:        string;
  service_description: string;
  provider_name:    string;
  status:           'SUBMITTED' | 'IN_REVIEW' | 'APPROVED' | 'DENIED' |
                    'PENDED' | 'CANCELLED' | 'EXPIRED';
  submitted_at:     string;
  decision_date?:   string;
  decision?:        'APPROVED' | 'DENIED' | 'MORE_INFO_NEEDED';
  auth_number?:     string;
  valid_through?:   string;
  appeal_status?:   'NO_APPEAL' | 'IN_APPEAL' | 'RESOLVED';
}

// ── PA Detail (member view) ────────────────────────────────────────────────────
export interface MemberPADetail extends MemberPARequest {
  primary_diagnosis:  string;
  urgency:            string;
  payer_name:         string;
  denial_reason?:     string;
  timeline:           PATimelineEvent[];
  documents:          MemberDocument[];
  can_appeal:         boolean;
}

export interface PATimelineEvent {
  event_id:    string;
  date:        string;
  status:      string;
  description: string;
  icon?:       string;
}

export interface MemberDocument {
  doc_id:      string;
  filename:    string;
  doc_type:    string;
  uploaded_at: string;
  url?:        string;
}

// ── Appeal (FLS §3.2) ─────────────────────────────────────────────────────────
export interface MemberAppeal {
  appeal_id:    string;
  pa_number:    string;
  appeal_type:  'STANDARD' | 'EXPEDITED';
  status:       'SUBMITTED' | 'IN_REVIEW' | 'UPHELD' | 'OVERTURNED' | 'WITHDRAWN';
  submitted_at: string;
  decision_date?: string;
  reason:       string;
  outcome_notes?: string;
}

// ── Member profile ─────────────────────────────────────────────────────────────
export interface MemberProfile {
  member_id:     string;
  first_name:    string;
  last_name:     string;
  dob:           string;
  gender:        string;
  email:         string;
  phone:         string;
  address_line1: string;
  address_line2?: string;
  city:          string;
  state:         string;
  zip:           string;
  payer_name:    string;
  plan_name:     string;
  group_number:  string;
  coverage_start: string;
  coverage_end:  string;
  pcp_name?:     string;
}

// ── Status tracking result ─────────────────────────────────────────────────────
export interface StatusResult {
  pa_number:      string;
  status:         MemberPARequest['status'];
  service:        string;
  submitted_at:   string;
  decision_date?: string;
  auth_number?:   string;
  valid_through?: string;
  provider_name?: string;
  message:        string;
}

// ── Notification (member view) ────────────────────────────────────────────────
export interface MemberNotification {
  notif_id:   string;
  type:       'DECISION' | 'STATUS_CHANGE' | 'INFO_REQUEST' | 'APPEAL' | 'SYSTEM';
  title:      string;
  message:    string;
  read:       boolean;
  created_at: string;
  pa_number?: string;
}

// ── API error (FLS §8) ────────────────────────────────────────────────────────
export interface APIError {
  error:             boolean;
  code:              string;
  message:           string;
  suggested_action?: string;
}
