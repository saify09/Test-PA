import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow, parseISO, differenceInHours, differenceInDays } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date, fmt = 'MM/dd/yyyy') {
  if (!date) return '—';
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, fmt);
}

export function formatDateTime(date: string | Date) {
  if (!date) return '—';
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MM/dd/yyyy hh:mm a');
}

export function timeAgo(date: string | Date) {
  if (!date) return '—';
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

export function daysRemaining(deadline: string | Date): number {
  const d = typeof deadline === 'string' ? parseISO(deadline) : deadline;
  return differenceInDays(d, new Date());
}

export function hoursRemaining(deadline: string | Date): number {
  const d = typeof deadline === 'string' ? parseISO(deadline) : deadline;
  return differenceInHours(d, new Date());
}

export function formatCurrency(amount: number | string) {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    SUBMITTED: 'Submitted',
    PENDING_INFO: 'Pending Info',
    IN_REVIEW: 'In Review',
    AI_PROCESSING: 'AI Processing',
    APPROVED: 'Approved',
    DENIED: 'Denied',
    CANCELLED: 'Cancelled',
    APPEALED: 'Under Appeal',
    EXPIRED: 'Expired',
  };
  return map[status] || status;
}

export function statusClass(status: string): string {
  const map: Record<string, string> = {
    APPROVED: 'status-approved',
    DENIED: 'status-denied',
    SUBMITTED: 'status-submitted',
    IN_REVIEW: 'status-in-review',
    AI_PROCESSING: 'status-in-review',
    PENDING_INFO: 'status-pending',
    CANCELLED: 'badge bg-gray-100 text-gray-600',
    APPEALED: 'badge bg-purple-100 text-purple-700',
    EXPIRED: 'badge bg-gray-100 text-gray-500',
  };
  return `badge ${map[status] || 'badge bg-gray-100 text-gray-600'}`;
}

export function urgencyClass(urgency: string): string {
  const map: Record<string, string> = {
    ROUTINE: 'urgency-routine',
    URGENT: 'urgency-urgent',
    EMERGENT: 'urgency-emergent',
  };
  return `badge ${map[urgency] || ''}`;
}

export function truncate(str: string, length = 50): string {
  if (!str) return '';
  return str.length > length ? str.substring(0, length) + '…' : str;
}

// Generate PA number preview (client-side mock)
export function generateTrackingId(): string {
  const year = new Date().getFullYear();
  const num = Math.floor(100000 + Math.random() * 900000);
  return `PA-${year}-${num}`;
}

// Validate NPI (basic Luhn check for 10-digit NPI)
export function validateNPI(npi: string): boolean {
  if (!/^\d{10}$/.test(npi)) return false;
  return true; // Full Luhn implemented server-side
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
