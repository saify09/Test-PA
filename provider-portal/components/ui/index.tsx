import React from 'react';
import { cn } from '../../lib/utils';
import { Loader2, AlertCircle, CheckCircle, Info, XCircle, X } from 'lucide-react';

// ─── Button ───────────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary', size = 'md', loading, icon, iconPosition = 'left',
  children, className, disabled, ...props
}) => {
  const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed select-none';

  const variants = {
    primary:   'bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700 focus-visible:ring-primary-400 shadow-sm',
    secondary: 'bg-primary-50 text-primary-700 hover:bg-primary-100 active:bg-primary-200 focus-visible:ring-primary-400',
    outline:   'border border-gray-300 text-gray-700 hover:bg-gray-50 active:bg-gray-100 focus-visible:ring-gray-400',
    ghost:     'text-gray-600 hover:bg-gray-100 active:bg-gray-200 focus-visible:ring-gray-400',
    danger:    'bg-red-500 text-white hover:bg-red-600 active:bg-red-700 focus-visible:ring-red-400 shadow-sm',
    success:   'bg-green-500 text-white hover:bg-green-600 active:bg-green-700 focus-visible:ring-green-400 shadow-sm',
  };

  const sizes = {
    xs: 'text-xs px-2.5 py-1.5 gap-1',
    sm: 'text-sm px-3 py-2 gap-1.5',
    md: 'text-sm px-4 py-2.5 gap-2',
    lg: 'text-base px-5 py-3 gap-2',
  };

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 className="animate-spin" size={size === 'xs' ? 12 : size === 'sm' ? 14 : 16} />
      ) : icon && iconPosition === 'left' ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
      {!loading && icon && iconPosition === 'right' ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
    </button>
  );
};

// ─── Badge ────────────────────────────────────────────────────────────────────
interface BadgeProps {
  children: React.ReactNode;
  color?: 'blue' | 'green' | 'red' | 'orange' | 'gray' | 'purple' | 'yellow';
  className?: string;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({ children, color = 'gray', className, dot }) => {
  const colors = {
    blue:   'bg-blue-100 text-blue-800',
    green:  'bg-green-100 text-green-800',
    red:    'bg-red-100 text-red-800',
    orange: 'bg-orange-100 text-orange-800',
    gray:   'bg-gray-100 text-gray-700',
    purple: 'bg-purple-100 text-purple-800',
    yellow: 'bg-yellow-100 text-yellow-800',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold', colors[color], className)}>
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full',
        color === 'green' ? 'bg-green-500' : color === 'red' ? 'bg-red-500' :
        color === 'orange' ? 'bg-orange-500' : color === 'blue' ? 'bg-blue-500' : 'bg-gray-400'
      )} />}
      {children}
    </span>
  );
};

// ─── Input ────────────────────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, required, icon, className, ...props }, ref) => (
    <div className="space-y-1">
      {label && (
        <label className={cn('form-label', required && 'required')}>
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={cn('form-input', error && 'error', icon && 'pl-9', className)}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={11} />{error}</p>}
      {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  )
);
Input.displayName = 'Input';

// ─── Select ───────────────────────────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  required?: boolean;
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, required, options, placeholder, className, ...props }, ref) => (
    <div className="space-y-1">
      {label && <label className={cn('form-label', required && 'required')}>{label}</label>}
      <select
        ref={ref}
        className={cn('form-input bg-white cursor-pointer', error && 'error', className)}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={11} />{error}</p>}
    </div>
  )
);
Select.displayName = 'Select';

// ─── Textarea ─────────────────────────────────────────────────────────────────
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  charCount?: number;
  maxChars?: number;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, required, charCount, maxChars, className, ...props }, ref) => (
    <div className="space-y-1">
      {label && (
        <div className="flex items-center justify-between">
          <label className={cn('form-label mb-0', required && 'required')}>{label}</label>
          {maxChars !== undefined && charCount !== undefined && (
            <span className={cn('text-xs', charCount > maxChars * 0.9 ? 'text-orange-500' : 'text-gray-400')}>
              {charCount}/{maxChars}
            </span>
          )}
        </div>
      )}
      <textarea
        ref={ref}
        className={cn('form-input resize-y min-h-[100px]', error && 'error', className)}
        {...props}
      />
      {error && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={11} />{error}</p>}
      {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  )
);
Textarea.displayName = 'Textarea';

// ─── Alert ────────────────────────────────────────────────────────────────────
interface AlertProps {
  type: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({ type, title, children, onClose, className }) => {
  const config = {
    info:    { bg: 'bg-blue-50 border-blue-200',  text: 'text-blue-800',  icon: <Info size={16} className="text-blue-500" /> },
    success: { bg: 'bg-green-50 border-green-200', text: 'text-green-800', icon: <CheckCircle size={16} className="text-green-500" /> },
    warning: { bg: 'bg-orange-50 border-orange-200', text: 'text-orange-800', icon: <AlertCircle size={16} className="text-orange-500" /> },
    error:   { bg: 'bg-red-50 border-red-200',    text: 'text-red-800',   icon: <XCircle size={16} className="text-red-500" /> },
  };
  const c = config[type];
  return (
    <div role={type === 'error' ? 'alert' : 'status'} aria-live={type === 'error' ? 'assertive' : 'polite'}
      className={cn('flex gap-3 rounded-lg border p-4', c.bg, className)}>
      <div className="flex-shrink-0 mt-0.5" aria-hidden="true">{c.icon}</div>
      <div className="flex-1 min-w-0">
        {title && <p className={cn('font-semibold text-sm mb-0.5', c.text)}>{title}</p>}
        <div className={cn('text-sm', c.text)}>{children}</div>
      </div>
      {onClose && (
        <button onClick={onClose} aria-label="Dismiss notification" className="flex-shrink-0 text-gray-400 hover:text-gray-600">
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

// ─── Loading Spinner ──────────────────────────────────────────────────────────
export const Spinner: React.FC<{ size?: number; className?: string }> = ({ size = 20, className }) => (
  <Loader2 size={size} aria-label="Loading" role="status" className={cn('animate-spin text-primary-500', className)} />
);

// ─── Empty State ──────────────────────────────────────────────────────────────
export const EmptyState: React.FC<{
  icon?: React.ReactNode; title: string; description?: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    {icon && <div className="text-gray-300 mb-4">{icon}</div>}
    <p className="text-base font-semibold text-gray-600">{title}</p>
    {description && <p className="text-sm text-gray-400 mt-1 max-w-xs">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

// ─── Card ─────────────────────────────────────────────────────────────────────
export const Card: React.FC<{
  title?: string; subtitle?: string; action?: React.ReactNode;
  children: React.ReactNode; className?: string; padding?: boolean;
}> = ({ title, subtitle, action, children, className, padding = true }) => (
  <div className={cn('bg-white rounded-xl border border-gray-100 shadow-sm', className)}>
    {(title || action) && (
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div>
          {title && <h3 className="text-sm font-semibold text-gray-900">{title}</h3>}
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {action && <div>{action}</div>}
      </div>
    )}
    <div className={cn(padding && 'p-6')}>{children}</div>
  </div>
);

// ─── Stat Card ────────────────────────────────────────────────────────────────
export const StatCard: React.FC<{
  label: string; value: string | number; icon: React.ReactNode;
  change?: string; changeDir?: 'up' | 'down'; color?: string;
  onClick?: () => void;
}> = ({ label, value, icon, change, changeDir, color = 'bg-primary-50 text-primary-600', onClick }) => (
  <div
    className={cn('card', onClick && 'cursor-pointer hover:shadow-md transition-shadow')}
    onClick={onClick}
  >
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        {change && (
          <p className={cn('text-xs mt-1 font-medium',
            changeDir === 'up' ? 'text-green-600' : 'text-red-600'
          )}>
            {changeDir === 'up' ? '↑' : '↓'} {change}
          </p>
        )}
      </div>
      <div className={cn('p-2.5 rounded-lg', color)}>{icon}</div>
    </div>
  </div>
);

// ─── Divider ──────────────────────────────────────────────────────────────────
export const Divider: React.FC<{ label?: string; className?: string }> = ({ label, className }) => (
  <div className={cn('flex items-center gap-3', className)}>
    <div className="flex-1 h-px bg-gray-200" />
    {label && <span className="text-xs text-gray-400 font-medium">{label}</span>}
    {label && <div className="flex-1 h-px bg-gray-200" />}
  </div>
);

// ─── Tooltip ─────────────────────────────────────────────────────────────────
export const Tooltip: React.FC<{ content: string; children: React.ReactNode }> = ({ content, children }) => (
  <div className="tooltip">
    {children}
    <span className="tooltip-text">{content}</span>
  </div>
);

// ─── Modal ────────────────────────────────────────────────────────────────────
export const Modal: React.FC<{
  isOpen: boolean; onClose: () => void; title?: string;
  children: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; footer?: React.ReactNode;
}> = ({ isOpen, onClose, title, children, size = 'md', footer }) => {
  if (!isOpen) return null;
  const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div role="dialog" aria-modal="true" aria-labelledby={title ? 'modal-title' : undefined}
      className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className={cn('relative bg-white rounded-2xl shadow-xl w-full', sizes[size], 'animate-fade-in')}>
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 id="modal-title" className="text-base font-semibold text-gray-900">{title}</h2>
            <button onClick={onClose} aria-label="Close dialog" className="text-gray-400 hover:text-gray-600 transition-colors">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Progress Steps ───────────────────────────────────────────────────────────
export const ProgressSteps: React.FC<{
  steps: string[]; currentStep: number;
}> = ({ steps, currentStep }) => (
  <nav aria-label="Form progress" className="flex items-center w-full mb-8">
    <ol className="flex items-center w-full list-none p-0 m-0">
    {steps.map((step, i) => (
      <React.Fragment key={i}>
        <li className="flex flex-col items-center gap-1 flex-shrink-0"
            aria-current={i === currentStep ? 'step' : undefined}>
          <div className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all',
            i < currentStep ? 'bg-primary-500 text-white' :
            i === currentStep ? 'bg-primary-500 text-white ring-4 ring-primary-100' :
            'bg-gray-200 text-gray-500'
          )}
            aria-label={`Step ${i+1}: ${step} — ${i < currentStep ? 'completed' : i === currentStep ? 'current' : 'upcoming'}`}
          >
            {i < currentStep ? <CheckCircle size={16} aria-hidden="true" /> : i + 1}
          </div>
          <span className={cn('text-xs font-medium hidden sm:block',
            i <= currentStep ? 'text-primary-700' : 'text-gray-400'
          )} aria-hidden="true">
            {step}
          </span>
        </li>
        {i < steps.length - 1 && (
          <div className={cn('flex-1 h-0.5 mx-1 -mt-4 sm:-mt-5 transition-all',
            i < currentStep ? 'bg-primary-500' : 'bg-gray-200'
          )} aria-hidden="true" />
        )}
      </React.Fragment>
    ))}
    </ol>
  </nav>
);

// ─── Tabs ─────────────────────────────────────────────────────────────────────
export const Tabs: React.FC<{
  tabs: { id: string; label: string; icon?: React.ReactNode; count?: number }[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}> = ({ tabs, activeTab, onChange, className }) => (
  <div className={cn('flex border-b border-gray-200', className)}>
    {tabs.map((tab) => (
      <button
        key={tab.id}
        onClick={() => onChange(tab.id)}
        className={cn(
          'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
          activeTab === tab.id
            ? 'border-primary-500 text-primary-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
        )}
      >
        {tab.icon}
        {tab.label}
        {tab.count !== undefined && (
          <span className={cn('ml-1 text-xs px-1.5 py-0.5 rounded-full font-semibold',
            activeTab === tab.id ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'
          )}>
            {tab.count}
          </span>
        )}
      </button>
    ))}
  </div>
);
