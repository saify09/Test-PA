import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO, differenceInHours, differenceInMinutes, differenceInDays, formatDistanceToNow } from 'date-fns';

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

export const fmt = {
  date: (d?: string | Date) => !d ? '—' : format(typeof d === 'string' ? parseISO(d) : d, 'MM/dd/yyyy'),
  dateTime: (d?: string | Date) => !d ? '—' : format(typeof d === 'string' ? parseISO(d) : d, 'MM/dd/yyyy hh:mm a'),
  time: (d?: string | Date) => !d ? '—' : format(typeof d === 'string' ? parseISO(d) : d, 'hh:mm a'),
  ago: (d?: string | Date) => !d ? '—' : formatDistanceToNow(typeof d === 'string' ? parseISO(d) : d, { addSuffix: true }),
};

export function deadlineLabel(deadline?: string): { label: string; cls: string; urgent: boolean; warning: boolean } {
  if (!deadline) return { label: '—', cls: 'countdown-normal', urgent: false, warning: false };
  const d = parseISO(deadline);
  const hrs = differenceInHours(d, new Date());
  const mins = differenceInMinutes(d, new Date());
  if (hrs < 0) return { label: 'OVERDUE', cls: 'countdown-critical', urgent: true, warning: false };
  if (hrs < 4) return { label: `${mins}m left`, cls: 'countdown-critical', urgent: true, warning: false };
  if (hrs < 24) return { label: `${hrs}h left`, cls: 'countdown-warning', urgent: false, warning: true };
  const days = differenceInDays(d, new Date());
  return { label: `${days}d left`, cls: 'countdown-normal', urgent: false, warning: false };
}

export function aiScoreColor(score?: number): string {
  if (!score) return '#94a3b8';
  if (score >= 90) return '#43A047';
  if (score >= 70) return '#FFB300';
  return '#E53935';
}

export function aiScoreClass(score?: number): string {
  if (!score) return 'badge-gray';
  if (score >= 90) return 'badge-green';
  if (score >= 70) return 'badge-yellow';
  return 'badge-red';
}

export function urgencyClass(u?: string): string {
  if (u === 'EMERGENT') return 'badge badge-red';
  if (u === 'URGENT') return 'badge badge-orange';
  return 'badge badge-gray';
}

export function aiRecoClass(r?: string): string {
  if (r === 'APPROVE') return 'badge badge-green';
  if (r === 'DENY') return 'badge badge-red';
  return 'badge badge-orange';
}

export function priorityScore(urgency: string, hoursRemaining: number): number {
  const urgencyWeight = urgency === 'EMERGENT' ? 50 : urgency === 'URGENT' ? 30 : 10;
  const deadlineWeight = hoursRemaining < 4 ? 40 : hoursRemaining < 24 ? 20 : hoursRemaining < 72 ? 10 : 0;
  return Math.min(99, urgencyWeight + deadlineWeight + Math.floor(Math.random() * 10));
}

export function maskMemberId(id: string): string {
  if (!id || id.length < 4) return id;
  return '****' + id.slice(-4);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
