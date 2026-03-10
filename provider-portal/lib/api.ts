import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Request interceptor — attach JWT
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('pa_access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle auth errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('pa_access_token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (credentials: { username: string; password: string }) =>
    api.post('/auth/login', credentials),
  logout: () => api.post('/auth/logout'),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  me: () => api.get('/auth/me'),
  me: () => api.get('/auth/me'),
  refreshToken: () => api.post('/auth/refresh'),
};

// ─── Prior Authorization ──────────────────────────────────────────────────────
export const paApi = {
  // List all PAs for provider
  list: (params?: {
    status?: string; page?: number; limit?: number;
    search?: string; urgency?: string; date_from?: string; date_to?: string;
  }) => api.get('/api/v1/prior-authorizations', { params }),

  // Get single PA
  get: (pa_id: string) => api.get(`/api/v1/prior-authorizations/${pa_id}`),

  // Submit new PA
  submit: (data: FormData) =>
    api.post('/api/v1/prior-authorizations', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  // Get PA status history
  history: (pa_id: string) =>
    api.get(`/api/v1/prior-authorizations/${pa_id}/history`),

  // Download decision letter
  downloadLetter: (pa_id: string) =>
    api.get(`/api/v1/prior-authorizations/${pa_id}/letter`, {
      responseType: 'blob',
    }),

  // Cancel PA
  cancel: (pa_id: string, reason: string) =>
    api.post(`/api/v1/prior-authorizations/${pa_id}/cancel`, { reason }),

  // Request peer-to-peer
  requestP2P: (pa_id: string, data: { preferred_time: string; phone: string; notes: string }) =>
    api.post(`/api/v1/prior-authorizations/${pa_id}/peer-to-peer`, data),

  // Dashboard stats
  stats: () => api.get('/api/v1/prior-authorizations/stats'),
};

// ─── Member / Eligibility ─────────────────────────────────────────────────────
export const eligibilityApi = {
  verify: (data: { member_id: string; date_of_birth: string; last_name: string }) =>
    api.post('/api/v1/eligibility/verify', data),
};

// ─── Lookup / Reference Data ──────────────────────────────────────────────────
export const lookupApi = {
  searchICD10: (query: string) =>
    api.get('/api/v1/lookup/icd10', { params: { q: query } }),

  searchCPT: (query: string) =>
    api.get('/api/v1/lookup/cpt', { params: { q: query } }),

  searchNPI: (query: string) =>
    api.get('/api/v1/lookup/npi', { params: { q: query } }),

  getSpecialties: () => api.get('/api/v1/lookup/specialties'),

  getPlacesOfService: () => api.get('/api/v1/lookup/places-of-service'),
};

// ─── Appeals ─────────────────────────────────────────────────────────────────
export const appealsApi = {
  submit: (pa_id: string, data: FormData) =>
    api.post(`/api/v1/prior-authorizations/${pa_id}/appeals`, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  get: (pa_id: string) =>
    api.get(`/api/v1/prior-authorizations/${pa_id}/appeals`),
};

// ─── Documents ────────────────────────────────────────────────────────────────
export const documentApi = {
  upload: (file: File, pa_id: string, category: string) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('pa_id', pa_id);
    fd.append('category', category);
    return api.post('/api/v1/documents/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  delete: (doc_id: string) => api.delete(`/api/v1/documents/${doc_id}`),
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationApi = {
  list: (params?: { unread_only?: boolean; limit?: number }) =>
    api.get('/api/v1/notifications', { params }),
  markRead: (notification_id: string) =>
    api.put(`/api/v1/notifications/${notification_id}/read`),
  markAllRead: () => api.put('/api/v1/notifications/read-all'),
  delete: (notification_id: string) => api.delete(`/api/v1/notifications/${notification_id}`),
};

export default api;
