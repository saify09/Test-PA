import React, { useState, useEffect } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Layout from '../components/layout/Layout';
import { Button, Badge, Card, Spinner, EmptyState } from '../components/ui';
import { notificationApi } from '../lib/api';
import { formatDateTime, cn } from '../lib/utils';
import toast from 'react-hot-toast';
import {
  Bell, CheckCircle, XCircle, Clock, AlertTriangle, Info,
  Check, Trash2, RefreshCw, Filter, ChevronRight
} from 'lucide-react';

interface Notification {
  id: string;
  type: 'APPROVED' | 'DENIED' | 'PENDED' | 'INFO' | 'ACTION_REQUIRED' | 'APPEAL';
  title: string;
  message: string;
  pa_number?: string;
  pa_id?: string;
  created_at: string;
  read: boolean;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; bg: string; border: string; badge: string }> = {
  APPROVED:       { icon: <CheckCircle size={18} />, bg: 'bg-green-50',  border: 'border-green-200', badge: 'success' },
  DENIED:         { icon: <XCircle size={18} />,     bg: 'bg-red-50',    border: 'border-red-200',   badge: 'danger'  },
  PENDED:         { icon: <Clock size={18} />,        bg: 'bg-yellow-50', border: 'border-yellow-200',badge: 'warning' },
  ACTION_REQUIRED:{ icon: <AlertTriangle size={18} />,bg: 'bg-orange-50', border: 'border-orange-200',badge: 'warning' },
  APPEAL:         { icon: <RefreshCw size={18} />,    bg: 'bg-purple-50', border: 'border-purple-200',badge: 'info'    },
  INFO:           { icon: <Info size={18} />,          bg: 'bg-blue-50',   border: 'border-blue-200',  badge: 'info'   },
};

const MOCK_NOTIFICATIONS: Notification[] = [
  { id: '1', type: 'APPROVED', title: 'PA Approved', message: 'PA-2026-001234 for MRI Lumbar Spine has been approved. Authorization #AUTH-567890 is valid through 06/15/2026.', pa_number: 'PA-2026-001234', pa_id: '001234', created_at: new Date(Date.now() - 30 * 60000).toISOString(), read: false, priority: 'HIGH' },
  { id: '2', type: 'ACTION_REQUIRED', title: 'Additional Information Requested', message: 'PA-2026-001235 requires additional clinical documentation. Please upload relevant lab results within 5 business days to avoid closure.', pa_number: 'PA-2026-001235', pa_id: '001235', created_at: new Date(Date.now() - 2 * 3600000).toISOString(), read: false, priority: 'HIGH' },
  { id: '3', type: 'DENIED', title: 'PA Denied', message: 'PA-2026-001230 for Knee Arthroplasty has been denied. Reason: Step therapy requirements not met. You have the right to appeal within 60 days.', pa_number: 'PA-2026-001230', pa_id: '001230', created_at: new Date(Date.now() - 5 * 3600000).toISOString(), read: false, priority: 'HIGH' },
  { id: '4', type: 'PENDED', title: 'PA Pending Review', message: 'PA-2026-001228 has been assigned to a clinical reviewer and is pending decision. Expected decision within 24 hours.', pa_number: 'PA-2026-001228', pa_id: '001228', created_at: new Date(Date.now() - 24 * 3600000).toISOString(), read: true, priority: 'MEDIUM' },
  { id: '5', type: 'APPEAL', title: 'Appeal Acknowledged', message: 'Your appeal for PA-2026-001220 has been received (APL-2026-00089). Standard review will be completed within 30 days.', pa_number: 'PA-2026-001220', pa_id: '001220', created_at: new Date(Date.now() - 48 * 3600000).toISOString(), read: true, priority: 'MEDIUM' },
  { id: '6', type: 'INFO', title: 'System Maintenance', message: 'Scheduled maintenance on Saturday 03/15/2026 from 2:00 AM – 4:00 AM EST. The portal will be temporarily unavailable.', created_at: new Date(Date.now() - 72 * 3600000).toISOString(), read: true, priority: 'LOW' },
];

const NotificationsPage: NextPage = () => {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => { loadNotifications(); }, []);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const res = await notificationApi.list();
      setNotifications(res.data.items || []);
    } catch {
      setNotifications(MOCK_NOTIFICATIONS);
    } finally {
      setLoading(false);
    }
  };

  const markRead = async (id: string) => {
    try { await notificationApi.markRead(id); } catch {}
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try { await notificationApi.markAllRead(); } catch {}
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setMarkingAll(false);
    toast.success('All notifications marked as read');
  };

  const deleteNotification = async (id: string) => {
    try { await notificationApi.delete(id); } catch {}
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleClick = (n: Notification) => {
    if (!n.read) markRead(n.id);
    if (n.pa_id) router.push(`/requests/${n.pa_id}`);
  };

  const displayed = filter === 'UNREAD' ? notifications.filter(n => !n.read) : notifications;
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <>
      <Head><title>Notifications | PA Provider Portal</title></Head>
      <Layout title="Notifications">
        <div className="max-w-3xl mx-auto space-y-4">
          {/* Header actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                {(['ALL', 'UNREAD'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      'px-4 py-2 text-sm font-medium transition-colors',
                      filter === f ? 'bg-primary-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                    )}
                  >
                    {f === 'UNREAD' && unreadCount > 0 ? `Unread (${unreadCount})` : f}
                  </button>
                ))}
              </div>
            </div>
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" loading={markingAll} onClick={markAllRead} icon={<Check size={14} />}>
                Mark all read
              </Button>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Spinner size={28} /></div>
          ) : displayed.length === 0 ? (
            <EmptyState
              icon={<Bell size={32} className="text-gray-300" />}
              title={filter === 'UNREAD' ? 'No unread notifications' : 'No notifications'}
              description="You're all caught up! New notifications will appear here."
            />
          ) : (
            <div className="space-y-2">
              {displayed.map((n) => {
                const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.INFO;
                return (
                  <div
                    key={n.id}
                    className={cn(
                      'group relative flex gap-4 p-4 rounded-xl border transition-all',
                      cfg.bg, cfg.border,
                      !n.read && 'ring-2 ring-primary-200',
                      n.pa_id && 'cursor-pointer hover:shadow-sm'
                    )}
                    onClick={() => handleClick(n)}
                  >
                    {/* Unread dot */}
                    {!n.read && (
                      <div className="absolute top-4 right-4 w-2.5 h-2.5 rounded-full bg-primary-500" />
                    )}

                    {/* Icon */}
                    <div className={cn(
                      'flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center',
                      n.type === 'APPROVED' ? 'bg-green-100 text-green-600' :
                      n.type === 'DENIED' ? 'bg-red-100 text-red-600' :
                      n.type === 'PENDED' ? 'bg-yellow-100 text-yellow-600' :
                      n.type === 'ACTION_REQUIRED' ? 'bg-orange-100 text-orange-600' :
                      n.type === 'APPEAL' ? 'bg-purple-100 text-purple-600' :
                      'bg-blue-100 text-blue-600'
                    )}>
                      {cfg.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-8">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className={cn('text-sm font-semibold text-gray-900', !n.read && 'text-primary-800')}>
                          {n.title}
                        </p>
                        {n.pa_number && (
                          <span className="font-mono text-xs text-gray-500 flex-shrink-0">{n.pa_number}</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed">{n.message}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-gray-400">{formatDateTime(n.created_at)}</span>
                        {n.priority === 'HIGH' && (
                          <span className="text-xs font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded">High Priority</span>
                        )}
                        {n.pa_id && (
                          <span className="text-xs text-primary-600 font-medium flex items-center gap-0.5">
                            View PA <ChevronRight size={12} />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Delete */}
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                      className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-white/60 text-gray-400 hover:text-red-500 transition-all"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Layout>
    </>
  );
};

export default NotificationsPage;
