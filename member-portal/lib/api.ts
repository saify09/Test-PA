import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('member_access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('member_access_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────
export const authApi = {
  login:  (creds: { username: string; password: string }) => api.post('/auth/member/login', creds),
  logout: () => api.post('/auth/logout'),
  me:     () => api.get('/auth/me'),
  forgotPassword: (emailOrMemberId: string) => api.post('/auth/forgot-password', { identifier: emailOrMemberId }),
  register: (data: { first_name: string; last_name: string; email: string; member_id: string; dob: string; password: string }) =>
    api.post('/auth/member/register', data),
};

// ─── Prior Auth Requests ──────────────────────────────────────────────────
export const paApi = {
  list: (params?: {
    status?: string; page?: number; limit?: number;
    sort_by?: string; sort_dir?: string;
  }) => api.get('/api/v1/member/pa-requests', { params }),

  get: (pa_id: string) => api.get(`/api/v1/member/pa-requests/${pa_id}`),

  getStatus: (pa_number: string) =>
    api.get('/api/v1/member/pa-requests/status', { params: { pa_number } }),

  downloadLetter: (pa_id: string) =>
    api.get(`/api/v1/member/pa-requests/${pa_id}/letter`, { responseType: 'blob' }),

  // PR-004: Download all PA letters as ZIP (member data portability)
  downloadAllLetters: () =>
    api.get('/api/v1/member/pa-requests/letters/download-all', { responseType: 'blob' }),
};

// ─── Appeals ──────────────────────────────────────────────────────────────
export const appealApi = {
  list: (params?: { status?: string; page?: number; limit?: number }) =>
    api.get('/api/v1/member/appeals', { params }),

  get: (appeal_id: string) => api.get(`/api/v1/member/appeals/${appeal_id}`),

  submit: (formData: FormData) =>
    api.post('/api/v1/member/appeals', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

// ─── Notifications ────────────────────────────────────────────────────────
export const notifApi = {
  list:        (params?: { unread_only?: boolean; limit?: number }) =>
    api.get('/api/v1/member/notifications', { params }),
  markRead:    (id: string) => api.put(`/api/v1/member/notifications/${id}/read`),
  markAllRead: () => api.put('/api/v1/member/notifications/read-all'),
  prefs:       () => api.get('/api/v1/member/notification-preferences'),
  updatePrefs: (prefs: Record<string, boolean>) =>
    api.put('/api/v1/member/notification-preferences', prefs),
};

// ─── Profile ──────────────────────────────────────────────────────────────
export const profileApi = {
  get:    () => api.get('/api/v1/member/profile'),
  update: (data: Record<string, any>) => api.put('/api/v1/member/profile', data),
};

export default api;
