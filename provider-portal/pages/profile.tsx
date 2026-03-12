import React, { useState, useEffect } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import Layout from '../components/layout/Layout';
import { Card, Button, Input, Alert } from '../components/ui';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';
import { User, Building2, Phone, Mail, Shield, Save, Lock, CheckCircle, Edit2 } from 'lucide-react';

interface ProviderProfile {
  first_name: string; last_name: string; title: string;
  specialty: string; npi: string; tax_id: string;
  email: string; phone: string; fax: string;
  practice_name: string; facility_npi: string;
  address_line1: string; address_line2: string;
  city: string; state: string; zip: string;
  license_number: string; license_state: string; license_expiry: string;
}

const ProfilePage: NextPage = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<'profile' | 'practice' | 'security'>('profile');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [profile, setProfile] = useState<ProviderProfile>({
    first_name: 'Robert', last_name: 'Smith', title: 'MD',
    specialty: 'Orthopedic Surgery', npi: '1234567890', tax_id: '12-3456789',
    email: user?.email || 'dr.smith@provider.com', phone: '(555) 987-6543', fax: '(555) 987-6544',
    practice_name: "Smith Orthopedics", facility_npi: '9876543210',
    address_line1: '456 Medical Center Blvd', address_line2: 'Suite 200',
    city: 'Springfield', state: 'IL', zip: '62701',
    license_number: 'MD-IL-123456', license_state: 'IL', license_expiry: '2027-12-31',
  });
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });

  const set = (k: keyof ProviderProfile) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setProfile(p => ({ ...p, [k]: e.target.value }));

  const handleSave = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
    setSaved(true); setEditing(false); setLoading(false);
    toast.success('Profile updated successfully');
    setTimeout(() => setSaved(false), 3000);
  };

  const handlePasswordChange = async () => {
    if (pwForm.next !== pwForm.confirm) { toast.error('Passwords do not match'); return; }
    if (pwForm.next.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setLoading(true);
    await new Promise(r => setTimeout(r, 600));
    setLoading(false);
    setPwForm({ current: '', next: '', confirm: '' });
    toast.success('Password changed successfully');
  };

  const TABS = [
    { id: 'profile' as const, label: 'Provider Info', icon: <User size={15} /> },
    { id: 'practice' as const, label: 'Practice / Facility', icon: <Building2 size={15} /> },
    { id: 'security' as const, label: 'Security', icon: <Shield size={15} /> },
  ];

  return (
    <Layout>
      <Head><title>My Profile — Provider Portal</title></Head>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
            <p className="text-sm text-gray-500 mt-1">Manage your provider information and credentials</p>
          </div>
          {tab !== 'security' && (
            editing ? (
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                <Button onClick={handleSave} loading={loading} className="flex items-center gap-2">
                  <Save size={14} />{saved ? 'Saved!' : 'Save Changes'}
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setEditing(true)} className="flex items-center gap-2">
                <Edit2 size={14} /> Edit Profile
              </Button>
            )
          )}
        </div>

        {/* Avatar Card */}
        <Card className="p-6 flex items-center gap-5">
          <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold">
            {profile.first_name[0]}{profile.last_name[0]}
          </div>
          <div>
            <div className="text-xl font-semibold text-gray-900">
              {profile.title} {profile.first_name} {profile.last_name}
            </div>
            <div className="text-sm text-gray-500">{profile.specialty}</div>
            <div className="text-sm text-gray-400 mt-1">NPI: {profile.npi}</div>
          </div>
          {saved && (
            <div className="ml-auto flex items-center gap-2 text-green-600 text-sm font-medium">
              <CheckCircle size={16} /> Changes saved
            </div>
          )}
        </Card>

        {/* Tabs */}
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

        {/* Provider Info Tab */}
        {tab === 'profile' && (
          <Card className="p-6 space-y-5">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2"><User size={16}/>Provider Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" value={profile.first_name} onChange={set('first_name')} disabled={!editing} />
              <Input label="Last Name" value={profile.last_name} onChange={set('last_name')} disabled={!editing} />
              <Input label="Title / Credential" value={profile.title} onChange={set('title')} disabled={!editing} />
              <Input label="Specialty" value={profile.specialty} onChange={set('specialty')} disabled={!editing} />
              <Input label="NPI Number" value={profile.npi} onChange={set('npi')} disabled={!editing} hint="10-digit NPI" />
              <Input label="Tax ID (EIN)" value={profile.tax_id} onChange={set('tax_id')} disabled={!editing} />
              <Input label="License Number" value={profile.license_number} onChange={set('license_number')} disabled={!editing} />
              <Input label="License State" value={profile.license_state} onChange={set('license_state')} disabled={!editing} />
              <Input label="License Expiry" type="date" value={profile.license_expiry} onChange={set('license_expiry')} disabled={!editing} />
            </div>
            <h2 className="font-semibold text-gray-800 flex items-center gap-2 pt-2"><Phone size={16}/>Contact Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Email" type="email" value={profile.email} onChange={set('email')} disabled={!editing} />
              <Input label="Phone" value={profile.phone} onChange={set('phone')} disabled={!editing} />
              <Input label="Fax" value={profile.fax} onChange={set('fax')} disabled={!editing} />
            </div>
          </Card>
        )}

        {/* Practice Tab */}
        {tab === 'practice' && (
          <Card className="p-6 space-y-5">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2"><Building2 size={16}/>Practice / Facility</h2>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Practice Name" value={profile.practice_name} onChange={set('practice_name')} disabled={!editing} />
              <Input label="Facility NPI" value={profile.facility_npi} onChange={set('facility_npi')} disabled={!editing} />
              <div className="col-span-2">
                <Input label="Address Line 1" value={profile.address_line1} onChange={set('address_line1')} disabled={!editing} />
              </div>
              <div className="col-span-2">
                <Input label="Address Line 2" value={profile.address_line2} onChange={set('address_line2')} disabled={!editing} />
              </div>
              <Input label="City" value={profile.city} onChange={set('city')} disabled={!editing} />
              <Input label="State" value={profile.state} onChange={set('state')} disabled={!editing} />
              <Input label="ZIP Code" value={profile.zip} onChange={set('zip')} disabled={!editing} />
            </div>
          </Card>
        )}

        {/* Security Tab */}
        {tab === 'security' && (
          <Card className="p-6 space-y-5">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2"><Lock size={16}/>Change Password</h2>
            <div className="max-w-sm space-y-4">
              <Input label="Current Password" type="password" value={pwForm.current}
                onChange={e => setPwForm(p=>({...p,current:e.target.value}))} />
              <Input label="New Password" type="password" value={pwForm.next}
                onChange={e => setPwForm(p=>({...p,next:e.target.value}))}
                hint="Minimum 8 characters" />
              <Input label="Confirm New Password" type="password" value={pwForm.confirm}
                onChange={e => setPwForm(p=>({...p,confirm:e.target.value}))} />
              <Button onClick={handlePasswordChange} loading={loading}>Update Password</Button>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default ProfilePage;
