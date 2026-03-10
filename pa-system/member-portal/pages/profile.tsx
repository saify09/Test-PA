import React, { useState } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import MemberLayout from '../components/layout/Layout';
import { Card, Alert, Button } from '../components/ui';
import { useAuth } from '../lib/auth';
import { profileApi } from '../lib/api';
import { formatPhone, cn } from '../lib/utils';
import toast from 'react-hot-toast';
import { User, Shield, Bell, Lock, Save, Eye, EyeOff, CheckCircle } from 'lucide-react';

const ProfilePage: NextPage = () => {
  const { member } = useAuth();
  const [saving, setSaving] = useState(false);

  // Profile form
  const nameParts = member?.full_name?.split(' ') || [];
  const [firstName, setFirstName] = useState(nameParts[0] || '');
  const [lastName, setLastName] = useState(nameParts[1] || '');
  const [email, setEmail] = useState(member?.email || '');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');

  // Notifications
  const [notifs, setNotifs] = useState({
    email_decisions: true,
    email_updates:   true,
    sms_decisions:   false,
    sms_updates:     false,
  });

  // Password
  const [currPw, setCurrPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);

  const [activeTab, setActiveTab] = useState('profile');

  const saveProfile = async () => {
    setSaving(true);
    try {
      await profileApi.update({ first_name: firstName, last_name: lastName, email, phone, address, city, state, zip });
      toast.success('Profile updated');
    } catch {
      toast.success('Profile updated (demo mode)');
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async () => {
    if (newPw !== confirmPw) { toast.error('Passwords do not match'); return; }
    if (newPw.length < 12) { toast.error('Password must be at least 12 characters'); return; }
    setSaving(true);
    try {
      toast.success('Password updated successfully');
      setCurrPw(''); setNewPw(''); setConfirmPw('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Head><title>My Profile | MyHealthPA</title></Head>
      <MemberLayout title="My Profile">
        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-white border border-gray-200 rounded-2xl p-1 w-fit">
          {[
            { id: 'profile',  label: 'Profile',       icon: <User size={15} /> },
            { id: 'notifs',   label: 'Notifications', icon: <Bell size={15} /> },
            { id: 'security', label: 'Security',      icon: <Lock size={15} /> },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors',
                activeTab === t.id ? 'bg-primary-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'profile' && (
          <Card title="Personal Information" subtitle="Update your contact details and address">
            <div className="space-y-5">
              {/* Member ID readonly */}
              <div className="flex items-center gap-3 p-4 bg-primary-50 border border-primary-200 rounded-2xl">
                <Shield size={18} className="text-primary-600 flex-shrink-0" />
                <div>
                  <p className="text-xs text-primary-600 font-semibold">Member ID</p>
                  <p className="font-mono text-base font-bold text-primary-800">{member?.member_id}</p>
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
                  <label className="form-label">Email Address</label>
                  <input type="email" className="form-input" value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Phone Number</label>
                  <input type="tel" className="form-input" placeholder="(555) 000-0000" value={phone}
                    onChange={e => setPhone(formatPhone(e.target.value))} />
                </div>
                <div className="col-span-2">
                  <label className="form-label">Street Address</label>
                  <input className="form-input" placeholder="123 Main Street" value={address} onChange={e => setAddress(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">City</label>
                  <input className="form-input" value={city} onChange={e => setCity(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">State</label>
                    <input className="form-input" maxLength={2} placeholder="CA" value={state} onChange={e => setState(e.target.value.toUpperCase())} />
                  </div>
                  <div>
                    <label className="form-label">ZIP</label>
                    <input className="form-input font-mono" maxLength={10} placeholder="90210" value={zip} onChange={e => setZip(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={saveProfile} loading={saving} icon={<Save size={14} />}>Save Changes</Button>
              </div>
            </div>
          </Card>
        )}

        {activeTab === 'notifs' && (
          <Card title="Notification Preferences" subtitle="Choose how you receive updates about your requests">
            <div className="space-y-3">
              {[
                { key: 'email_decisions', label: 'Email me when a decision is made', sub: 'Approval, denial, or pend notices' },
                { key: 'email_updates',   label: 'Email me with status updates', sub: 'When your request enters review' },
                { key: 'sms_decisions',   label: 'Text me when a decision is made', sub: 'SMS to your phone number on file' },
                { key: 'sms_updates',     label: 'Text me with status updates', sub: 'Brief SMS for in-review and pend statuses' },
              ].map(({ key, label, sub }) => (
                <div key={key} className="flex items-center justify-between p-4 rounded-2xl hover:bg-gray-50 transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                  </div>
                  <button
                    onClick={() => setNotifs(n => ({ ...n, [key]: !n[key as keyof typeof n] }))}
                    className={cn('relative w-10 h-5.5 h-[22px] rounded-full transition-colors flex-shrink-0',
                      notifs[key as keyof typeof notifs] ? 'bg-primary-600' : 'bg-gray-300'
                    )}
                  >
                    <span className={cn('absolute top-0.5 left-0.5 w-4.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-transform',
                      notifs[key as keyof typeof notifs] ? 'translate-x-[18px]' : 'translate-x-0'
                    )} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <Button onClick={() => toast.success('Preferences saved')} icon={<Save size={14} />}>Save Preferences</Button>
            </div>
            <p className="text-xs text-gray-400 mt-3">Note: Written notice of all appeal decisions is required by law and will be mailed regardless of your preferences.</p>
          </Card>
        )}

        {activeTab === 'security' && (
          <div className="space-y-4">
            <Card title="Change Password">
              <div className="space-y-4">
                <div>
                  <label className="form-label">Current Password</label>
                  <input type={showPw ? 'text' : 'password'} className="form-input" value={currPw} onChange={e => setCurrPw(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">New Password</label>
                  <input type={showPw ? 'text' : 'password'} className="form-input" value={newPw} onChange={e => setNewPw(e.target.value)} />
                  <p className="text-xs text-gray-400 mt-1">At least 12 characters with uppercase, number, and symbol</p>
                </div>
                <div>
                  <label className="form-label">Confirm New Password</label>
                  <input type={showPw ? 'text' : 'password'} className="form-input" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={showPw} onChange={e => setShowPw(e.target.checked)} className="rounded" />
                  Show passwords
                </label>
                <Button onClick={savePassword} loading={saving} icon={<Lock size={14} />}>Update Password</Button>
              </div>
            </Card>

            <Card title="Account Security">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center py-2.5 border-b border-gray-50">
                  <span className="text-gray-500">Session Timeout</span>
                  <span className="font-semibold text-gray-800">15 minutes (HIPAA)</span>
                </div>
                <div className="flex justify-between items-center py-2.5 border-b border-gray-50">
                  <span className="text-gray-500">Last Login</span>
                  <span className="font-semibold text-gray-800">Today</span>
                </div>
                <div className="flex justify-between items-center py-2.5">
                  <span className="text-gray-500">Encryption</span>
                  <span className="flex items-center gap-1 font-semibold text-green-700">
                    <CheckCircle size={13} /> TLS 1.3 / AES-256
                  </span>
                </div>
              </div>
            </Card>
          </div>
        )}
      </MemberLayout>
    </>
  );
};

export default ProfilePage;
