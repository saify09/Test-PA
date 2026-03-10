import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO, differenceInDays, formatDistanceToNow, isValid } from 'date-fns';

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

export const fmt = {
  date: (d?: string | Date | null) => {
    if (!d) return '—';
    const parsed = typeof d === 'string' ? parseISO(d) : d;
    return isValid(parsed) ? format(parsed, 'MMMM d, yyyy') : '—';
  },
  dateShort: (d?: string | Date | null) => {
    if (!d) return '—';
    const parsed = typeof d === 'string' ? parseISO(d) : d;
    return isValid(parsed) ? format(parsed, 'MM/dd/yyyy') : '—';
  },
  dateTime: (d?: string | Date | null) => {
    if (!d) return '—';
    const parsed = typeof d === 'string' ? parseISO(d) : d;
    return isValid(parsed) ? format(parsed, 'MMM d, yyyy h:mm a') : '—';
  },
  ago: (d?: string | Date | null) => {
    if (!d) return '—';
    const parsed = typeof d === 'string' ? parseISO(d) : d;
    return isValid(parsed) ? formatDistanceToNow(parsed, { addSuffix: true }) : '—';
  },
};

export function statusLabel(s?: string): string {
  const map: Record<string, string> = {
    SUBMITTED:    'Submitted',
    IN_REVIEW:    'In Review',
    PENDING_INFO: 'More Info Needed',
    APPROVED:     'Approved',
    DENIED:       'Denied',
    CANCELLED:    'Cancelled',
    APPEALING:    'Under Appeal',
    APPEAL_APPROVED: 'Appeal Approved',
    APPEAL_DENIED:   'Appeal Denied',
    EXPIRED:      'Expired',
  };
  return map[s || ''] || s || '—';
}

export function statusClass(s?: string): string {
  const map: Record<string, string> = {
    SUBMITTED:    'status-submitted',
    IN_REVIEW:    'status-in_review',
    PENDING_INFO: 'status-pended',
    APPROVED:     'status-approved',
    DENIED:       'status-denied',
    CANCELLED:    'status-cancelled',
    APPEALING:    'status-appealing',
    APPEAL_APPROVED: 'status-approved',
    APPEAL_DENIED:   'status-denied',
  };
  return map[s || ''] || 'status-submitted';
}

export function statusDot(s?: string): string {
  const map: Record<string, string> = {
    SUBMITTED:    'bg-blue-400',
    IN_REVIEW:    'bg-amber-400',
    PENDING_INFO: 'bg-orange-400',
    APPROVED:     'bg-green-500',
    DENIED:       'bg-red-500',
    CANCELLED:    'bg-gray-400',
    APPEALING:    'bg-purple-500',
  };
  return map[s || ''] || 'bg-gray-300';
}

export function daysUntilExpiry(date?: string): number | null {
  if (!date) return null;
  const d = parseISO(date);
  return isValid(d) ? differenceInDays(d, new Date()) : null;
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function formatPhone(v: string): string {
  const digits = v.replace(/\D/g, '').slice(0, 10);
  if (digits.length < 4) return digits;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
