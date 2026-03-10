import React from 'react';
import { cn, fmt, trendColor, trendIcon } from '../../lib/utils';
import { Loader2, CheckCircle, AlertTriangle, XCircle, Info, X, TrendingUp, TrendingDown, Minus } from 'lucide-react';

// ─── Button ───────────────────────────────────────────────────────────────────
interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary'|'secondary'|'outline'|'ghost'|'danger'|'success';
  size?: 'xs'|'sm'|'md'|'lg';
  loading?: boolean; icon?: React.ReactNode; iconPos?: 'left'|'right';
}
export const Button: React.FC<BtnProps> = ({ variant='primary', size='md', loading, icon, iconPos='left', children, className, disabled, ...props }) => {
  const base = 'inline-flex items-center justify-center gap-1.5 font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed select-none';
  const variants = {
    primary:  'bg-primary-600 text-white hover:bg-primary-700 shadow-sm',
    secondary:'bg-primary-50 text-primary-700 hover:bg-primary-100',
    outline:  'border border-slate-200 text-slate-700 hover:bg-slate-50',
    ghost:    'text-slate-600 hover:bg-slate-100',
    danger:   'bg-red-600 text-white hover:bg-red-700 shadow-sm',
    success:  'bg-green-600 text-white hover:bg-green-700 shadow-sm',
  };
  const sizes = { xs:'px-2 py-1 text-xs', sm:'px-3 py-1.5 text-xs', md:'px-4 py-2 text-sm', lg:'px-5 py-2.5 text-sm' };
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} disabled={disabled||loading} {...props}>
      {loading && <Loader2 size={12} className="animate-spin" />}
      {!loading && icon && iconPos==='left' && icon}
      {children}
      {!loading && icon && iconPos==='right' && icon}
    </button>
  );
};

// ─── Card ─────────────────────────────────────────────────────────────────────
export const Card: React.FC<{
  title?: string; subtitle?: string; action?: React.ReactNode;
  children: React.ReactNode; className?: string; noPad?: boolean;
}> = ({ title, subtitle, action, children, className, noPad }) => (
  <div className={cn('card', className)}>
    {(title||action) && (
      <div className="card-header">
        <div>
          {title && <h3 className="text-sm font-bold text-slate-900">{title}</h3>}
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {action && <div>{action}</div>}
      </div>
    )}
    <div className={cn(!noPad && 'card-body')}>{children}</div>
  </div>
);

// ─── KPI Card ──────────────────────────────────────────────────────────────────
export const KPICard: React.FC<{
  label: string; value: string|number; icon: React.ReactNode;
  trend?: number; trendLabel?: string; higherBetter?: boolean;
  color?: string; onClick?: () => void; alert?: boolean;
}> = ({ label, value, icon, trend, trendLabel, higherBetter=true, color='text-primary-600 bg-primary-50', onClick, alert }) => {
  const tc = trend !== undefined ? trendColor(trend, higherBetter) : null;
  return (
    <div onClick={onClick} className={cn('kpi-card', onClick && 'cursor-pointer hover:shadow-md transition-shadow', alert && 'ring-2 ring-red-400')}>
      <div className="flex items-start justify-between">
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', color)}>{icon}</div>
        {trend !== undefined && (
          <span className={cn('kpi-trend text-xs', tc === 'up' ? 'text-green-600' : tc === 'down' ? 'text-red-600' : 'text-slate-400')}>
            {tc === 'up' ? <TrendingUp size={12} /> : tc === 'down' ? <TrendingDown size={12} /> : <Minus size={12} />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <div>
        <p className="kpi-value">{value}</p>
        <p className="kpi-label">{label}</p>
      </div>
      {trendLabel && <p className="text-xs text-slate-400">{trendLabel}</p>}
    </div>
  );
};

// ─── Alert ────────────────────────────────────────────────────────────────────
export const Alert: React.FC<{
  type: 'success'|'warning'|'error'|'info';
  title?: string; children: React.ReactNode;
  onClose?: () => void; className?: string;
}> = ({ type, title, children, onClose, className }) => {
  const cfg = {
    success: { cls:'alert-success', icon:<CheckCircle size={16} className="text-green-600 flex-shrink-0 mt-0.5" /> },
    warning: { cls:'alert-warning', icon:<AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" /> },
    error:   { cls:'alert-error',   icon:<XCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" /> },
    info:    { cls:'alert-info',    icon:<Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5" /> },
  }[type];
  return (
    <div className={cn('alert', cfg.cls, className)}>
      {cfg.icon}
      <div className="flex-1 text-xs">
        {title && <p className="font-bold mb-0.5">{title}</p>}
        <div>{children}</div>
      </div>
      {onClose && <button onClick={onClose} className="text-slate-400 hover:text-slate-600 flex-shrink-0"><X size={14} /></button>}
    </div>
  );
};

// ─── Badge ────────────────────────────────────────────────────────────────────
export const Badge: React.FC<{ children: React.ReactNode; color?: string; className?: string }> = ({ children, color='badge-gray', className }) => (
  <span className={cn('badge', color, className)}>{children}</span>
);

// ─── Modal ────────────────────────────────────────────────────────────────────
export const Modal: React.FC<{
  isOpen: boolean; onClose: () => void; title?: string;
  children: React.ReactNode; size?: 'sm'|'md'|'lg'|'xl';
  footer?: React.ReactNode;
}> = ({ isOpen, onClose, title, children, size='md', footer }) => {
  if (!isOpen) return null;
  const sizes = { sm:'max-w-sm', md:'max-w-lg', lg:'max-w-2xl', xl:'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={cn('relative bg-white rounded-xl shadow-2xl w-full flex flex-col max-h-[90vh] animate-fade-in', sizes[size])}>
        {title && (
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100 transition-colors"><X size={15} /></button>
          </div>
        )}
        <div className="overflow-y-auto flex-1 p-5">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl">{footer}</div>}
      </div>
    </div>
  );
};

// ─── Tabs ─────────────────────────────────────────────────────────────────────
export const Tabs: React.FC<{
  tabs: { id: string; label: string; icon?: React.ReactNode; count?: number }[];
  active: string; onChange: (id: string) => void; className?: string;
}> = ({ tabs, active, onChange, className }) => (
  <div className={cn('flex border-b border-slate-200', className)}>
    {tabs.map(t => (
      <button key={t.id} onClick={() => onChange(t.id)}
        className={cn('flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors -mb-px whitespace-nowrap',
          t.id===active ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
        )}>
        {t.icon}{t.label}
        {t.count !== undefined && (
          <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', t.id===active ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-500')}>
            {t.count}
          </span>
        )}
      </button>
    ))}
  </div>
);

// ─── Spinner ──────────────────────────────────────────────────────────────────
export const Spinner: React.FC<{ size?: number; className?: string }> = ({ size=20, className }) => (
  <div className={cn('flex justify-center items-center', className)}><Loader2 size={size} className="animate-spin text-primary-600" /></div>
);

// ─── Empty State ──────────────────────────────────────────────────────────────
export const EmptyState: React.FC<{
  icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
    {icon && <div className="text-slate-200 mb-3">{icon}</div>}
    <p className="text-sm font-bold text-slate-500">{title}</p>
    {description && <p className="text-xs text-slate-400 mt-1 max-w-xs">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

// ─── Gauge ────────────────────────────────────────────────────────────────────
export const GaugeChart: React.FC<{ value: number; max?: number; label?: string; color?: string }> = ({ value, max=100, label, color }) => {
  const pct = Math.min(100, (value / max) * 100);
  const angle = (pct / 100) * 180;
  const c = color || (pct >= 90 ? '#4CAF50' : pct >= 70 ? '#FF9800' : '#F44336');
  const r = 36; const cx = 50; const cy = 50;
  const toXY = (deg: number) => {
    const rad = (deg - 180) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const start = toXY(0); const end = toXY(angle);
  const large = angle > 90 ? 1 : 0;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 60" width="120" height="70">
        <path d={`M ${50-r} 50 A ${r} ${r} 0 0 1 ${50+r} 50`} fill="none" stroke="#e2e8f0" strokeWidth="8" strokeLinecap="round" />
        {pct > 0 && (
          <path d={`M ${50-r} 50 A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`} fill="none" stroke={c} strokeWidth="8" strokeLinecap="round" />
        )}
        <text x="50" y="48" textAnchor="middle" fontSize="13" fontWeight="700" fill="#1e293b">{value}%</text>
      </svg>
      {label && <p className="text-[10px] text-slate-500 font-medium -mt-1">{label}</p>}
    </div>
  );
};

// ─── Status Indicator ────────────────────────────────────────────────────────
export const StatusIndicator: React.FC<{ status: 'healthy'|'degraded'|'down'; label?: string }> = ({ status, label }) => {
  const cfg = { healthy:{cls:'bg-green-500',text:'Healthy'}, degraded:{cls:'bg-orange-400',text:'Degraded'}, down:{cls:'bg-red-500',text:'Down'} }[status];
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn('w-2 h-2 rounded-full', cfg.cls, status==='healthy' && 'animate-pulse2')} />
      <span className="text-xs font-semibold text-slate-700">{label||cfg.text}</span>
    </div>
  );
};
