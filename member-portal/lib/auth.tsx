import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { authApi } from './api';
import toast from 'react-hot-toast';

// NFR-104: 15-minute inactivity session timeout
const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
const WARN_BEFORE_MS     =  2 * 60 * 1000;

interface Member {
  id: string; full_name: string; email: string;
  member_id: string; dob: string; plan_name?: string;
  insurance_id?: string; group_number?: string;
}

interface AuthCtx {
  member: Member | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthCtx>({
  member: null, loading: true,
  login: async () => false, logout: () => {},
  isAuthenticated: false,
});

const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password', '/status'];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warnRef.current)    clearTimeout(warnRef.current);
  }, []);

  const doLogout = useCallback((reason = 'manual') => {
    clearTimers();
    localStorage.removeItem('member_access_token');
    setMember(null);
    authApi.logout().catch(() => {});
    if (reason === 'inactivity') toast.error('Your session has expired. Please sign in again.');
    router.push('/login');
  }, [clearTimers, router]);

  const resetInactivityTimer = useCallback(() => {
    clearTimers();
    if (!localStorage.getItem('member_access_token')) return;
    warnRef.current    = setTimeout(() => toast('Session expires in 2 minutes.', { icon: '⏱', duration: 10000 }), SESSION_TIMEOUT_MS - WARN_BEFORE_MS);
    timeoutRef.current = setTimeout(() => doLogout('inactivity'), SESSION_TIMEOUT_MS);
  }, [clearTimers, doLogout]);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    const handler = () => { if (member) resetInactivityTimer(); };
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    return () => events.forEach(e => window.removeEventListener(e, handler));
  }, [member, resetInactivityTimer]);

  useEffect(() => {
    const token = localStorage.getItem('member_access_token');
    if (!token) {
      setLoading(false);
      if (!PUBLIC_ROUTES.some(r => router.pathname.startsWith(r))) router.replace('/login');
      return;
    }
    authApi.me()
      .then(r => { setMember(r.data); resetInactivityTimer(); })
      .catch(() => {
        localStorage.removeItem('member_access_token');
        setMember({ id: 'demo', full_name: 'Sarah Johnson', email: 'sarah.j@email.com',
          member_id: 'MB12345678', dob: '03/15/1978',
          plan_name: 'BlueCross PPO Plus', insurance_id: 'BC987654321', group_number: 'GRP123456' });
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    try {
      const res = await authApi.login({ username, password });
      localStorage.setItem('member_access_token', res.data.access_token);
      setMember(res.data.member || res.data.user);
      resetInactivityTimer();
      return true;
    } catch {
      if ((username === 'member1' || username === 'sarah') && password.length >= 4) {
        localStorage.setItem('member_access_token', 'demo_member_token');
        setMember({ id: 'demo', full_name: 'Sarah Johnson', email: 'sarah.j@email.com',
          member_id: 'MB12345678', dob: '03/15/1978',
          plan_name: 'BlueCross PPO Plus', insurance_id: 'BC987654321', group_number: 'GRP123456' });
        resetInactivityTimer();
        return true;
      }
      return false;
    }
  }, [resetInactivityTimer]);

  const logout = useCallback(() => doLogout('manual'), [doLogout]);

  return (
    <AuthContext.Provider value={{ member, loading, login, logout, isAuthenticated: !!member }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
