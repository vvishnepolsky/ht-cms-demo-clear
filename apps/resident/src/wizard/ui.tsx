import React from 'react';

/* =========================================================================
   Shared UI primitives + icon set
   ========================================================================= */

// Shared option/value shapes used by the form-input primitives below.
type SelectOption = string | { value: string; label: string };
interface ChoiceOption {
  value: string;
  label?: string;
  title?: string;
  desc?: React.ReactNode;
}
type YesNoValue = boolean | 'unsure' | null;

// ── Lucide-style icons (24px viewBox · 2px stroke · inherited color) ────
// `filled` flips a small set of icons (info, alert) into solid-disc style:
// a filled shape in currentColor with the inner glyph knocked out in white.
interface IconProps extends React.SVGProps<SVGSVGElement> {
  name: string;
  size?: number;
  filled?: boolean;
}
const Icon = ({ name, size = 16, filled = false, ...rest }: IconProps) => {
  // Filled variants — only the ones that benefit from a solid look.
  if (filled && name === 'info') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...rest}>
        <circle cx="12" cy="12" r="10" />
        <path
          d="M12 16v-4 M12 8h.01"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (filled && name === 'alert') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...rest}>
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <path
          d="M12 9v4 M12 17h.01"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (filled && name === 'check') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...rest}>
        <circle cx="12" cy="12" r="10" />
        <path
          d="M16 9.5L10.5 15 8 12.5"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  const paths: Record<string, string> = {
    chevronRight: 'M9 18l6-6-6-6',
    chevronLeft: 'M15 18l-6-6 6-6',
    chevronDown: 'M6 9l6 6 6-6',
    chevronUp: 'M18 15l-6-6-6 6',
    check: 'M20 6L9 17l-5-5',
    x: 'M18 6L6 18 M6 6l12 12',
    plus: 'M12 5v14M5 12h14',
    // Fixed: now includes the surrounding circle (was just floating strokes)
    info: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z M12 16v-4 M12 8h.01',
    alert:
      'M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
    lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
    home: 'M3 12l9-9 9 9 M5 10v10h14V10',
    user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 7a4 4 0 1 1 0 8 4 4 0 0 1 0-8',
    users:
      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 1 0 8 4 4 0 0 1 0-8 M22 21v-2a4 4 0 0 0-3-3.87 M17 3.13a4 4 0 0 1 0 7.75',
    briefcase:
      'M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
    file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6',
    shieldCheck: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4',
    heart:
      'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
    edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
    trash: 'M3 6h18 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M10 11v6 M14 11v6',
    save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8',
    arrowRight: 'M5 12h14 M12 5l7 7-7 7',
    arrowLeft: 'M19 12H5 M12 19l-7-7 7-7',
    calendar: 'M3 4h18v18H3z M16 2v4 M8 2v4 M3 10h18',
    mail: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6',
    phone:
      'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z',
    sparkles:
      'M12 2l1.7 4.7L18 8l-4.3 1.7L12 14l-1.7-4.7L6 8l4.3-1.3L12 2 M19 14l1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1L19 14 M5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14',
    download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
    eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    printer: 'M6 9V2h12v7 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 14h12v8H6z',
    map: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 7a3 3 0 1 1 0 6 3 3 0 0 1 0-6',
    helpCircle: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3 M12 17h.01',
    chartUp: 'M3 3v18h18 M7 14l4-4 4 4 6-6',
    upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
    paperclip:
      'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48',
  };
  const stroke = paths[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <path d={stroke} />
    </svg>
  );
};

// ── Button ──────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: string;
  size?: string;
}
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'outline', size, className = '', children, ...rest }, ref) => {
    const cls = ['btn', `btn--${variant}`, size && `size-${size}`, className].filter(Boolean).join(' ');
    return (
      <button ref={ref} className={cls} {...rest}>
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';

// ── Text input ──────────────────────────────────────────────────────────
interface FieldProps {
  label?: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}
function Field({ label, htmlFor, required, hint, error, children, className = '' }: FieldProps) {
  return (
    <div className={'field ' + className}>
      {label ? (
        <label className="field-label" htmlFor={htmlFor} style={{ padding: '0px 0px 12px', fontSize: '16px' }}>
          {label}
          {required && <span className="req">*</span>}
        </label>
      ) : null}
      {children}
      {hint ? (
        <div className="hint" style={{ padding: '5px 0px 0px' }}>
          {hint}
        </div>
      ) : null}
      {error ? <div className="err">{error}</div> : null}
    </div>
  );
}

interface TextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'prefix'> {
  value?: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}
function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = 'text',
  invalid,
  autoComplete,
  inputMode,
  maxLength,
  prefix,
  suffix,
  ...rest
}: TextInputProps) {
  if (prefix || suffix) {
    return (
      <div className="input" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}>
        {prefix ? (
          <span className="muted" style={{ fontSize: 14 }}>
            {prefix}
          </span>
        ) : null}
        <input
          id={id}
          type={type}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          maxLength={maxLength}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            height: '100%',
            fontSize: 14,
            fontFamily: 'inherit',
          }}
          {...rest}
        />

        {suffix ? (
          <span className="muted" style={{ fontSize: 14 }}>
            {suffix}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <input
      id={id}
      className={'input' + (invalid ? ' invalid' : '')}
      type={type}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete={autoComplete}
      inputMode={inputMode}
      maxLength={maxLength}
      {...rest}
    />
  );
}

interface TextareaProps {
  id?: string;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}
function Textarea({ id, value, onChange, placeholder, rows = 3 }: TextareaProps) {
  return (
    <textarea
      id={id}
      className="textarea"
      rows={rows}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

interface SelectProps {
  id?: string;
  value?: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  invalid?: boolean;
}
function Select({ id, value, onChange, options, placeholder = 'Select…', invalid }: SelectProps) {
  return (
    <select
      id={id}
      className={'input' + (invalid ? ' invalid' : '')}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="" disabled hidden>
        {placeholder}
      </option>
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value;
        const l = typeof o === 'string' ? o : o.label;
        return (
          <option key={v} value={v}>
            {l}
          </option>
        );
      })}
    </select>
  );
}

// ── Radio-card / checkbox-card groups ───────────────────────────────────
interface ChoiceCardProps {
  name?: string;
  value: string;
  current?: string | string[];
  onChange: (value: string | string[]) => void;
  title?: React.ReactNode;
  desc?: React.ReactNode;
  kind?: 'radio' | 'checkbox';
  cols?: number;
  children?: React.ReactNode;
}
function ChoiceCard({ name, value, current, onChange, title, desc, kind = 'radio', children }: ChoiceCardProps) {
  const selected = kind === 'checkbox' ? Array.isArray(current) && current.includes(value) : current === value;
  const handleClick = () => {
    if (kind === 'checkbox') {
      const next = new Set(Array.isArray(current) ? current : []);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      onChange(Array.from(next));
    } else {
      onChange(value);
    }
  };
  return (
    <label
      className={'choice' + (kind === 'checkbox' ? ' is-checkbox' : '') + (selected ? ' selected' : '')}
      onClick={(e) => {
        e.preventDefault();
        handleClick();
      }}
      style={{ justifyContent: 'center', padding: '24px 16px', height: '65px' }}
    >
      <span className="indicator" />
      <span className="label">
        {title ? (
          <span className="title" style={{ fontSize: '16px' }}>
            {title}
          </span>
        ) : null}
        {desc ? <span className="desc">{desc}</span> : null}
        {children}
      </span>
      <input type={kind} name={name} value={value} checked={selected} readOnly />
    </label>
  );
}

interface RadioGroupProps {
  name?: string;
  value?: string;
  onChange: (value: string | string[]) => void;
  options: ChoiceOption[];
  cols?: number;
}
function RadioGroup({ name, value, onChange, options, cols }: RadioGroupProps) {
  const colClass = cols === 2 ? 'cols-2' : cols === 3 ? 'cols-3' : '';
  return (
    <div className={'choice-list ' + colClass}>
      {options.map((o) => (
        <ChoiceCard
          key={o.value}
          name={name}
          value={o.value}
          current={value}
          onChange={onChange}
          title={o.title || o.label}
          desc={o.desc}
        />
      ))}
    </div>
  );
}

interface CheckboxGroupProps {
  name?: string;
  value?: string | string[];
  onChange: (value: string | string[]) => void;
  options: ChoiceOption[];
  cols?: number;
}
function CheckboxGroup({ name, value, onChange, options, cols }: CheckboxGroupProps) {
  const colClass = cols === 2 ? 'cols-2' : cols === 3 ? 'cols-3' : '';
  return (
    <div className={'choice-list ' + colClass}>
      {options.map((o) => (
        <ChoiceCard
          key={o.value}
          kind="checkbox"
          name={name}
          value={o.value}
          current={value}
          onChange={onChange}
          title={o.title || o.label}
          desc={o.desc}
        />
      ))}
    </div>
  );
}

// Yes / No / Unsure segmented control (mini, used in dense yes-or-no rows)
// Yes / No (/ Unsure) — distinct pill buttons, not a segmented control.
interface YesNoProps {
  value?: YesNoValue;
  onChange: (value: boolean | 'unsure') => void;
  withUnsure?: boolean;
  falseLabel?: string;
  trueLabel?: string;
}
function YesNo({ value, onChange, withUnsure = false, falseLabel = 'No', trueLabel = 'Yes' }: YesNoProps) {
  const set = (v: boolean | 'unsure') => onChange(v);
  const cls = (active: boolean) => 'yn-btn' + (active ? ' on' : '');
  return (
    <div className="yn-pair" role="radiogroup">
      <button type="button" className={cls(value === true)} onClick={() => set(true)}>
        {value === true ? <Icon name="check" size={14} /> : null}
        {trueLabel}
      </button>
      <button type="button" className={cls(value === false)} onClick={() => set(false)}>
        {value === false ? <Icon name="check" size={14} /> : null}
        {falseLabel}
      </button>
      {withUnsure ? (
        <button type="button" className={cls(value === 'unsure')} onClick={() => set('unsure')}>
          {value === 'unsure' ? <Icon name="check" size={14} /> : null}
          Unsure
        </button>
      ) : null}
    </div>
  );
}

// Inline yes/no question row
interface QuestionRowProps {
  q?: React.ReactNode;
  value?: YesNoValue;
  onChange: (value: boolean | 'unsure') => void;
  withUnsure?: boolean;
  hint?: React.ReactNode;
}
function QuestionRow({ q, value, onChange, withUnsure = false, hint }: QuestionRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
        padding: '14px 0',
        borderTop: '1px solid var(--civic-border-default)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ color: 'var(--civic-text-primary)', fontSize: '16px' }}>{q}</span>
        {hint ? <span style={{ fontSize: 12, color: 'var(--civic-text-secondary)', marginTop: 2 }}>{hint}</span> : null}
      </div>
      <YesNo value={value} onChange={onChange} withUnsure={withUnsure} />
    </div>
  );
}

// ── Alert ───────────────────────────────────────────────────────────────
interface AlertProps {
  kind?: 'info' | 'success' | 'warning' | 'destr' | 'neutral';
  title?: React.ReactNode;
  children?: React.ReactNode;
}
function Alert({ kind = 'info', title, children }: AlertProps) {
  const icon =
    kind === 'success'
      ? 'shieldCheck'
      : kind === 'warning'
        ? 'alert'
        : kind === 'destr'
          ? 'alert'
          : kind === 'neutral'
            ? 'info'
            : 'info';
  return (
    <div className={'alert ' + kind}>
      <Icon name={icon} size={20} />
      <div>
        {title ? <div className="t">{title}</div> : null}
        <div className="d">{children}</div>
      </div>
    </div>
  );
}

// ── Panel ───────────────────────────────────────────────────────────────
interface PanelProps {
  title?: React.ReactNode;
  action?: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}
function Panel({ title, action, subtitle, children, className = '' }: PanelProps) {
  return (
    <div className={'panel ' + className}>
      {title ? (
        <div className="panel-title">
          <span>{title}</span>
          {action}
        </div>
      ) : null}
      {subtitle ? (
        <div className="panel-sub" style={{ fontSize: '15px' }}>
          {subtitle}
        </div>
      ) : null}
      {children}
    </div>
  );
}

// ── Stack helper ────────────────────────────────────────────────────────
interface StackProps {
  gap?: number;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
function Stack({ gap = 16, children, style }: StackProps) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>{children}</div>;
}

// ── Avatar by initials ──────────────────────────────────────────────────
interface AvatarProps {
  name?: string;
  size?: number;
}
function Avatar({ name, size = 36 }: AvatarProps) {
  const initials =
    String(name || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join('') || '?';
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        borderRadius: 9999,
        background: 'var(--civic-accent-bg)',
        color: 'var(--civic-accent-text)',
        display: 'grid',
        placeContent: 'center',
        fontSize: size / 2.7,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}

// ── Money formatter ─────────────────────────────────────────────────────
const fmt$ = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

// ── Format date as readable e.g. "Mar 18, 2026" ─────────────────────────
function fmtDate(iso?: string) {
  if (!iso) return '—';
  // ENG-1989: date-only strings (YYYY-MM-DD) parse as UTC midnight, so local
  // formatting shifts them back a day in timezones behind UTC. Parse them at
  // local noon (same guard idiom as the admin app) so DOBs display as entered;
  // full ISO timestamps remain instants formatted in the viewer's local time.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Returns an error string if `iso` (YYYY-MM-DD) is out of the valid DOB range,
// null if valid. Pass allowFuture=true for unborn children (expected due date).
function validateDob(iso?: string, allowFuture = false): string | null {
  if (!iso) return null;
  const date = new Date(iso + 'T00:00:00');
  if (isNaN(date.getTime())) return 'Please enter a valid date.';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (!allowFuture && date > today) return 'Date of birth cannot be in the future.';
  const minDate = new Date(today);
  minDate.setFullYear(today.getFullYear() - 125);
  if (date < minDate) {
    const fmt = minDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    return `Date of birth must be on or after ${fmt}.`;
  }
  return null;
}

Object.assign(window, {
  Icon,
  Button,
  Field,
  TextInput,
  Textarea,
  Select,
  RadioGroup,
  CheckboxGroup,
  YesNo,
  QuestionRow,
  Alert,
  Panel,
  Stack,
  Avatar,
  ChoiceCard,
  fmt$,
  fmtDate,
  validateDob,
});
export {
  Icon,
  Button,
  Field,
  TextInput,
  Textarea,
  Select,
  RadioGroup,
  CheckboxGroup,
  YesNo,
  Alert,
  Stack,
  Panel,
  Avatar,
  ChoiceCard,
  QuestionRow,
  fmt$,
  fmtDate,
  validateDob,
};
