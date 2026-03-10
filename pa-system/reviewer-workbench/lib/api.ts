import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

const api = axios.create({ baseURL: API_URL, headers: { 'Content-Type': 'application/json' }, timeout: 30000 });

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('reviewer_access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('reviewer_access_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ─── Auth ──────────────────────────────────────────────────────────────────
export const authApi = {
  login:  (creds: { username: string; password: string }) => api.post('/auth/login', creds),
  logout: () => api.post('/auth/logout'),
  me:     () => api.get('/auth/me'),
};

// ─── Review Queue ──────────────────────────────────────────────────────────
export const queueApi = {
  list: (params?: {
    status?: string; urgency?: string; assigned_to?: string;
    ai_recommendation?: string; page?: number; limit?: number;
    sort_by?: string; sort_dir?: string;
  }) => api.get('/api/v1/review-queue', { params }),

  stats: () => api.get('/api/v1/review-queue/stats'),

  assign: (pa_id: string, reviewer_id: string) =>
    api.post(`/api/v1/review-queue/${pa_id}/assign`, { reviewer_id }),

  unassign: (pa_id: string) =>
    api.delete(`/api/v1/review-queue/${pa_id}/assign`),

  selfAssign: (pa_id: string) =>
    api.post(`/api/v1/review-queue/${pa_id}/self-assign`),
};

// ─── Case Review ──────────────────────────────────────────────────────────
export const reviewApi = {
  // Get full case details for review
  getCase: (pa_id: string) => api.get(`/api/v1/cases/${pa_id}/review`),

  // Get AI analysis
  getAIAnalysis: (pa_id: string) => api.get(`/api/v1/cases/${pa_id}/ai-analysis`),

  // Get applicable guidelines
  getGuidelines: (pa_id: string) => api.get(`/api/v1/cases/${pa_id}/guidelines`),

  // Save draft notes (auto-save)
  saveDraft: (pa_id: string, notes: string) =>
    api.put(`/api/v1/cases/${pa_id}/draft`, { notes }),

  // Submit decision
  submitDecision: (pa_id: string, decision: {
    decision: 'APPROVED' | 'DENIED' | 'PENDED';
    clinical_notes: string;
    // Approve fields
    approved_quantity?: number;
    approved_duration?: number;
    approved_duration_unit?: string;
    auth_start_date?: string;
    auth_end_date?: string;
    // Deny fields
    denial_reason?: string;
    denial_sub_reason?: string;
    alternative_treatment?: string;
    requires_md_review?: boolean;
    // Pend fields
    pend_reason?: string;
    pend_items?: string[];
  }) => api.post(`/api/v1/cases/${pa_id}/decision`, decision),

  // Request additional info
  requestInfo: (pa_id: string, items: string[]) =>
    api.post(`/api/v1/cases/${pa_id}/request-info`, { items }),

  // Get case history
  getHistory: (pa_id: string) => api.get(`/api/v1/cases/${pa_id}/history`),

  // Get documents
  getDocuments: (pa_id: string) => api.get(`/api/v1/cases/${pa_id}/documents`),

  // Add annotation / comment
  addAnnotation: (pa_id: string, text: string, type?: string) =>
    api.post(`/api/v1/cases/${pa_id}/annotations`, { text, type }),

  // MD co-sign
  coSign: (pa_id: string, notes: string) =>
    api.post(`/api/v1/cases/${pa_id}/co-sign`, { notes }),

  // Peer-to-peer response
  p2pResponse: (pa_id: string, outcome: string, notes: string) =>
    api.post(`/api/v1/cases/${pa_id}/p2p-response`, { outcome, notes }),
};

// ─── Metrics / Analytics ──────────────────────────────────────────────────
export const metricsApi = {
  reviewerStats: (reviewer_id?: string) =>
    api.get('/api/v1/metrics/reviewer', { params: { reviewer_id } }),
  queueMetrics: () => api.get('/api/v1/metrics/queue'),
  aiAccuracy: () => api.get('/api/v1/metrics/ai-accuracy'),
};

// ─── Notifications ────────────────────────────────────────────────────────
export const notifApi = {
  list:        (params?: { unread_only?: boolean; limit?: number }) => api.get('/api/v1/notifications', { params }),
  markRead:    (id: string) => api.put(`/api/v1/notifications/${id}/read`),
  markAllRead: () => api.put('/api/v1/notifications/read-all'),
};

export default api;
