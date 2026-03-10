import React, { useState } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import MemberLayout from '../components/layout/Layout';
import { Card, Button, Alert } from '../components/ui';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';
import { Save, Shield, Bell, Globe, Trash2, AlertTriangle } from 'lucide-react';

const SettingsPage: NextPage = () => {
  const { member, logout } = useAuth();
  const [language, setLanguage]  = useState('en');
  const [timezone, setTimezone]  = useState('America/Los_Angeles');
  const [paperless, setPaperless] = useState(true);
  const [twoFactor, setTwoFactor] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  return (
    <>
      <Head><title>Settings | MyHealthPA</title></Head>
      <MemberLayout title="Account Settings">
        <div className="max-w-2xl space-y-5">
          {/* Paperless / communication */}
          <Card title="Communication Preferences">
            <div className="space-y-4">
              <ToggleRow
                label="Paperless Communications"
                sub="Receive letters and notices via email instead of mail"
                checked={paperless}
                onChange={setPaperless}
              />
              <div className="border-t border-gray-100 pt-4">
                <label className="form-label">Preferred Language</label>
                <select className="form-input bg-white" value={language} onChange={e => setLanguage(e.target.value)}>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                  <option value="zh">中文 (Chinese)</option>
                  <option value="vi">Tiếng Việt</option>
                  <option value="ko">한국어 (Korean)</option>
                  <option value="tl">Tagalog</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">All official notices are available in your preferred language upon request.</p>
              </div>
              <div>
                <label className="form-label">Time Zone</label>
                <select className="form-input bg-white" value={timezone} onChange={e => setTimezone(e.target.value)}>
                  <option value="America/New_York">Eastern Time (ET)</option>
                  <option value="America/Chicago">Central Time (CT)</option>
                  <option value="America/Denver">Mountain Time (MT)</option>
                  <option value="America/Los_Angeles">Pacific Time (PT)</option>
                  <option value="America/Anchorage">Alaska Time (AKT)</option>
                  <option value="Pacific/Honolulu">Hawaii Time (HT)</option>
                </select>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => toast.success('Communication preferences saved')} icon={<Save size={14} />}>
                  Save Preferences
                </Button>
              </div>
            </div>
          </Card>

          {/* Security */}
          <Card title="Security Settings">
            <div className="space-y-4">
              <ToggleRow
                label="Two-Factor Authentication"
                sub="Require a verification code in addition to your password when signing in"
                checked={twoFactor}
                onChange={v => {
                  setTwoFactor(v);
                  if (v) toast.success('2FA setup — use an authenticator app to scan the QR code');
                }}
              />
              <div className="border-t border-gray-100 pt-4 space-y-2 text-sm">
                <div className="flex justify-between py-2">
                  <span className="text-gray-500">Session Timeout</span>
                  <span className="font-semibold text-gray-800">15 minutes (required)</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-500">Data Encryption</span>
                  <span className="font-semibold text-green-700 flex items-center gap-1"><Shield size={13} /> AES-256 / TLS 1.3</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Data & privacy */}
          <Card title="Data & Privacy">
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Your health information is protected under HIPAA. You have the right to request a copy of your data or ask for corrections.</p>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" size="sm" onClick={() => toast.success('Data export request submitted — you will receive an email within 48 hours')}>
                  Request My Data Export
                </Button>
                <Button variant="outline" size="sm" onClick={() => toast.success('Support ticket created for data correction request')}>
                  Request Data Correction
                </Button>
              </div>
              <div className="border-t border-gray-100 pt-4">
                <a href="#" className="text-sm text-primary-700 hover:underline font-medium">Privacy Policy</a>
                {' · '}
                <a href="#" className="text-sm text-primary-700 hover:underline font-medium">HIPAA Notice of Privacy Practices</a>
              </div>
            </div>
          </Card>

          {/* Danger zone */}
          <Card title="Account Actions">
            <div className="space-y-4">
              {!deleteConfirm ? (
                <div className="flex items-start justify-between p-4 bg-red-50 border border-red-200 rounded-2xl">
                  <div>
                    <p className="text-sm font-bold text-red-800">Delete My Account</p>
                    <p className="text-xs text-red-600 mt-0.5">Permanently delete your account and all associated data. This action cannot be undone.</p>
                  </div>
                  <button
                    onClick={() => setDeleteConfirm(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-700 transition-colors flex-shrink-0 ml-4"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              ) : (
                <Alert type="error" title="Confirm Account Deletion">
                  <p className="text-sm mt-1">Are you absolutely sure? All your prior authorization history, appeal records, and account data will be permanently deleted.</p>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => setDeleteConfirm(false)} className="px-4 py-2 text-sm font-semibold bg-white border border-gray-300 rounded-xl hover:bg-gray-50">
                      Cancel
                    </button>
                    <button onClick={() => { toast.error('Account deletion requires confirmation via email'); setDeleteConfirm(false); }}
                      className="px-4 py-2 text-sm font-bold bg-red-600 text-white rounded-xl hover:bg-red-700">
                      Yes, Delete My Account
                    </button>
                  </div>
                </Alert>
              )}
            </div>
          </Card>
        </div>
      </MemberLayout>
    </>
  );
};

const ToggleRow: React.FC<{ label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, sub, checked, onChange }) => (
  <div className="flex items-center justify-between gap-4">
    <div>
      <p className="text-sm font-semibold text-gray-900">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
    <button
      onClick={() => onChange(!checked)}
      className={cn('relative flex-shrink-0 w-10 h-6 rounded-full transition-colors', checked ? 'bg-primary-600' : 'bg-gray-300')}
    >
      <span className={cn('absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0')} />
    </button>
  </div>
);

export default SettingsPage;
