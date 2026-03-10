import React from 'react';
import { cn } from '../../lib/utils';
import { Loader2, AlertCircle, CheckCircle, Info, XCircle, X, ChevronDown } from 'lucide-react';

// ─── Button ───────────────────────────────────────────────────────────────────
interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary'|'secondary'|'outline'|'ghost'|'danger'|'success'|'warning';
  size?: 'xs'|'sm'|'md'|'lg';
  loading?: boolean; icon?: React.ReactNode; iconPos?: 'left'|'right';
}
export const Button: React.FC<BtnProps> = ({ variant='primary', size='md', loading, icon, iconPos='left', children, className, disabled, ...props }) => {
  const base = 'inline-flex items-center justify-center font-semibold rounded-lg transition-all focus:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:cursor-not-allowed select-none';
  const variants = {
    primary:   'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 focus-visible:ring-primary-400 shadow-sm',
    secondary: 'bg-primary-50 text-primary-700 hover:bg-primary-100 focus-visible:ring-primary-400',
    outline:   'border border-slate-300 text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-400',
    ghost:     'text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-400',
    danger:    'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-400 shadow-sm',
    success:   'bg-green-600 text-white hover:bg-green-700 focus-visible:ring-green-400 shadow-sm',
    warning:   'bg-amber-500 text-white hover:bg-amber-600 focus-visible:ring-amber-400 shadow-sm',
  };
  const sizes = { xs:'text-xs px-2.5 py-1.5 gap-1', sm:'text-xs px-3 py-2 gap-1.5', md:'text-sm px-4 py-2.5 gap-2', lg:'text-sm px-5 py-3 gap-2' };
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} disabled={disabled||loading} {...props}>
      {loading ? <Loader2 size={size==='xs'?12:14} className="animate-spin" /> : icon && iconPos==='left' ? <span className="flex-shrink-0">{icon}</span> : null}
      {children}
      {!loading && icon && iconPos==='right' && <span className="flex-shrink-0">{icon}</span>}
    </button>
  );
};

// ─── Card ─────────────────────────────────────────────────────────────────────
export const Card: React.FC<{ title?: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; className?: string; noPad?: boolean; headerClass?: string; }> = ({ title, subtitle, action, children, className, noPad, headerClass }) => (
  <div className={cn('card', className)}>
    {(title||action) && (
      <div className={cn('card-header', headerClass)}>
        <div>
          {title && <p className="text-sm font-semibold text-slate-800">{title}</p>}
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
    )}
    <div className={cn(!noPad && 'card-body')}>{children}</div>
  </div>
);

// ─── Alert ────────────────────────────────────────────────────────────────────
export const Alert: React.FC<{ type:'info'|'success'|'warning'|'error'; title?: string; children: React.ReactNode; onClose?: ()=>void; className?: string; }> = ({ type, title, children, onClose, className }) => {
  const cfg = {
    info:    { bg:'bg-blue-50 border-blue-200',   txt:'text-blue-800',   icon:<Info size={15} className="text-blue-500" /> },
    success: { bg:'bg-green-50 border-green-200', txt:'text-green-800',  icon:<CheckCircle size={15} className="text-green-500" /> },
    warning: { bg:'bg-amber-50 border-amber-200', txt:'text-amber-800',  icon:<AlertCircle size={15} className="text-amber-500" /> },
    error:   { bg:'bg-red-50 border-red-200',     txt:'text-red-800',    icon:<XCircle size={15} className="text-red-500" /> },
  };
  const c = cfg[type];
  return (
    <div className={cn('flex gap-3 rounded-xl border p-3.5', c.bg, className)}>
      <div className="flex-shrink-0 mt-0.5">{c.icon}</div>
      <div className="flex-1 min-w-0">
        {title && <p className={cn('font-semibold text-xs mb-0.5 uppercase tracking-wide', c.txt)}>{title}</p>}
        <div className={cn('text-sm', c.txt)}>{children}</div>
      </div>
      {onClose && <button onClick={onClose} className="text-slate-400 hover:text-slate-600 flex-shrink-0"><X size={13} /></button>}
    </div>
  );
};

// ─── Badge ────────────────────────────────────────────────────────────────────
export const Badge: React.FC<{ children: React.ReactNode; color?: string; className?: string }> = ({ children, color='badge-gray', className }) => (
  <span className={cn('badge', color, className)}>{children}</span>
);

// ─── Modal ────────────────────────────────────────────────────────────────────
export const Modal: React.FC<{ isOpen: boolean; onClose: ()=>void; title?: string; children: React.ReactNode; size?: 'sm'|'md'|'lg'|'xl'; footer?: React.ReactNode; }> = ({ isOpen, onClose, title, children, size='md', footer }) => {
  if (!isOpen) return null;
  const sizes = { sm:'max-w-sm', md:'max-w-lg', lg:'max-w-2xl', xl:'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative bg-white rounded-2xl shadow-2xl w-full animate-slide-up', sizes[size])}>
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={17} /></button>
          </div>
        )}
        <div className="p-6 max-h-[75vh] overflow-y-auto">{children}</div>
        {footer && <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
};

// ─── Tabs ─────────────────────────────────────────────────────────────────────
export const Tabs: React.FC<{ tabs: { id: string; label: string; icon?: React.ReactNode; count?: number }[]; active: string; onChange: (id: string)=>void; className?: string; }> = ({ tabs, active, onChange, className }) => (
  <div className={cn('flex border-b border-slate-200', className)}>
    {tabs.map(t => (
      <button key={t.id} onClick={() => onChange(t.id)} className={cn('tab-btn', active===t.id ? 'active' : 'inactive')}>
        {t.icon}{t.label}
        {t.count !== undefined && (
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-bold', active===t.id ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-600')}>{t.count}</span>
        )}
      </button>
    ))}
  </div>
);

// ─── Spinner ──────────────────────────────────────────────────────────────────
export const Spinner: React.FC<{ size?: number; className?: string }> = ({ size=20, className }) => (
  <Loader2 size={size} className={cn('animate-spin text-primary-500', className)} />
);

// ─── Empty State ──────────────────────────────────────────────────────────────
export const EmptyState: React.FC<{ icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    {icon && <div className="text-slate-300 mb-4">{icon}</div>}
    <p className="text-sm font-semibold text-slate-600">{title}</p>
    {description && <p className="text-xs text-slate-400 mt-1 max-w-xs">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

// ─── AI Score Gauge (SVG) ─────────────────────────────────────────────────────
export const AIScoreGauge: React.FC<{ score: number; size?: number }> = ({ score, size = 80 }) => {
  const r = (size / 2) - 8;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 90 ? '#43A047' : pct >= 70 ? '#FFB300' : '#E53935';
  const label = pct >= 90 ? 'High' : pct >= 70 ? 'Medium' : 'Low';

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="7" />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth="7"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          className="ai-gauge-ring"
        />
        <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle" className="font-bold" style={{ fontSize: size * 0.2, fill: color, fontFamily: 'IBM Plex Mono' }}>
          {pct}%
        </text>
      </svg>
      <span className="text-xs font-semibold" style={{ color }}>{label} Confidence</span>
    </div>
  );
};

// ─── Criteria Item ────────────────────────────────────────────────────────────
export const CriteriaItem: React.FC<{ met: boolean | null; label: string; detail?: string }> = ({ met, label, detail }) => (
  <div className={cn('criteria-item', met === true ? 'met' : met === false ? 'unmet' : 'na')}>
    <div className="flex-shrink-0 mt-0.5">
      {met === true ? <CheckCircle size={13} className="text-green-600" /> :
       met === false ? <XCircle size={13} className="text-red-600" /> :
       <Info size={13} className="text-slate-400" />}
    </div>
    <div>
      <p className="text-xs font-semibold">{label}</p>
      {detail && <p className="text-xs opacity-80 mt-0.5">{detail}</p>}
    </div>
  </div>
);

// ─── Priority Bar ─────────────────────────────────────────────────────────────
export const PriorityBar: React.FC<{ score: number }> = ({ score }) => {
  const color = score >= 70 ? '#E53935' : score >= 40 ? '#FFB300' : '#43A047';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-xs font-bold tabular-nums" style={{ color }}>{score}</span>
    </div>
  );
};

// ─── Select ───────────────────────────────────────────────────────────────────
export const Select = React.forwardRef<HTMLSelectElement, { label?: string; error?: string; required?: boolean; options: { value: string; label: string }[]; placeholder?: string; className?: string; } & React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ label, error, required, options, placeholder, className, ...props }, ref) => (
    <div className="space-y-1">
      {label && <label className={cn('form-label', required && "after:content-['*'] after:text-red-500 after:ml-0.5")}>{label}</label>}
      <select ref={ref} className={cn('form-input bg-white cursor-pointer', error && 'error', className)} {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
);
Select.displayName = 'Select';

// ─── Textarea ─────────────────────────────────────────────────────────────────
export const Textarea = React.forwardRef<HTMLTextAreaElement, { label?: string; error?: string; hint?: string; charCount?: number; maxChars?: number; required?: boolean; } & React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ label, error, hint, charCount, maxChars, required, className, ...props }, ref) => (
    <div className="space-y-1">
      {label && (
        <div className="flex items-center justify-between">
          <label className={cn('form-label mb-0', required && "after:content-['*'] after:text-red-500 after:ml-0.5")}>{label}</label>
          {maxChars !== undefined && charCount !== undefined && (
            <span className={cn('text-xs', charCount > maxChars * 0.9 ? 'text-orange-500' : 'text-slate-400')}>{charCount}/{maxChars}</span>
          )}
        </div>
      )}
      <textarea ref={ref} className={cn('form-input resize-y min-h-[80px]', error && 'error', className)} {...props} />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  )
);
Textarea.displayName = 'Textarea';

// ─── Stat Card ────────────────────────────────────────────────────────────────
export const StatCard: React.FC<{ label: string; value: string|number; icon: React.ReactNode; color?: string; sub?: string; onClick?: ()=>void }> = ({ label, value, icon, color='bg-primary-50 text-primary-600', sub, onClick }) => (
  <div className={cn('card p-4', onClick && 'cursor-pointer hover:shadow-md transition-shadow')} onClick={onClick}>
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      <div className={cn('p-2.5 rounded-xl', color)}>{icon}</div>
    </div>
  </div>
);
