/**
 * Shared TypeScript types for Admin Dashboard.
 * Replaces all `any` usages — FLS §4 field names.
 */

// ── KPI metrics (FLS §4.1) ────────────────────────────────────────────────────
export interface AdminKPIs {
  total_pas_received:   number;
  pas_in_queue:         number;
  avg_tat_hours:        number;
  auto_approval_rate:   number;
  ai_accuracy:          number;
  appeal_rate:          number;
  overturn_rate:        number;
  approval_rate:        number;
  denial_rate:          number;
  pended_rate:          number;
  sla_compliance:       number;
  reviewer_productivity: number;
  cost_per_pa?:         number;
  provider_satisfaction?: number;
  system_uptime:        number;
  // Trend indicators
  trend_total?:         number;
  trend_tat?:           number;
  trend_auto_approval?: number;
  trend_ai_accuracy?:   number;
}

// ── Volume data point (for charts) ────────────────────────────────────────────
export interface VolumeDataPoint {
  date:          string;
  submitted:     number;
  approved:      number;
  denied:        number;
  auto_approved: number;
  pended:        number;
}

// ── Payer breakdown ────────────────────────────────────────────────────────────
export interface PayerDataPoint {
  payer:        string;
  count:        number;
  approval_rate: number;
  avg_tat_hours: number;
  auto_rate:    number;
}

// ── System health ──────────────────────────────────────────────────────────────
export interface SystemHealth {
  overall_status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  uptime_pct:     number;
  services:       ServiceStatus[];
  queues:         QueueStatus[];
  last_checked:   string;
}

export interface ServiceStatus {
  name:           string;
  status:         'UP' | 'DEGRADED' | 'DOWN';
  latency_ms?:    number;
  last_check:     string;
  version?:       string;
  error_message?: string;
}

export interface QueueStatus {
  name:        string;
  depth:       number;
  processing:  boolean;
  lag_ms?:     number;
}

// ── Admin user ────────────────────────────────────────────────────────────────
export interface AdminUser {
  user_id:     string;
  username:    string;
  full_name:   string;
  email:       string;
  role:        'PROVIDER' | 'REVIEWER' | 'MD_REVIEWER' | 'ADMIN' | 'MEMBER';
  status:      'ACTIVE' | 'INACTIVE' | 'LOCKED' | 'PENDING';
  created_at:  string;
  last_login?: string;
  npi?:        string;
  specialty?:  string;
  cases_reviewed?: number;
}

// ── Admin case ────────────────────────────────────────────────────────────────
export interface AdminCase {
  pa_id:         string;
  pa_number:     string;
  patient_name:  string;
  member_id:     string;
  service:       string;
  urgency:       string;
  status:        string;
  payer:         string;
  submitted_at:  string;
  decision_date?: string;
  assigned_to?:  string;
  ai_score?:     number;
  days_pending:  number;
  sla_breach:    boolean;
}

// ── Audit log entry ────────────────────────────────────────────────────────────
export interface AuditEntry {
  audit_id:    string;
  timestamp:   string;
  event_type:  string;
  actor_id:    string;
  actor_name:  string;
  actor_role:  string;
  resource:    string;
  resource_id: string;
  action:      string;
  ip_address:  string;
  changes?:    Record<string, { before: string; after: string }>;
  metadata?:   Record<string, string>;
}

// ── Reviewer performance ──────────────────────────────────────────────────────
export interface ReviewerPerformance {
  reviewer_id:      string;
  reviewer_name:    string;
  cases_today:      number;
  cases_week:       number;
  avg_time_min:     number;
  ai_agreement_pct: number;
  approval_rate:    number;
  sla_compliance:   number;
}

// ── AI model info ──────────────────────────────────────────────────────────────
export interface AIModel {
  model_id:      string;
  version:       string;
  status:        'ACTIVE' | 'SHADOW' | 'RETIRED';
  accuracy:      number;
  deployed_at:   string;
  cases_scored:  number;
  description:   string;
}

// ── Admin notification ────────────────────────────────────────────────────────
export interface AdminNotification {
  id:           string;
  type:         'ALERT' | 'INFO' | 'SUCCESS' | 'WARNING' | 'SYSTEM';
  severity:     'HIGH' | 'MEDIUM' | 'LOW';
  title:        string;
  message:      string;
  source:       string;
  created_at:   string;
  read:         boolean;
  actionable:   boolean;
  action_label?: string;
  action_url?:   string;
}

// ── API error (FLS §8) ────────────────────────────────────────────────────────
export interface APIError {
  error:             boolean;
  code:              string;
  message:           string;
  suggested_action?: string;
}
