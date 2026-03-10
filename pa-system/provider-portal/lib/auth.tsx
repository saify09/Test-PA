import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { authApi } from './api';
import toast from 'react-hot-toast';

// NFR-104: Automated session timeout after 15 minutes of inactivity
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const WARN_BEFORE_MS = 2 * 60 * 1000;      // warn 2 minutes before

interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: 'PROVIDER' | 'REVIEWER' | 'ADMIN' | 'MEMBER';
  provider_npi?: string;
  organization?: string;
  mfa_verified: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => false,
  logout: () => {},
  isAuthenticated: false,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warnRef.current) clearTimeout(warnRef.current);
  }, []);

  const doLogout = useCallback((reason = 'session') => {
    clearTimers();
    authApi.logout().catch(() => {});
    localStorage.removeItem('pa_access_token');
    setUser(null);
    if (reason === 'inactivity') {
      toast.error('Your session has expired due to inactivity. Please sign in again.');
    }
    window.location.href = '/login';
  }, [clearTimers]);

  const resetInactivityTimer = useCallback(() => {
    clearTimers();
    // Only run when authenticated
    if (!localStorage.getItem('pa_access_token')) return;
    warnRef.current = setTimeout(() => {
      toast('Your session will expire in 2 minutes due to inactivity.', { icon: '⏱', duration: 10000 });
    }, SESSION_TIMEOUT_MS - WARN_BEFORE_MS);
    timeoutRef.current = setTimeout(() => doLogout('inactivity'), SESSION_TIMEOUT_MS);
  }, [clearTimers, doLogout]);

  // Attach activity listeners
  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    const handler = () => { if (user) resetInactivityTimer(); };
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    return () => events.forEach(e => window.removeEventListener(e, handler));
  }, [user, resetInactivityTimer]);

  useEffect(() => {
    const token = localStorage.getItem('pa_access_token');
    if (token) {
      authApi.me()
        .then((res) => { setUser(res.data); resetInactivityTimer(); })
        .catch(() => localStorage.removeItem('pa_access_token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    try {
      const res = await authApi.login({ username, password });
      const { access_token, user: userData } = res.data;
      localStorage.setItem('pa_access_token', access_token);
      setUser(userData);
      resetInactivityTimer();
      return true;
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Login failed');
      return false;
    }
  }, [resetInactivityTimer]);

  const logout = useCallback(() => doLogout('manual'), [doLogout]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
export default AuthContext;
