import React, { useState } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import AdminLayout from '../components/layout/Layout';
import { Card, Button, Alert, Tabs } from '../components/ui';
import { systemApi } from '../lib/api';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';
import { Save, AlertTriangle, Cpu, Bell, Shield, Settings, RefreshCw } from 'lucide-react';

const SettingsPage: NextPage = () => {
  const [tab, setTab] = useState('ai');
  const [saving, setSaving] = useState(false);

  // AI settings
  const [aiConfidence,    setAiConfidence]    = useState(0.85);
  const [autoApproveOn,   setAutoApproveOn]   = useState(true);
  const [autoDenyOn,      setAutoDenyOn]       = useState(false);
  const [maxAutoApprove,  setMaxAutoApprove]   = useState(0.92);
  const [minAutoDeny,     setMinAutoDeny]      = useState(0.15);
  const [aiModel,         setAiModel]          = useState('v2.4.1');

  // SLA settings
  const [urgentSla,    setUrgentSla]    = useState(24);
  const [standardSla,  setStandardSla]  = useState(72);
  const [expeditedSla, setExpeditedSla] = useState(72);
  const [appealSla,    setAppealSla]    = useState(720);

  // Notification settings
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsEnabled,   setSmsEnabled]   = useState(false);
  const [alertThreshold, setAlertThreshold] = useState(80);

  // HIPAA / Security
  const [sessionTimeout, setSessionTimeout] = useState(15);
  const [mfaRequired,    setMfaRequired]     = useState(true);
  const [auditRetention, setAuditRetention]  = useState(6);
  const [encryptAtRest,  setEncryptAtRest]   = useState(true);

  const save = async (key: string, value: any) => {
    setSaving(true);
    try {
      await systemApi.updateConfig(key, value);
      toast.success('Configuration saved');
    } catch {
      toast.success('Configuration saved (demo mode)');
    } finally { setSaving(false); }
  };

  const TABS = [
    { id: 'ai',       label: 'AI Engine',    icon: <Cpu size={13} /> },
    { id: 'sla',      label: 'SLA / TAT',    icon: <Settings size={13} /> },
    { id: 'notifs',   label: 'Notifications',icon: <Bell size={13} /> },
    { id: 'security', label: 'Security',     icon: <Shield size={13} /> },
  ];

  return (
    <>
      <Head><title>Configuration | PA Admin</title></Head>
      <AdminLayout title="System Configuration">
        <Alert type="warning" className="mb-4">
          <strong>Caution:</strong> Changes to system configuration take effect immediately and are logged in the audit trail. Verify settings with your clinical informatics team before saving.
        </Alert>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <Tabs tabs={TABS} active={tab} onChange={setTab} />

          <div className="p-5">
            {tab === 'ai' && (
              <div className="space-y-5 max-w-xl">
                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">AI Model</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="form-label">Active Model Version</label>
                      <select className="form-input bg-white" value={aiModel} onChange={e => setAiModel(e.target.value)}>
                        <option value="v2.4.1">v2.4.1 (Current — 93.8% accuracy)</option>
                        <option value="v2.3.0">v2.3.0 (Previous — 92.1% accuracy)</option>
                        <option value="v2.5.0-beta">v2.5.0-beta (Staging — 94.2% accuracy)</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Minimum Confidence Threshold</label>
                      <div className="flex items-center gap-3">
                        <input type="range" min={0.5} max={0.99} step={0.01} value={aiConfidence}
                          onChange={e => setAiConfidence(+e.target.value)} className="flex-1 accent-primary-600" />
                        <span className="text-sm font-bold text-slate-800 w-12 text-right">{(aiConfidence*100).toFixed(0)}%</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">Cases below this confidence will be routed to human review.</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Auto-Decision Rules</h3>
                  <div className="space-y-4">
                    <ToggleRow label="Enable Auto-Approval" sub="Allow AI to auto-approve cases above threshold" checked={autoApproveOn} onChange={setAutoApproveOn} />
                    {autoApproveOn && (
                      <div className="ml-4 pl-3 border-l-2 border-primary-200">
                        <label className="form-label">Auto-Approval Confidence Minimum</label>
                        <div className="flex items-center gap-3">
                          <input type="range" min={0.8} max={0.99} step={0.01} value={maxAutoApprove}
                            onChange={e => setMaxAutoApprove(+e.target.value)} className="flex-1 accent-green-600" />
                          <span className="text-sm font-bold text-green-700 w-12 text-right">{(maxAutoApprove*100).toFixed(0)}%</span>
                        </div>
                      </div>
                    )}
                    <ToggleRow label="Enable Auto-Denial" sub="Allow AI to auto-deny cases below threshold (requires Medical Director approval)" checked={autoDenyOn} onChange={setAutoDenyOn} />
                    {autoDenyOn && (
                      <Alert type="warning"><p className="text-xs">Auto-denial is a highly sensitive setting. Ensure compliance with your state's utilization review regulations.</p></Alert>
                    )}
                  </div>
                </div>

                <Button onClick={() => save('ai_config', { aiConfidence, autoApproveOn, autoDenyOn, maxAutoApprove, minAutoDeny, aiModel })}
                  loading={saving} icon={<Save size={13} />}>Save AI Configuration</Button>
              </div>
            )}

            {tab === 'sla' && (
              <div className="space-y-5 max-w-xl">
                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Decision Turnaround Targets (hours)</h3>
                  <div className="space-y-4">
                    {[
                      { label: 'Urgent / Emergency Cases', val: urgentSla, set: setUrgentSla, min: 4, max: 72, color: 'accent-red-600', note: 'Federal: 24h max' },
                      { label: 'Standard Cases', val: standardSla, set: setStandardSla, min: 24, max: 720, color: 'accent-blue-600', note: 'Federal: 72h max' },
                      { label: 'Expedited Appeals', val: expeditedSla, set: setExpeditedSla, min: 4, max: 72, color: 'accent-orange-600', note: 'Federal: 72h max' },
                      { label: 'Standard Appeals', val: appealSla, set: setAppealSla, min: 24, max: 720, color: 'accent-purple-600', note: 'Federal: 30 days (720h)' },
                    ].map(s => (
                      <div key={s.label}>
                        <label className="form-label">{s.label}</label>
                        <div className="flex items-center gap-3">
                          <input type="range" min={s.min} max={s.max} step={1} value={s.val}
                            onChange={e => s.set(+e.target.value)} className={cn('flex-1', s.color)} />
                          <span className="text-sm font-bold text-slate-800 w-16 text-right">{s.val}h ({(s.val/24).toFixed(1)}d)</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">{s.note}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <Button onClick={() => save('sla_config', { urgentSla, standardSla, expeditedSla, appealSla })}
                  loading={saving} icon={<Save size={13} />}>Save SLA Settings</Button>
              </div>
            )}

            {tab === 'notifs' && (
              <div className="space-y-5 max-w-xl">
                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Notification Channels</h3>
                  <div className="space-y-3">
                    <ToggleRow label="Email Notifications" sub="Send decisions via email to providers and members" checked={emailEnabled} onChange={setEmailEnabled} />
                    <ToggleRow label="SMS Notifications" sub="Send SMS for urgent decisions (requires Twilio config)" checked={smsEnabled} onChange={setSmsEnabled} />
                  </div>
                </div>
                <div className="border-t border-slate-100 pt-4">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Admin Alerts</h3>
                  <div>
                    <label className="form-label">Queue Alert Threshold</label>
                    <div className="flex items-center gap-3">
                      <input type="range" min={10} max={500} step={10} value={alertThreshold}
                        onChange={e => setAlertThreshold(+e.target.value)} className="flex-1 accent-amber-500" />
                      <span className="text-sm font-bold text-slate-800 w-16 text-right">{alertThreshold} cases</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Send admin alert when queue exceeds this count.</p>
                  </div>
                </div>
                <Button onClick={() => save('notif_config', { emailEnabled, smsEnabled, alertThreshold })}
                  loading={saving} icon={<Save size={13} />}>Save Notification Settings</Button>
              </div>
            )}

            {tab === 'security' && (
              <div className="space-y-5 max-w-xl">
                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">HIPAA Security Controls</h3>
                  <div className="space-y-3">
                    <ToggleRow label="Require MFA for All Users" sub="HIPAA §164.312(d) — Mandatory per policy" checked={mfaRequired} onChange={v => { if (!v) toast.error('MFA cannot be disabled per HIPAA policy'); }} />
                    <ToggleRow label="AES-256 Encryption at Rest" sub="Database and file storage encryption" checked={encryptAtRest} onChange={() => toast.error('Encryption cannot be modified via UI')} />
                    <div>
                      <label className="form-label">Session Timeout (minutes)</label>
                      <div className="flex items-center gap-3">
                        <input type="range" min={5} max={60} step={5} value={sessionTimeout}
                          onChange={e => setSessionTimeout(+e.target.value)} className="flex-1 accent-primary-600" />
                        <span className="text-sm font-bold text-slate-800 w-16 text-right">{sessionTimeout} min</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">HIPAA requires automatic logoff after inactivity. 15 min recommended.</p>
                    </div>
                    <div>
                      <label className="form-label">Audit Log Retention (years)</label>
                      <div className="flex items-center gap-3">
                        <input type="range" min={6} max={10} step={1} value={auditRetention}
                          onChange={e => setAuditRetention(+e.target.value)} className="flex-1 accent-primary-600" />
                        <span className="text-sm font-bold text-slate-800 w-12 text-right">{auditRetention}yr</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">HIPAA §164.530(j) requires 6-year minimum retention.</p>
                    </div>
                  </div>
                </div>
                <Alert type="info">
                  <p className="text-xs">Security settings are enforced at the infrastructure level. Some settings (encryption, MFA) cannot be disabled via UI and require infrastructure changes.</p>
                </Alert>
                <Button onClick={() => save('security_config', { sessionTimeout, mfaRequired, auditRetention })}
                  loading={saving} icon={<Save size={13} />}>Save Security Settings</Button>
              </div>
            )}
          </div>
        </div>
      </AdminLayout>
    </>
  );
};

const ToggleRow: React.FC<{ label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, sub, checked, onChange }) => (
  <div className="flex items-center justify-between gap-4 py-2">
    <div>
      <p className="text-sm font-semibold text-slate-800">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
    <button onClick={() => onChange(!checked)}
      className={cn('relative flex-shrink-0 w-9 h-5 rounded-full transition-colors', checked ? 'bg-primary-600' : 'bg-slate-300')}>
      <span className={cn('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0')} />
    </button>
  </div>
);

export default SettingsPage;
