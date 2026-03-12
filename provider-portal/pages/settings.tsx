import React, { useState } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import Layout from '../components/layout/Layout';
import { Card, Button, Alert } from '../components/ui';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';
import { Bell, Monitor, Shield, Globe, Save } from 'lucide-react';

interface NotifSettings {
  email_decisions: boolean; email_pending: boolean; email_appeals: boolean;
  sms_urgent: boolean; portal_all: boolean; fax_decisions: boolean;
}
interface DisplaySettings { theme: 'light'|'dark'|'system'; density: 'compact'|'normal'; }
interface PrivacySettings { two_factor: boolean; session_timeout: number; }

const SettingsPage: NextPage = () => {
  const [tab, setTab] = useState<'notifications'|'display'|'privacy'|'preferences'>('notifications');
  const [saving, setSaving] = useState(false);
  const [notif, setNotif] = useState<NotifSettings>({
    email_decisions: true, email_pending: true, email_appeals: true,
    sms_urgent: false, portal_all: true, fax_decisions: false,
  });
  const [display, setDisplay] = useState<DisplaySettings>({ theme: 'light', density: 'normal' });
  const [privacy, setPrivacy] = useState<PrivacySettings>({ two_factor: false, session_timeout: 30 });

  const save = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    setSaving(false);
    toast.success('Settings saved');
  };

  const Toggle = ({ checked, onChange, label, hint }: { checked: boolean; onChange: () => void; label: string; hint?: string }) => (
    <div className="flex items-start justify-between py-3 border-b border-gray-100 last:border-0">
      <div>
        <div className="text-sm font-medium text-gray-800">{label}</div>
        {hint && <div className="text-xs text-gray-500 mt-0.5">{hint}</div>}
      </div>
      <button onClick={onChange}
        className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
          checked ? 'bg-blue-600' : 'bg-gray-300')}>
        <span className={cn('inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow',
          checked ? 'translate-x-4.5' : 'translate-x-0.5')} />
      </button>
    </div>
  );

  const TABS = [
    { id: 'notifications' as const, label: 'Notifications', icon: <Bell size={15}/> },
    { id: 'display' as const,       label: 'Display',       icon: <Monitor size={15}/> },
    { id: 'privacy' as const,       label: 'Privacy',       icon: <Shield size={15}/> },
    { id: 'preferences' as const,   label: 'Preferences',   icon: <Globe size={15}/> },
  ];

  return (
    <Layout>
      <Head><title>Settings — Provider Portal</title></Head>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            <p className="text-sm text-gray-500 mt-1">Manage your portal preferences</p>
          </div>
          <Button onClick={save} loading={saving} className="flex items-center gap-2">
            <Save size={14}/>Save Settings
          </Button>
        </div>

        <div className="border-b border-gray-200">
          <nav className="flex gap-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                  tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700')}>
                {t.icon}{t.label}
              </button>
            ))}
          </nav>
        </div>

        {tab === 'notifications' && (
          <Card className="p-6 space-y-2">
            <h2 className="font-semibold text-gray-800 mb-4">Notification Preferences</h2>
            <Toggle checked={notif.email_decisions} onChange={() => setNotif(n=>({...n,email_decisions:!n.email_decisions}))}
              label="Email — PA Decisions" hint="Receive email when a PA is approved or denied" />
            <Toggle checked={notif.email_pending} onChange={() => setNotif(n=>({...n,email_pending:!n.email_pending}))}
              label="Email — Pended / Info Requested" hint="Notify when additional information is needed" />
            <Toggle checked={notif.email_appeals} onChange={() => setNotif(n=>({...n,email_appeals:!n.email_appeals}))}
              label="Email — Appeal Outcomes" hint="Notify when appeal decisions are issued" />
            <Toggle checked={notif.sms_urgent} onChange={() => setNotif(n=>({...n,sms_urgent:!n.sms_urgent}))}
              label="SMS — Urgent Cases Only" hint="Text alerts for emergent/urgent PA status changes" />
            <Toggle checked={notif.portal_all} onChange={() => setNotif(n=>({...n,portal_all:!n.portal_all}))}
              label="Portal Notifications" hint="Show in-portal notification bell for all events" />
            <Toggle checked={notif.fax_decisions} onChange={() => setNotif(n=>({...n,fax_decisions:!n.fax_decisions}))}
              label="Fax — Decision Letters" hint="Automatically fax decision letters to your office" />
          </Card>
        )}

        {tab === 'display' && (
          <Card className="p-6 space-y-5">
            <h2 className="font-semibold text-gray-800">Display Settings</h2>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Theme</label>
              <div className="flex gap-3">
                {(['light','dark','system'] as const).map(t => (
                  <button key={t} onClick={() => setDisplay(d=>({...d,theme:t}))}
                    className={cn('px-4 py-2 rounded-lg border text-sm font-medium capitalize transition-colors',
                      display.theme === t ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Table Density</label>
              <div className="flex gap-3">
                {(['compact','normal'] as const).map(d => (
                  <button key={d} onClick={() => setDisplay(s=>({...s,density:d}))}
                    className={cn('px-4 py-2 rounded-lg border text-sm font-medium capitalize transition-colors',
                      display.density === d ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        )}

        {tab === 'privacy' && (
          <Card className="p-6 space-y-5">
            <h2 className="font-semibold text-gray-800">Privacy & Security</h2>
            <Toggle checked={privacy.two_factor} onChange={() => setPrivacy(p=>({...p,two_factor:!p.two_factor}))}
              label="Two-Factor Authentication" hint="Require a verification code at each login" />
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">
                Session Timeout — {privacy.session_timeout} minutes
              </label>
              <input type="range" min={15} max={120} step={15} value={privacy.session_timeout}
                onChange={e => setPrivacy(p=>({...p,session_timeout:parseInt(e.target.value)}))}
                className="w-full accent-blue-600" />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>15 min</span><span>120 min</span>
              </div>
            </div>
            <Alert variant="info">
              Session timeout applies after inactivity. HIPAA compliance requires sessions expire within the set period.
            </Alert>
          </Card>
        )}

        {tab === 'preferences' && (
          <Card className="p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">Portal Preferences</h2>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span>Default request urgency</span>
                <select className="border border-gray-200 rounded px-2 py-1 text-sm">
                  <option>ROUTINE</option><option>URGENT</option>
                </select>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span>Dashboard date range</span>
                <select className="border border-gray-200 rounded px-2 py-1 text-sm">
                  <option>Last 30 days</option><option>Last 7 days</option><option>Last 90 days</option>
                </select>
              </div>
              <div className="flex justify-between items-center py-2">
                <span>Auto-save form drafts</span>
                <select className="border border-gray-200 rounded px-2 py-1 text-sm">
                  <option>Every 30 seconds</option><option>Every 60 seconds</option><option>Off</option>
                </select>
              </div>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default SettingsPage;
