import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO, isValid, formatDistanceToNow, subDays } from 'date-fns';

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

export const fmt = {
  date:     (d?: string|Date|null) => { if (!d) return '—'; const p = typeof d==='string'?parseISO(d):d; return isValid(p)?format(p,'MM/dd/yyyy'):'—'; },
  dateTime: (d?: string|Date|null) => { if (!d) return '—'; const p = typeof d==='string'?parseISO(d):d; return isValid(p)?format(p,'MM/dd/yyyy HH:mm'):'—'; },
  ago:      (d?: string|Date|null) => { if (!d) return '—'; const p = typeof d==='string'?parseISO(d):d; return isValid(p)?formatDistanceToNow(p,{addSuffix:true}):'—'; },
  pct:      (n?: number) => n !== undefined ? `${n.toFixed(1)}%` : '—',
  hrs:      (n?: number) => n !== undefined ? n < 24 ? `${n.toFixed(1)}h` : `${(n/24).toFixed(1)}d` : '—',
  num:      (n?: number) => n !== undefined ? n.toLocaleString() : '—',
  currency: (n?: number) => n !== undefined ? `$${n.toFixed(2)}` : '—',
};

export function trendColor(v: number, higherBetter = true): string {
  if (v === 0) return 'flat';
  return (higherBetter ? v > 0 : v < 0) ? 'up' : 'down';
}

export function trendIcon(v: number, higherBetter = true): string {
  if (v === 0) return '→';
  return (higherBetter ? v > 0 : v < 0) ? '↑' : '↓';
}

export function statusBadgeClass(s?: string): string {
  const m: Record<string,string> = {
    SUBMITTED:'badge-blue', IN_REVIEW:'badge-orange', APPROVED:'badge-green',
    DENIED:'badge-red', PENDED:'badge-orange', CANCELLED:'badge-gray',
    ACTIVE:'badge-green', INACTIVE:'badge-gray', SUSPENDED:'badge-red',
    HEALTHY:'badge-green', DEGRADED:'badge-orange', DOWN:'badge-red',
  };
  return m[s||'']||'badge-gray';
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── Mock data generators ──────────────────────────────────────────────────
export function genDailyVolume(days = 30) {
  return Array.from({ length: days }, (_, i) => {
    const d = subDays(new Date(), days - 1 - i);
    const base = 45 + Math.sin(i / 3) * 15;
    const count = Math.max(0, Math.round(base + (Math.random() - 0.5) * 10));
    return { date: format(d, 'MMM d'), count, approved: Math.round(count * 0.68), denied: Math.round(count * 0.20), pended: Math.round(count * 0.12) };
  });
}

export function genTATTrend(days = 30) {
  return Array.from({ length: days }, (_, i) => {
    const d = subDays(new Date(), days - 1 - i);
    return { date: format(d, 'MMM d'), avg_hours: +(14 + Math.sin(i / 4) * 4 + (Math.random() - 0.5) * 3).toFixed(1), target: 24 };
  });
}

export function genAIAccuracy(days = 30) {
  return Array.from({ length: days }, (_, i) => {
    const d = subDays(new Date(), days - 1 - i);
    return { date: format(d, 'MMM d'), accuracy: +(91 + Math.sin(i / 5) * 3 + (Math.random() - 0.5) * 2).toFixed(1), target: 92 };
  });
}

export function mockKPIs() {
  return {
    total_received:    { value: 12847, trend: +8.2,  period: 'vs last month' },
    in_queue:          { value: 47,    trend: -12.3, period: 'vs yesterday' },
    avg_tat_hours:     { value: 16.4,  trend: -5.1,  period: 'vs last month' },
    auto_approval_rate:{ value: 71.2,  trend: +3.4,  period: 'vs last month' },
    ai_accuracy:       { value: 93.8,  trend: +1.2,  period: 'vs last month' },
    appeal_rate:       { value: 6.4,   trend: -0.8,  period: 'vs last month' },
    overturn_rate:     { value: 31.2,  trend: +2.1,  period: 'vs last month' },
    approval_rate:     { value: 68.7,  trend: +1.5,  period: 'vs last month' },
    denial_rate:       { value: 21.4,  trend: -0.9,  period: 'vs last month' },
    sla_compliance:    { value: 98.2,  trend: +0.3,  period: 'vs last month' },
    reviewer_productivity: { value: 18.4, trend: +2.1, period: 'cases/FTE/day' },
    cost_per_pa:       { value: 12.47, trend: -4.2,  period: 'vs last month' },
    provider_satisfaction: { value: 42, trend: +5,   period: 'NPS score' },
    system_uptime:     { value: 99.97, trend: 0,     period: 'this month' },
  };
}

export function mockByPayer() {
  return [
    { payer: 'UnitedHealthcare', total: 4218, approved: 2941, denied: 843, pended: 434, approval_rate: 69.7, avg_tat: 14.2 },
    { payer: 'Aetna',            total: 3142, approved: 2156, denied: 659, pended: 327, approval_rate: 68.6, avg_tat: 18.1 },
    { payer: 'BlueCross',        total: 2874, approved: 1987, denied: 574, pended: 313, approval_rate: 69.1, avg_tat: 15.8 },
    { payer: 'Cigna',            total: 1643, approved: 1098, denied: 361, pended: 184, approval_rate: 66.8, avg_tat: 22.4 },
    { payer: 'CVS Caremark',     total: 970,  approved: 682,  denied: 194, pended: 94,  approval_rate: 70.3, avg_tat: 11.2 },
  ];
}

export function mockByService() {
  return [
    { service: 'Diagnostic Imaging', count: 3847, pct: 29.9, avg_tat: 12.1, approval_rate: 74.2 },
    { service: 'Surgical Procedures', count: 2934, pct: 22.8, avg_tat: 22.4, approval_rate: 61.8 },
    { service: 'Specialty Medication', count: 2218, pct: 17.3, avg_tat: 18.7, approval_rate: 58.4 },
    { service: 'Physical Therapy',     count: 1547, pct: 12.0, avg_tat: 9.8,  approval_rate: 82.3 },
    { service: 'DME',                  count: 1124, pct: 8.7,  avg_tat: 14.2, approval_rate: 71.9 },
    { service: 'Behavioral Health',    count: 843,  pct: 6.6,  avg_tat: 16.8, approval_rate: 77.4 },
    { service: 'Other',                count: 334,  pct: 2.6,  avg_tat: 20.1, approval_rate: 65.0 },
  ];
}

export function mockDenialReasons() {
  return [
    { reason: 'Not Medically Necessary',      count: 1243, pct: 45.2 },
    { reason: 'Criteria Not Met',             count: 687,  pct: 25.0 },
    { reason: 'Step Therapy Not Met',         count: 329,  pct: 12.0 },
    { reason: 'Service Not Covered',          count: 218,  pct: 7.9 },
    { reason: 'Insufficient Clinical Info',   count: 147,  pct: 5.3 },
    { reason: 'Duplicate Request',            count: 98,   pct: 3.6 },
    { reason: 'Other',                        count: 27,   pct: 1.0 },
  ];
}

export function mockReviewerPerf() {
  return [
    { name: 'Dr. James Kim, MD',   role: 'MD REVIEWER',   cases: 312, avg_time: 10.2, ai_agreement: 96.1, sla: 99.4, overturn: 28.4 },
    { name: 'Sarah Parker, RN',    role: 'RN REVIEWER',   cases: 287, avg_time: 12.1, ai_agreement: 94.3, sla: 98.6, overturn: 31.2 },
    { name: 'Mike Torres, RN',     role: 'RN REVIEWER',   cases: 265, avg_time: 13.8, ai_agreement: 91.7, sla: 97.4, overturn: 29.8 },
    { name: 'Dr. Lisa Wong, MD',   role: 'MD REVIEWER',   cases: 241, avg_time: 11.4, ai_agreement: 95.2, sla: 99.2, overturn: 33.1 },
    { name: 'Carol James, RN',     role: 'RN REVIEWER',   cases: 198, avg_time: 15.6, ai_agreement: 88.9, sla: 96.2, overturn: 27.4 },
  ];
}
