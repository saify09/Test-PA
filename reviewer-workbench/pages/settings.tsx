import React, { useState } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import Layout from '../components/layout/Layout';
import { Card, Button, Alert } from '../components/ui';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';
import { User, Bell, Shield, Monitor, Save, Lock, CheckCircle } from 'lucide-react';

const SECTION_TABS = [
  { id: 'profile',       label: 'Profile',          icon: <User size={15} /> },
  { id: 'notifications', label: 'Notifications',    icon: <Bell size={15} /> },
  { id: 'display',       label: 'Display',          icon: <Monitor size={15} /> },
  { id: 'security',      label: 'Security',         icon: <Shield size={15} /> },
];

const SettingsPage: NextPage = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState('profile');
  const [saved, setSaved] = useState(false);

  // Profile state
  const [firstName, setFirstName]   = useState(user?.full_name?.split(' ')[0] || '');
  const [lastName, setLastName]     = useState(user?.full_name?.split(' ')[1] || '');
  const [phone, setPhone]           = useState('');
  const [specialty, setSpecialty]   = useState('');
  const [npi, setNpi]               = useState('');
  const [license, setLicense]       = useState('');

  // Notification prefs
  const [notifPrefs, setNotifPrefs] = useState({
    new_assignment:   true,
    urgent_cases:     true,
    deadline_1h:      true,
    deadline_4h:      true,
    co_sign_request:  true,
    p2p_request:      true,
    system_alerts:    false,
    email_summary:    false,
  });

  // Display prefs
  const [displayPrefs, setDisplayPrefs] = useState({
    default_sort:     'priority_score',
    cases_per_page:   '20',
    show_ai_score:    true,
    show_patient_dob: true,
    compact_view:     false,
    auto_advance:     true,
  });

  // Security
  const [currentPw, setCurrentPw]   = useState('');
  const [newPw, setNewPw]           = useState('');
  const [confirmPw, setConfirmPw]   = useState('');
  const [mfaEnabled, setMfaEnabled] = useState(true);

  const handleSave = () => {
    setSaved(true);
    toast.success('Settings saved');
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <>
      <Head><title>Settings | Reviewer Workbench</title></Head>
      <Layout title="Settings">
        <div className="max-w-3xl mx-auto">
          {/* Tab nav */}
          <div className="flex gap-1 mb-5 bg-white border border-gray-200 rounded-xl p-1 w-fit">
            {SECTION_TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                tab === t.id ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Profile */}
          {tab === 'profile' && (
            <Card title="Profile Information" subtitle="Your identity in the review workbench">
              <div className="space-y-5">
                {/* Avatar */}
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-bold">
                    {(firstName[0] || '?')}{(lastName[0] || '')}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{user?.full_name || 'Reviewer'}</p>
                    <p className="text-xs text-gray-500">{user?.email}</p>
                    <p className="text-xs text-blue-600 mt-1 cursor-pointer hover:underline">Change photo</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">First Name</label>
                    <input className="form-input" value={firstName} onChange={e => setFirstName(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Last Name</label>
                    <input className="form-input" value={lastName} onChange={e => setLastName(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Role / Title</label>
                    <input className="form-input" value={user?.role || ''} disabled className="form-input bg-gray-50 text-gray-400 cursor-not-allowed" />
                    <p className="text-xs text-gray-400 mt-1">Contact admin to change role</p>
                  </div>
                  <div>
                    <label className="form-label">Specialty</label>
                    <select className="form-input bg-white" value={specialty} onChange={e => setSpecialty(e.target.value)}>
                      <option value="">Select specialty</option>
                      <option>Internal Medicine</option>
                      <option>Family Medicine</option>
                      <option>Orthopedics</option>
                      <option>Oncology</option>
                      <option>Cardiology</option>
                      <option>Neurology</option>
                      <option>Utilization Review RN</option>
                      <option>Case Management RN</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">NPI Number</label>
                    <input className="form-input font-mono" placeholder="0000000000" maxLength={10} value={npi} onChange={e => setNpi(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">License Number</label>
                    <input className="form-input font-mono" placeholder="e.g. RN123456" value={license} onChange={e => setLicense(e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <label className="form-label">Phone (for urgent notifications)</label>
                    <input className="form-input" type="tel" placeholder="(555) 000-0000" value={phone} onChange={e => setPhone(e.target.value)} />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleSave} icon={saved ? <CheckCircle size={14} /> : <Save size={14} />} variant={saved ? 'success' : 'primary'}>
                    {saved ? 'Saved' : 'Save Changes'}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Notifications */}
          {tab === 'notifications' && (
            <Card title="Notification Preferences" subtitle="Control when and how you receive alerts">
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Case Assignments</p>
                  <div className="space-y-2">
                    {[
                      { key: 'new_assignment',  label: 'New case assigned to me' },
                      { key: 'urgent_cases',    label: 'New emergent/urgent case arrives' },
                      { key: 'co_sign_request', label: 'MD co-sign requested on my case' },
                      { key: 'p2p_request',     label: 'Peer-to-peer consultation scheduled' },
                    ].map(({ key, label }) => (
                      <ToggleRow key={key} label={label}
                        checked={notifPrefs[key as keyof typeof notifPrefs] as boolean}
                        onChange={v => setNotifPrefs(p => ({ ...p, [key]: v }))} />
                    ))}
                  </div>
                </div>
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Deadlines & SLA</p>
                  <div className="space-y-2">
                    {[
                      { key: 'deadline_1h', label: 'Alert 1 hour before case deadline' },
                      { key: 'deadline_4h', label: 'Alert 4 hours before case deadline' },
                    ].map(({ key, label }) => (
                      <ToggleRow key={key} label={label}
                        checked={notifPrefs[key as keyof typeof notifPrefs] as boolean}
                        onChange={v => setNotifPrefs(p => ({ ...p, [key]: v }))} />
                    ))}
                  </div>
                </div>
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Other</p>
                  <div className="space-y-2">
                    {[
                      { key: 'system_alerts', label: 'System maintenance and downtime alerts' },
                      { key: 'email_summary', label: 'Daily email summary of reviewed cases' },
                    ].map(({ key, label }) => (
                      <ToggleRow key={key} label={label}
                        checked={notifPrefs[key as keyof typeof notifPrefs] as boolean}
                        onChange={v => setNotifPrefs(p => ({ ...p, [key]: v }))} />
                    ))}
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleSave} icon={<Save size={14} />}>Save Preferences</Button>
                </div>
              </div>
            </Card>
          )}

          {/* Display */}
          {tab === 'display' && (
            <Card title="Display Preferences" subtitle="Customize your review workbench view">
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Default Queue Sort</label>
                    <select className="form-input bg-white" value={displayPrefs.default_sort} onChange={e => setDisplayPrefs(p => ({ ...p, default_sort: e.target.value }))}>
                      <option value="priority_score">Priority Score</option>
                      <option value="deadline">Deadline (soonest)</option>
                      <option value="received_at">Received Date</option>
                      <option value="ai_score">AI Confidence</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Cases Per Page</label>
                    <select className="form-input bg-white" value={displayPrefs.cases_per_page} onChange={e => setDisplayPrefs(p => ({ ...p, cases_per_page: e.target.value }))}>
                      <option value="10">10 per page</option>
                      <option value="20">20 per page</option>
                      <option value="50">50 per page</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2 border-t border-gray-100 pt-4">
                  {[
                    { key: 'show_ai_score',    label: 'Show AI confidence score in queue' },
                    { key: 'show_patient_dob', label: 'Show patient date of birth in tables' },
                    { key: 'compact_view',     label: 'Compact queue rows (smaller font)' },
                    { key: 'auto_advance',     label: 'Auto-advance to next case after decision' },
                  ].map(({ key, label }) => (
                    <ToggleRow key={key} label={label}
                      checked={displayPrefs[key as keyof typeof displayPrefs] as boolean}
                      onChange={v => setDisplayPrefs(p => ({ ...p, [key]: v }))} />
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleSave} icon={<Save size={14} />}>Save Preferences</Button>
                </div>
              </div>
            </Card>
          )}

          {/* Security */}
          {tab === 'security' && (
            <div className="space-y-4">
              <Card title="Change Password">
                <div className="space-y-4">
                  <div>
                    <label className="form-label">Current Password</label>
                    <input type="password" className="form-input" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">New Password</label>
                    <input type="password" className="form-input" value={newPw} onChange={e => setNewPw(e.target.value)} />
                    <p className="text-xs text-gray-400 mt-1">Min 12 chars, must include uppercase, number, and symbol</p>
                  </div>
                  <div>
                    <label className="form-label">Confirm New Password</label>
                    <input type="password" className="form-input" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
                  </div>
                  <Button onClick={() => { toast.success('Password updated'); setCurrentPw(''); setNewPw(''); setConfirmPw(''); }} icon={<Lock size={14} />}>
                    Update Password
                  </Button>
                </div>
              </Card>
              <Card title="Two-Factor Authentication">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">TOTP Authenticator App</p>
                    <p className="text-xs text-gray-500 mt-0.5">Required per HIPAA security policy. Uses Google Authenticator or compatible app.</p>
                  </div>
                  <div className={cn('flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full',
                    mfaEnabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  )}>
                    <div className={cn('w-1.5 h-1.5 rounded-full', mfaEnabled ? 'bg-green-500' : 'bg-red-500')} />
                    {mfaEnabled ? 'Enabled' : 'Disabled'}
                  </div>
                </div>
                {!mfaEnabled && (
                  <Alert type="warning" className="mt-3" title="MFA Required">
                    Multi-factor authentication is required to access clinical review functions. Please enable it immediately.
                  </Alert>
                )}
              </Card>
              <Card title="Session & Access">
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between py-2 border-b border-gray-50">
                    <span className="text-gray-500">Session Timeout</span>
                    <span className="font-semibold text-gray-800">15 minutes (HIPAA required)</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-50">
                    <span className="text-gray-500">Last Login</span>
                    <span className="font-semibold text-gray-800">Today at {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-gray-500">IP Address</span>
                    <span className="font-mono font-semibold text-gray-800">192.168.1.45</span>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      </Layout>
    </>
  );
};

const ToggleRow: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50 transition-colors">
    <span className="text-sm text-gray-700">{label}</span>
    <button
      onClick={() => onChange(!checked)}
      className={cn('relative w-9 h-5 rounded-full transition-colors flex-shrink-0', checked ? 'bg-blue-600' : 'bg-gray-300')}
    >
      <span className={cn('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0')} />
    </button>
  </div>
);

export default SettingsPage;
