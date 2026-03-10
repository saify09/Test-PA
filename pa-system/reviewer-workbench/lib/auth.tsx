import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { authApi } from './api';
import toast from 'react-hot-toast';

// NFR-104: 15-minute inactivity session timeout
const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
const WARN_BEFORE_MS     =  2 * 60 * 1000;

export interface ReviewerUser {
  id: string; username: string; email: string; full_name: string;
  role: 'RN_REVIEWER' | 'MD_REVIEWER' | 'MEDICAL_DIRECTOR' | 'ADMIN';
  credentials: string; department: string; can_approve_denials: boolean;
}

interface AuthCtx {
  user: ReviewerUser | null; loading: boolean;
  login: (u: string, p: string) => Promise<boolean>;
  logout: () => void; isAuthenticated: boolean;
}

const AuthContext = createContext<AuthCtx>({ user: null, loading: true, login: async () => false, logout: () => {}, isAuthenticated: false });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<ReviewerUser | null>(null);
  const [loading, setLoading] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warnRef.current)    clearTimeout(warnRef.current);
  }, []);

  const doLogout = useCallback((reason = 'manual') => {
    clearTimers();
    authApi.logout().catch(() => {});
    localStorage.removeItem('reviewer_access_token');
    setUser(null);
    if (reason === 'inactivity') toast.error('Session expired due to inactivity. Please sign in again.');
    window.location.href = '/login';
  }, [clearTimers]);

  const resetInactivityTimer = useCallback(() => {
    clearTimers();
    if (!localStorage.getItem('reviewer_access_token')) return;
    warnRef.current    = setTimeout(() => toast('Session expires in 2 minutes.', { icon: '⏱', duration: 10000 }), SESSION_TIMEOUT_MS - WARN_BEFORE_MS);
    timeoutRef.current = setTimeout(() => doLogout('inactivity'), SESSION_TIMEOUT_MS);
  }, [clearTimers, doLogout]);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    const handler = () => { if (user) resetInactivityTimer(); };
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    return () => events.forEach(e => window.removeEventListener(e, handler));
  }, [user, resetInactivityTimer]);

  useEffect(() => {
    const token = localStorage.getItem('reviewer_access_token');
    if (token) {
      authApi.me().then(r => { setUser(r.data); resetInactivityTimer(); })
        .catch(() => localStorage.removeItem('reviewer_access_token'))
        .finally(() => setLoading(false));
    } else setLoading(false);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const r = await authApi.login({ username, password });
      localStorage.setItem('reviewer_access_token', r.data.access_token);
      setUser(r.data.user);
      resetInactivityTimer();
      return true;
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Login failed'); return false;
    }
  }, [resetInactivityTimer]);

  const logout = useCallback(() => doLogout('manual'), [doLogout]);

  return <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
