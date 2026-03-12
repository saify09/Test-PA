import React, { useState, useEffect } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import Layout from '../components/layout/Layout';
import { Card, Button, Badge, Spinner } from '../components/ui';
import { cn, formatDateTime } from '../lib/utils';
import {
  Bell, AlertTriangle, CheckCircle, Info, XCircle, Filter,
  Trash2, CheckCheck, Settings, RefreshCw
} from 'lucide-react';

type NotifType = 'ALERT'|'INFO'|'SUCCESS'|'WARNING'|'SYSTEM';
type NotifSeverity = 'HIGH'|'MEDIUM'|'LOW';

interface AdminNotification {
  id: string; type: NotifType; severity: NotifSeverity;
  title: string; message: string; source: string;
  created_at: string; read: boolean; actionable: boolean;
  action_label?: string; action_url?: string;
}

const MOCK: AdminNotification[] = [
  { id:'n1', type:'ALERT', severity:'HIGH', title:'SLA Breach Detected', read:false, actionable:true,
    message:'3 cases have exceeded 72-hour standard SLA. Immediate reviewer assignment required.',
    source:'SLA Monitor', created_at: new Date(Date.now()-900000).toISOString(),
    action_label:'View Cases', action_url:'/cases' },
  { id:'n2', type:'WARNING', severity:'MEDIUM', title:'AI Model Drift Detected', read:false, actionable:true,
    message:'AI accuracy dropped below 90% threshold for imaging requests over the past 24 hours.',
    source:'AI Engine', created_at: new Date(Date.now()-3600000).toISOString(),
    action_label:'View AI Metrics', action_url:'/system' },
  { id:'n3', type:'SYSTEM', severity:'LOW', title:'Scheduled Maintenance Window', read:true, actionable:false,
    message:'System maintenance scheduled for Sunday 02:00-04:00 AM. Downtime expected: 15 minutes.',
    source:'DevOps', created_at: new Date(Date.now()-7200000).toISOString() },
  { id:'n4', type:'SUCCESS', severity:'LOW', title:'Daily Batch Processing Complete', read:true, actionable:false,
    message:'Nightly EDI 278 batch completed. 142 PAs transmitted to UHC, Aetna, BCBS. 0 errors.',
    source:'Payer Integration', created_at: new Date(Date.now()-28800000).toISOString() },
  { id:'n5', type:'ALERT', severity:'HIGH', title:'Payer API Timeout — Humana', read:false, actionable:false,
    message:'Humana Availity API has been timing out for the past 30 minutes. Requests are queued.',
    source:'Payer Integration', created_at: new Date(Date.now()-1800000).toISOString() },
  { id:'n6', type:'INFO', severity:'LOW', title:'New User Registration', read:true, actionable:true,
    message:'Provider Dr. Amanda Chen (NPI: 1098765432) registered. Pending admin approval.',
    source:'User Management', created_at: new Date(Date.now()-86400000).toISOString(),
    action_label:'Review User', action_url:'/users' },
  { id:'n7', type:'WARNING', severity:'MEDIUM', title:'Queue Depth Elevated', read:false, actionable:true,
    message:'Review queue has 47 pending cases. 8 reviewers online. Average wait: 4.2 hours.',
    source:'Queue Monitor', created_at: new Date(Date.now()-2700000).toISOString(),
    action_label:'Manage Queue', action_url:'/cases' },
];

const TYPE_CONFIG: Record<NotifType, { icon: React.ReactNode; bg: string; border: string; label: string }> = {
  ALERT:   { icon:<XCircle size={16}/>,       bg:'bg-red-50',    border:'border-red-200',    label:'Alert' },
  WARNING: { icon:<AlertTriangle size={16}/>, bg:'bg-amber-50',  border:'border-amber-200',  label:'Warning' },
  SUCCESS: { icon:<CheckCircle size={16}/>,   bg:'bg-green-50',  border:'border-green-200',  label:'Success' },
  INFO:    { icon:<Info size={16}/>,           bg:'bg-blue-50',   border:'border-blue-200',   label:'Info' },
  SYSTEM:  { icon:<Settings size={16}/>,       bg:'bg-gray-50',   border:'border-gray-200',   label:'System' },
};

const SEV_COLOR: Record<NotifSeverity, string> = {
  HIGH:'bg-red-100 text-red-700', MEDIUM:'bg-amber-100 text-amber-700', LOW:'bg-gray-100 text-gray-600',
};

const NotificationsPage: NextPage = () => {
  const [notifs, setNotifs] = useState<AdminNotification[]>(MOCK);
  const [filter, setFilter] = useState<'ALL'|NotifType|'UNREAD'>('ALL');
  const [loading, setLoading] = useState(false);

  const unreadCount = notifs.filter(n => !n.read).length;

  const markAllRead = () => setNotifs(n => n.map(x => ({...x, read:true})));
  const markRead    = (id: string) => setNotifs(n => n.map(x => x.id===id ? {...x,read:true} : x));
  const dismiss     = (id: string) => setNotifs(n => n.filter(x => x.id!==id));
  const clearAll    = () => setNotifs([]);

  const refresh = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 600));
    setNotifs(MOCK); setLoading(false);
  };

  const filtered = filter === 'ALL'    ? notifs
                 : filter === 'UNREAD' ? notifs.filter(n => !n.read)
                 : notifs.filter(n => n.type === filter);

  const FILTERS = [
    { id:'ALL', label:`All (${notifs.length})` },
    { id:'UNREAD', label:`Unread (${unreadCount})` },
    { id:'ALERT', label:'Alerts' }, { id:'WARNING', label:'Warnings' },
    { id:'SYSTEM', label:'System' }, { id:'INFO', label:'Info' },
  ] as const;

  return (
    <Layout>
      <Head><title>Notifications — Admin Dashboard</title></Head>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={refresh} className="flex items-center gap-1.5 text-sm">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
            </Button>
            {unreadCount > 0 && (
              <Button variant="outline" onClick={markAllRead} className="flex items-center gap-1.5 text-sm">
                <CheckCheck size={13}/> Mark all read
              </Button>
            )}
            {notifs.length > 0 && (
              <Button variant="ghost" onClick={clearAll} className="flex items-center gap-1.5 text-sm text-gray-500">
                <Trash2 size={13}/> Clear all
              </Button>
            )}
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id as any)}
              className={cn('px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                filter === f.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Notification list */}
        {loading ? (
          <div className="flex justify-center py-12"><Spinner size="lg"/></div>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center">
            <Bell size={36} className="mx-auto text-gray-300 mb-3"/>
            <p className="text-gray-500 font-medium">No notifications</p>
            <p className="text-gray-400 text-sm mt-1">You're all caught up!</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map(n => {
              const cfg = TYPE_CONFIG[n.type];
              return (
                <div key={n.id}
                  onClick={() => markRead(n.id)}
                  className={cn(
                    'rounded-xl border p-4 cursor-pointer transition-all hover:shadow-sm',
                    cfg.bg, cfg.border,
                    !n.read && 'ring-1 ring-offset-0',
                    !n.read && n.type === 'ALERT'   && 'ring-red-300',
                    !n.read && n.type === 'WARNING'  && 'ring-amber-300',
                    !n.read && n.type === 'INFO'     && 'ring-blue-300',
                    !n.read && n.type === 'SUCCESS'  && 'ring-green-300',
                    !n.read && n.type === 'SYSTEM'   && 'ring-gray-300',
                  )}>
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className={cn('mt-0.5 flex-shrink-0',
                      n.type==='ALERT' ? 'text-red-500' : n.type==='WARNING' ? 'text-amber-500' :
                      n.type==='SUCCESS' ? 'text-green-600' : n.type==='INFO' ? 'text-blue-500' : 'text-gray-400')}>
                      {cfg.icon}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{n.title}</span>
                        <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded', SEV_COLOR[n.severity])}>
                          {n.severity}
                        </span>
                        {!n.read && (
                          <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"/>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-0.5">{n.message}</p>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400">{n.source}</span>
                          <span className="text-xs text-gray-400">·</span>
                          <span className="text-xs text-gray-400">
                            {new Date(n.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {n.actionable && n.action_label && (
                            <a href={n.action_url} onClick={e => e.stopPropagation()}
                              className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline">
                              {n.action_label} →
                            </a>
                          )}
                          <button onClick={e => { e.stopPropagation(); dismiss(n.id); }}
                            className="text-gray-400 hover:text-gray-600 p-1 rounded">
                            <XCircle size={13}/>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default NotificationsPage;
