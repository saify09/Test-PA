import React from 'react';
import { cn } from '../../lib/utils';
import { CheckCircle, XCircle, AlertTriangle, Info, X, Loader2, ChevronRight } from 'lucide-react';

// ─── Button ───────────────────────────────────────────────────────────────────
interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  iconPos?: 'left' | 'right';
  fullWidth?: boolean;
}

export const Button: React.FC<BtnProps> = ({
  variant = 'primary', size = 'md', loading, icon, iconPos = 'left',
  fullWidth, children, className, disabled, ...props
}) => {
  const base = 'btn font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed select-none';
  const variants = {
    primary: 'btn-primary',
    outline: 'btn-outline',
    ghost:   'btn-ghost',
    danger:  'btn-danger',
    success: 'bg-green-600 text-white hover:bg-green-700 px-5 py-3 text-sm rounded-xl shadow-sm',
  };
  const sizes = {
    sm: '!px-3 !py-1.5 !text-xs !rounded-lg',
    md: '',
    lg: '!px-6 !py-4 !text-base !rounded-2xl',
  };
  return (
    <button
      className={cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {!loading && icon && iconPos === 'left' && icon}
      {children}
      {!loading && icon && iconPos === 'right' && icon}
    </button>
  );
};

// ─── Card ─────────────────────────────────────────────────────────────────────
export const Card: React.FC<{
  title?: string; subtitle?: string; action?: React.ReactNode;
  children: React.ReactNode; className?: string; noPad?: boolean;
}> = ({ title, subtitle, action, children, className, noPad }) => (
  <div className={cn('card', className)}>
    {(title || action) && (
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          {title && <h3 className="text-base font-bold text-gray-900">{title}</h3>}
          {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
    )}
    <div className={cn(!noPad && 'p-5')}>{children}</div>
  </div>
);

// ─── Alert ────────────────────────────────────────────────────────────────────
export const Alert: React.FC<{
  type: 'success' | 'warning' | 'error' | 'info';
  title?: string; children: React.ReactNode;
  onClose?: () => void; className?: string;
}> = ({ type, title, children, onClose, className }) => {
  const cfg = {
    success: { cls: 'alert-success', icon: <CheckCircle size={18} className="flex-shrink-0 mt-0.5 text-green-600" /> },
    warning: { cls: 'alert-warning', icon: <AlertTriangle size={18} className="flex-shrink-0 mt-0.5 text-amber-600" /> },
    error:   { cls: 'alert-error',   icon: <XCircle size={18} className="flex-shrink-0 mt-0.5 text-red-600" /> },
    info:    { cls: 'alert-info',    icon: <Info size={18} className="flex-shrink-0 mt-0.5 text-blue-600" /> },
  }[type];
  return (
    <div className={cn('alert', cfg.cls, className)}>
      {cfg.icon}
      <div className="flex-1 text-sm">
        {title && <p className="font-bold mb-0.5">{title}</p>}
        <div>{children}</div>
      </div>
      {onClose && <button onClick={onClose} className="flex-shrink-0 opacity-60 hover:opacity-100"><X size={15} /></button>}
    </div>
  );
};

// ─── Badge / Status ───────────────────────────────────────────────────────────
export const StatusBadge: React.FC<{ status: string; label: string }> = ({ status, label }) => {
  const cls: Record<string, string> = {
    SUBMITTED:    'bg-blue-100 text-blue-700',
    IN_REVIEW:    'bg-amber-100 text-amber-700',
    PENDING_INFO: 'bg-orange-100 text-orange-700',
    APPROVED:     'bg-green-100 text-green-700',
    DENIED:       'bg-red-100 text-red-700',
    CANCELLED:    'bg-gray-100 text-gray-600',
    APPEALING:    'bg-purple-100 text-purple-700',
    APPEAL_APPROVED: 'bg-green-100 text-green-700',
    APPEAL_DENIED:   'bg-red-100 text-red-700',
  };
  const dot: Record<string, string> = {
    SUBMITTED: 'bg-blue-400', IN_REVIEW: 'bg-amber-400', PENDING_INFO: 'bg-orange-400',
    APPROVED: 'bg-green-500', DENIED: 'bg-red-500', CANCELLED: 'bg-gray-400',
    APPEALING: 'bg-purple-500', APPEAL_APPROVED: 'bg-green-500', APPEAL_DENIED: 'bg-red-500',
  };
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-semibold', cls[status] || 'bg-gray-100 text-gray-600')}>
      <span className={cn('w-1.5 h-1.5 rounded-full', dot[status] || 'bg-gray-400')} />
      {label}
    </span>
  );
};

// ─── Spinner ──────────────────────────────────────────────────────────────────
export const Spinner: React.FC<{ size?: number; className?: string }> = ({ size = 22, className }) => (
  <div className={cn('flex items-center justify-center', className)}>
    <Loader2 size={size} className="animate-spin text-primary-600" />
  </div>
);

// ─── Empty State ──────────────────────────────────────────────────────────────
export const EmptyState: React.FC<{
  icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-14 text-center px-4">
    {icon && <div className="text-gray-200 mb-4">{icon}</div>}
    <p className="text-base font-bold text-gray-500">{title}</p>
    {description && <p className="text-sm text-gray-400 mt-1 max-w-xs">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

// ─── Progress Steps ────────────────────────────────────────────────────────────
export const ProgressSteps: React.FC<{
  steps: { label: string; sublabel?: string }[];
  current: number;
  className?: string;
}> = ({ steps, current, className }) => (
  <div className={cn('flex items-center gap-0', className)}>
    {steps.map((step, i) => (
      <React.Fragment key={i}>
        <div className="flex flex-col items-center">
          <div className={cn('step-dot', i < current ? 'complete' : i === current ? 'active' : 'pending')}>
            {i < current ? <CheckCircle size={14} /> : <span>{i + 1}</span>}
          </div>
          <div className="mt-1 text-center">
            <p className={cn('text-xs font-semibold', i === current ? 'text-primary-700' : i < current ? 'text-green-600' : 'text-gray-400')}>
              {step.label}
            </p>
            {step.sublabel && <p className="text-[10px] text-gray-400">{step.sublabel}</p>}
          </div>
        </div>
        {i < steps.length - 1 && (
          <div className={cn('flex-1 h-0.5 mt-[-12px] mx-1', i < current ? 'bg-green-400' : 'bg-gray-200')} />
        )}
      </React.Fragment>
    ))}
  </div>
);

// ─── Tabs ─────────────────────────────────────────────────────────────────────
export const Tabs: React.FC<{
  tabs: { id: string; label: string; icon?: React.ReactNode; count?: number }[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}> = ({ tabs, active, onChange, className }) => (
  <div className={cn('flex border-b border-gray-200', className)}>
    {tabs.map(t => (
      <button
        key={t.id}
        onClick={() => onChange(t.id)}
        className={cn(
          'flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors -mb-px',
          t.id === active
            ? 'border-primary-600 text-primary-700'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
        )}
      >
        {t.icon}
        {t.label}
        {t.count !== undefined && (
          <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-bold',
            t.id === active ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-500'
          )}>
            {t.count}
          </span>
        )}
      </button>
    ))}
  </div>
);

// ─── Modal ────────────────────────────────────────────────────────────────────
export const Modal: React.FC<{
  isOpen: boolean; onClose: () => void; title?: string;
  children: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: React.ReactNode;
}> = ({ isOpen, onClose, title, children, size = 'md', footer }) => {
  if (!isOpen) return null;
  const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative bg-white rounded-2xl shadow-2xl w-full animate-slide-up flex flex-col max-h-[90vh]', sizes[size])}>
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="overflow-y-auto flex-1 p-6">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
};

// ─── File Upload ──────────────────────────────────────────────────────────────
export const FileUploadZone: React.FC<{
  label: string; hint?: string; accept?: string;
  maxSizeMB?: number; files: File[]; onAdd: (files: File[]) => void;
  onRemove: (idx: number) => void; multiple?: boolean;
}> = ({ label, hint, accept = '.pdf,.jpg,.jpeg,.png', maxSizeMB = 25, files, onAdd, onRemove, multiple = true }) => {
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const valid = Array.from(incoming).filter(f => f.size <= maxSizeMB * 1024 * 1024);
    onAdd(valid);
  };

  return (
    <div>
      <label className="form-label">{label}</label>
      {hint && <p className="form-hint mb-2">{hint}</p>}
      <div
        className={cn('upload-zone', dragging && 'dragging')}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept={accept} multiple={multiple} className="hidden"
          onChange={e => handleFiles(e.target.files)} />
        <div className="flex flex-col items-center gap-1 pointer-events-none">
          <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center mb-1">
            <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-700">Drop files here or <span className="text-primary-600">browse</span></p>
          <p className="text-xs text-gray-400">PDF, JPG, PNG · Max {maxSizeMB}MB per file</p>
        </div>
      </div>
      {files.length > 0 && (
        <div className="mt-2 space-y-1">
          {files.map((f, i) => (
            <div key={i} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded bg-red-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-[9px] font-bold text-red-600">PDF</span>
                </div>
                <span className="text-sm text-gray-700 truncate">{f.name}</span>
                <span className="text-xs text-gray-400 flex-shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
              </div>
              <button onClick={() => onRemove(i)} className="text-gray-400 hover:text-red-500 ml-2 flex-shrink-0 transition-colors">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
