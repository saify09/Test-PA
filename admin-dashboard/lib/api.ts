import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

const api = axios.create({ baseURL: API_URL, headers: { 'Content-Type': 'application/json' }, timeout: 30000 });

api.interceptors.request.use(cfg => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('admin_access_token');
    if (token) cfg.headers.Authorization = `Bearer ${token}`;
  }
  return cfg;
});

api.interceptors.response.use(r => r, err => {
  if (err.response?.status === 401 && typeof window !== 'undefined') {
    localStorage.removeItem('admin_access_token');
    window.location.href = '/login';
  }
  return Promise.reject(err);
});

// ─── Auth ──────────────────────────────────────────────────────────────
export const authApi = {
  login:  (creds: { username: string; password: string }) => api.post('/auth/admin/login', creds),
  logout: () => api.post('/auth/logout'),
  me:     () => api.get('/auth/me'),
};

// ─── Analytics / KPIs ──────────────────────────────────────────────────
export const analyticsApi = {
  kpis:        (range?: string) => api.get('/api/v1/admin/analytics/kpis', { params: { range } }),
  volume:      (range?: string) => api.get('/api/v1/admin/analytics/volume', { params: { range } }),
  decisions:   (range?: string) => api.get('/api/v1/admin/analytics/decisions', { params: { range } }),
  tat:         (range?: string) => api.get('/api/v1/admin/analytics/tat', { params: { range } }),
  aiMetrics:   (range?: string) => api.get('/api/v1/admin/analytics/ai-metrics', { params: { range } }),
  byPayer:     (range?: string) => api.get('/api/v1/admin/analytics/by-payer', { params: { range } }),
  byService:   (range?: string) => api.get('/api/v1/admin/analytics/by-service', { params: { range } }),
  denialReasons:(range?: string) => api.get('/api/v1/admin/analytics/denial-reasons', { params: { range } }),
  reviewerPerf:(range?: string) => api.get('/api/v1/admin/analytics/reviewer-performance', { params: { range } }),
  slaCompliance:(range?: string) => api.get('/api/v1/admin/analytics/sla-compliance', { params: { range } }),
  appeals:     (range?: string) => api.get('/api/v1/admin/analytics/appeals', { params: { range } }),
  systemHealth:() => api.get('/api/v1/admin/system/health'),
};

// ─── User Management ───────────────────────────────────────────────────
export const userApi = {
  list:   (params?: { role?: string; status?: string; search?: string; page?: number; limit?: number }) =>
    api.get('/api/v1/admin/users', { params }),
  get:    (id: string) => api.get(`/api/v1/admin/users/${id}`),
  create: (data: any) => api.post('/api/v1/admin/users', data),
  update: (id: string, data: any) => api.put(`/api/v1/admin/users/${id}`, data),
  disable:(id: string) => api.put(`/api/v1/admin/users/${id}/disable`),
  enable: (id: string) => api.put(`/api/v1/admin/users/${id}/enable`),
  resetPw:(id: string) => api.post(`/api/v1/admin/users/${id}/reset-password`),
  roles:  () => api.get('/api/v1/admin/roles'),
  permissions: () => api.get('/api/v1/admin/permissions'),
};

// ─── Cases ─────────────────────────────────────────────────────────────
export const caseApi = {
  list: (params?: {
    status?: string; payer?: string; service_type?: string;
    urgency?: string; date_from?: string; date_to?: string;
    search?: string; page?: number; limit?: number;
    sort_by?: string; sort_dir?: string;
  }) => api.get('/api/v1/admin/cases', { params }),
  get:    (id: string) => api.get(`/api/v1/admin/cases/${id}`),
  export: (params?: any) => api.get('/api/v1/admin/cases/export', { params, responseType: 'blob' }),
  reassign:(id: string, reviewer_id: string) => api.put(`/api/v1/admin/cases/${id}/reassign`, { reviewer_id }),
  override:(id: string, decision: string, reason: string) =>
    api.post(`/api/v1/admin/cases/${id}/override`, { decision, reason }),
};

// ─── Audit Log ─────────────────────────────────────────────────────────
export const auditApi = {
  list: (params?: {
    user_id?: string; action?: string; resource?: string;
    date_from?: string; date_to?: string;
    page?: number; limit?: number;
  }) => api.get('/api/v1/admin/audit-log', { params }),
  export: (params?: any) => api.get('/api/v1/admin/audit-log/export', { params, responseType: 'blob' }),
};

// ─── System ────────────────────────────────────────────────────────────
export const systemApi = {
  health:    () => api.get('/api/v1/admin/system/health'),
  services:  () => api.get('/api/v1/admin/system/services'),
  incidents: () => api.get('/api/v1/admin/system/incidents'),
  config:    () => api.get('/api/v1/admin/system/config'),
  updateConfig:(key: string, value: any) => api.put(`/api/v1/admin/system/config/${key}`, { value }),
  aiModels:  () => api.get('/api/v1/admin/system/ai-models'),
  queues:    () => api.get('/api/v1/admin/system/queues'),
};

// ─── Notifications ─────────────────────────────────────────────────────
export const notifApi = {
  list:        (params?: any) => api.get('/api/v1/admin/notifications', { params }),
  markAllRead: () => api.put('/api/v1/admin/notifications/read-all'),
};

export default api;
