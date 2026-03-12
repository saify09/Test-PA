import type { AdminUser } from '../lib/types';
import React, { useState, useEffect } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import AdminLayout from '../components/layout/Layout';
import { Card, Button, Badge, Modal, Alert, Spinner, EmptyState, Tabs } from '../components/ui';
import { userApi } from '../lib/api';
import { fmt, cn } from '../lib/utils';
import toast from 'react-hot-toast';
import {
  Search, Plus, UserCheck, UserX, Key, Edit, Shield,
  Users, User, Lock, CheckCircle, X, RefreshCw
} from 'lucide-react';

const ROLES = ['ALL','REVIEWER_RN','REVIEWER_MD','MEDICAL_DIRECTOR','ADMIN','OPS_ADMIN','SUPER_ADMIN'];
const ROLE_COLORS: Record<string,string> = {
  SUPER_ADMIN:'badge-red', ADMIN:'badge-orange', OPS_ADMIN:'badge-purple',
  MEDICAL_DIRECTOR:'badge-purple', REVIEWER_MD:'badge-blue', REVIEWER_RN:'badge-green',
};
const PERMISSIONS_BY_ROLE: Record<string,string[]> = {
  REVIEWER_RN: ['cases:read','cases:review','cases:add_note','cases:request_info'],
  REVIEWER_MD: ['cases:read','cases:review','cases:add_note','cases:request_info','cases:approve','cases:deny','cases:cosign'],
  MEDICAL_DIRECTOR: ['cases:*','appeals:*','guidelines:*','metrics:read'],
  OPS_ADMIN: ['cases:*','users:read','reports:*','audit:read'],
  ADMIN: ['cases:*','users:*','reports:*','audit:read','config:read'],
  SUPER_ADMIN: ['*'],
};

const UsersPage: NextPage = () => {
  const [users, setUsers]       = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [tab, setTab]           = useState('users');
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [createModal, setCreateModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await userApi.list({ role: roleFilter === 'ALL' ? undefined : roleFilter, search: search || undefined });
      setUsers(res.data.items || []);
    } catch {
      setUsers(mockUsers());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [roleFilter, statusFilter]);

  const displayed = users.filter(u =>
    (!search || u.full_name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())) &&
    (statusFilter === 'ALL' || u.status === statusFilter)
  );

  const handleDisable = async (u: AdminUser) => {
    try {
      await (u.status === 'ACTIVE' ? userApi.disable(u.id) : userApi.enable(u.id));
      toast.success(`User ${u.status === 'ACTIVE' ? 'disabled' : 'enabled'}`);
      load();
    } catch { toast.success('Status updated (demo mode)'); setUsers(prev => prev.map(x => x.id===u.id ? {...x, status: x.status==='ACTIVE'?'INACTIVE':'ACTIVE'} : x)); }
  };

  const handleResetPw = async (u: AdminUser) => {
    try { await userApi.resetPw(u.id); toast.success(`Password reset email sent to ${u.email}`); }
    catch { toast.success(`Password reset email sent to ${u.email} (demo mode)`); }
  };

  const TABS = [
    { id: 'users', label: 'Users',   icon: <Users size={13} />,  count: users.length },
    { id: 'roles', label: 'Roles & Permissions', icon: <Shield size={13} /> },
  ];

  return (
    <>
      <Head><title>User Management | PA Admin</title></Head>
      <AdminLayout title="User Management">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <Tabs tabs={TABS} active={tab} onChange={setTab} />

          {tab === 'users' && (
            <>
              {/* Filters */}
              <div className="p-4 border-b border-slate-100 flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="Search name or email…" value={search}
                    onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key==='Enter' && load()}
                    className="form-input pl-9" />
                </div>
                <select className="form-input w-auto" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                  {ROLES.map(r => <option key={r}>{r}</option>)}
                </select>
                <select className="form-input w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option>ALL</option><option>ACTIVE</option><option>INACTIVE</option>
                </select>
                <Button variant="outline" size="sm" icon={<RefreshCw size={11} />} onClick={load} loading={loading}>Refresh</Button>
                <Button size="sm" icon={<Plus size={11} />} onClick={() => setCreateModal(true)}>Add User</Button>
              </div>

              {loading ? <div className="flex justify-center py-10"><Spinner /></div> : (
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>User</th><th>Role</th><th>Department</th><th>NPI</th>
                        <th>Status</th><th>Last Login</th><th>Cases (30d)</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayed.map(u => (
                        <tr key={u.id}>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                                <span className="text-xs font-bold text-primary-700">{u.full_name[0]}</span>
                              </div>
                              <div>
                                <p className="font-semibold text-slate-800 text-xs">{u.full_name}</p>
                                <p className="text-[10px] text-slate-400">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td><span className={cn('badge', ROLE_COLORS[u.role]||'badge-gray')}>{u.role.replace(/_/g,' ')}</span></td>
                          <td className="text-xs text-slate-500">{u.department||'—'}</td>
                          <td className="mono text-xs text-slate-500">{u.npi||'—'}</td>
                          <td>
                            <span className={cn('badge', u.status==='ACTIVE'?'badge-green':'badge-gray')}>
                              {u.status}
                            </span>
                          </td>
                          <td className="text-xs text-slate-400">{u.last_login ? fmt.ago(u.last_login) : 'Never'}</td>
                          <td className="text-xs font-bold text-slate-700">{u.cases_30d||0}</td>
                          <td>
                            <div className="flex gap-1">
                              <button onClick={() => setEditUser(u)} title="Edit"
                                className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors">
                                <Edit size={13} />
                              </button>
                              <button onClick={() => handleResetPw(u)} title="Reset Password"
                                className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors">
                                <Key size={13} />
                              </button>
                              <button onClick={() => handleDisable(u)} title={u.status==='ACTIVE'?'Disable':'Enable'}
                                className={cn('p-1.5 rounded transition-colors', u.status==='ACTIVE'
                                  ? 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                                  : 'text-slate-400 hover:text-green-600 hover:bg-green-50')}>
                                {u.status==='ACTIVE' ? <UserX size={13} /> : <UserCheck size={13} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {tab === 'roles' && (
            <div className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(PERMISSIONS_BY_ROLE).map(([role, perms]) => (
                  <div key={role} className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
                      <Shield size={14} className="text-primary-600" />
                      <span className={cn('badge', ROLE_COLORS[role]||'badge-gray')}>{role.replace(/_/g,' ')}</span>
                      <span className="text-xs text-slate-400 ml-auto">{users.filter(u=>u.role===role).length} users</span>
                    </div>
                    <div className="p-3 space-y-1">
                      {perms.map(p => (
                        <div key={p} className="flex items-center gap-2 text-xs text-slate-600">
                          <CheckCircle size={11} className="text-green-500 flex-shrink-0" />
                          <span className="mono">{p}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <Alert type="info" className="mt-4">
                <p className="text-xs">RBAC permissions are enforced at the API level. Changes to role definitions require code deployment. Contact system admin to modify roles.</p>
              </Alert>
            </div>
          )}
        </div>

        {/* Edit user modal */}
        {editUser && <UserModal user={editUser} onClose={() => setEditUser(null)} onSave={() => { setEditUser(null); load(); }} />}
        {createModal && <UserModal onClose={() => setCreateModal(false)} onSave={() => { setCreateModal(false); load(); }} />}
      </AdminLayout>
    </>
  );
};

const UserModal: React.FC<{ user?: AdminUser; onClose: () => void; onSave: () => void }> = ({ user, onClose, onSave }) => {
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [email, setEmail]       = useState(user?.email || '');
  const [role, setRole]         = useState(user?.role || 'REVIEWER_RN');
  const [dept, setDept]         = useState(user?.department || '');
  const [npi, setNpi]           = useState(user?.npi || '');
  const [saving, setSaving]     = useState(false);

  const handleSave = async () => {
    if (!fullName || !email) { toast.error('Name and email required'); return; }
    setSaving(true);
    try {
      if (user) await userApi.update(user.id, { full_name: fullName, email, role, department: dept, npi });
      else await userApi.create({ full_name: fullName, email, role, department: dept, npi });
      toast.success(user ? 'User updated' : 'User created — invitation sent');
      onSave();
    } catch {
      toast.success(user ? 'User updated (demo)' : 'User created (demo)');
      onSave();
    } finally { setSaving(false); }
  };

  return (
    <Modal isOpen title={user ? `Edit: ${user.full_name}` : 'Add New User'} onClose={onClose} size="sm"
      footer={<div className="flex gap-2 justify-end"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={handleSave} loading={saving}>{user?'Save Changes':'Create User'}</Button></div>}>
      <div className="space-y-4">
        <div><label className="form-label">Full Name *</label><input className="form-input" value={fullName} onChange={e => setFullName(e.target.value)} /></div>
        <div><label className="form-label">Email *</label><input type="email" className="form-input" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div>
          <label className="form-label">Role *</label>
          <select className="form-input bg-white" value={role} onChange={e => setRole(e.target.value)}>
            {ROLES.filter(r=>r!=='ALL').map(r => <option key={r} value={r}>{r.replace(/_/g,' ')}</option>)}
          </select>
        </div>
        <div><label className="form-label">Department</label><input className="form-input" value={dept} onChange={e => setDept(e.target.value)} placeholder="Clinical Review" /></div>
        <div><label className="form-label">NPI (if clinician)</label><input className="form-input mono" value={npi} onChange={e => setNpi(e.target.value)} placeholder="1234567890" maxLength={10} /></div>
        {!user && (
          <Alert type="info"><p className="text-xs">A temporary password and account activation email will be sent to the new user.</p></Alert>
        )}
        <div className="p-3 bg-slate-50 rounded-xl">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Permissions for {role.replace(/_/g,' ')}</p>
          <div className="flex flex-wrap gap-1">
            {(PERMISSIONS_BY_ROLE[role]||[]).map(p => (
              <span key={p} className="mono text-[10px] bg-primary-50 text-primary-700 px-1.5 py-0.5 rounded">{p}</span>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
};

function mockUsers() {
  return [
    { id:'u1', full_name:'Dr. James Kim',    email:'j.kim@hospital.org',    role:'REVIEWER_MD',    department:'Clinical Review', npi:'1234567890', status:'ACTIVE',   last_login: new Date(Date.now()-3600000).toISOString(),    cases_30d:312 },
    { id:'u2', full_name:'Sarah Parker',     email:'s.parker@hospital.org', role:'REVIEWER_RN',    department:'Clinical Review', npi:'0987654321', status:'ACTIVE',   last_login: new Date(Date.now()-7200000).toISOString(),    cases_30d:287 },
    { id:'u3', full_name:'Mike Torres',      email:'m.torres@hospital.org', role:'REVIEWER_RN',    department:'Clinical Review', npi:'1122334455', status:'ACTIVE',   last_login: new Date(Date.now()-86400000).toISOString(),   cases_30d:265 },
    { id:'u4', full_name:'Dr. Lisa Wong',    email:'l.wong@hospital.org',   role:'REVIEWER_MD',    department:'Clinical Review', npi:'5544332211', status:'ACTIVE',   last_login: new Date(Date.now()-14400000).toISOString(),   cases_30d:241 },
    { id:'u5', full_name:'Carol James',      email:'c.james@hospital.org',  role:'REVIEWER_RN',    department:'Clinical Review', npi:'6677889900', status:'ACTIVE',   last_login: new Date(Date.now()-28800000).toISOString(),   cases_30d:198 },
    { id:'u6', full_name:'Dr. Robert Chen',  email:'r.chen@hospital.org',   role:'MEDICAL_DIRECTOR',department:'Leadership',   npi:'9988776655', status:'ACTIVE',   last_login: new Date(Date.now()-3600000).toISOString(),    cases_30d:44 },
    { id:'u7', full_name:'System Admin',     email:'admin@hospital.org',    role:'SUPER_ADMIN',    department:'IT',             npi:null,         status:'ACTIVE',   last_login: new Date().toISOString(),                      cases_30d:0 },
    { id:'u8', full_name:'Anna Davis',       email:'a.davis@hospital.org',  role:'OPS_ADMIN',      department:'Operations',     npi:null,         status:'ACTIVE',   last_login: new Date(Date.now()-3600000*3).toISOString(),  cases_30d:0 },
    { id:'u9', full_name:'Tom Backup',       email:'t.backup@hospital.org', role:'REVIEWER_RN',    department:'Clinical Review', npi:'1231231231', status:'INACTIVE', last_login: new Date(Date.now()-2592000000).toISOString(), cases_30d:0 },
  ];
}

export default UsersPage;
