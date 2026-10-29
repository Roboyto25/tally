import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { SourceType } from '../lib/types';

// ---------- icons (stroke icons, 24px grid) ----------

const paths: Record<string, string> = {
  dashboard: 'M4 5h16M4 10h16M4 15h10M4 20h6',
  food: 'M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M16 21V3c2.5 1.5 3.5 4 3.5 7s-1.2 4-3.5 4',
  exercise: 'M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12',
  weight: 'M5 20h14l-1.5-11h-11zM9 9a3 3 0 0 1 6 0M12 13l1.5 2.5',
  progress: 'M4 20V10M10 20V4M16 20v-7M21 20H3',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.5-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-4L10.7 6a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7.6 7.6 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.5z',
  plus: 'M12 5v14M5 12h14',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  check: 'M5 12l5 5 9-10',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6',
  star: 'M12 4l2.4 5 5.6.6-4.2 3.8 1.2 5.6L12 16.3 7 19l1.2-5.6L4 9.6 9.6 9z',
  repeat: 'M17 3l3 3-3 3M4 12V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 12v3a3 3 0 0 1-3 3H4',
  offline: 'M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4-2.5M19 13a10 10 0 0 0-3-2M2 9.5a15 15 0 0 1 5-3M22 9.5a15 15 0 0 0-11-4',
};

export function Icon({ name, size = 22, title }: { name: keyof typeof paths | string; size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} focusable="false">
      {title && <title>{title}</title>}
      <path d={paths[name] ?? ''} />
    </svg>
  );
}

// ---------- layout bits ----------

export function Section({ title, action, children, id }: { title?: ReactNode; action?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="section" aria-labelledby={title && id ? id : undefined}>
      {(title || action) && (
        <div className="section-head">
          {title && <h2 id={id}>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

/** Progress bar with the value written out, so meaning never depends on color. */
export function Meter({ value, max, label, tone = 'ink', detail }: { value: number; max: number; label: string; tone?: string; detail?: ReactNode }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const over = max > 0 && value > max;
  return (
    <div className={`meter tone-${tone}${over ? ' over' : ''}`}>
      <div className="meter-text">
        <span className="meter-label">{label}</span>
        <span className="meter-value">{detail}</span>
      </div>
      <div className="meter-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(value)} aria-valuetext={over ? `${Math.round(value)} of ${Math.round(max)}, over target` : `${Math.round(value)} of ${Math.round(max)}`}>
        <div className="meter-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function SourceBadge({ source, estimated }: { source: SourceType | 'mixed'; estimated?: boolean }) {
  const label: Record<string, string> = { database: 'Database', custom: 'Saved food', user: 'Entered by you', ai: 'ChatGPT estimate', mixed: 'Mixed sources' };
  return (
    <span className={`badge badge-${source}`}>
      {label[source]}
      {estimated && source !== 'ai' ? ', estimated' : ''}
    </span>
  );
}

// ---------- form fields ----------

export function Field({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <p className="hint">{hint}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Numeric input that keeps the user's text while typing and reports a parsed number.
 * Rejects negatives and non-numbers rather than silently clamping.
 */
export function NumberInput({ value, onChange, min = 0, max, step = 'any', id, label, required, placeholder, className, suffix }: {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: string | number;
  id?: string;
  label?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
  suffix?: string;
}) {
  const [text, setText] = useState(value === null || value === undefined || Number.isNaN(value) ? '' : String(roundForInput(value)));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      setText(value === null || Number.isNaN(value) ? '' : String(roundForInput(value)));
      last.current = value;
    }
  }, [value]);
  const n = text.trim() === '' ? null : Number(text);
  const invalid = (n !== null && (!Number.isFinite(n) || n < min || (max !== undefined && n > max))) || (required && n === null);
  return (
    <span className={`num-wrap ${className ?? ''}`}>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        aria-label={label}
        aria-invalid={invalid || undefined}
        placeholder={placeholder}
        value={text}
        step={step}
        onChange={(e) => {
          const t = e.target.value.replace(',', '.');
          if (!/^\d*\.?\d*$/.test(t)) return; // digits and one decimal point only; no negatives
          setText(t);
          const v = t === '' || t === '.' ? null : Number(t);
          const ok = v === null || (Number.isFinite(v) && v >= min && (max === undefined || v <= max));
          last.current = ok ? v : null;
          onChange(ok ? v : null);
        }}
      />
      {suffix && <span className="num-suffix">{suffix}</span>}
    </span>
  );
}

function roundForInput(v: number): number {
  return Math.round(v * 10) / 10;
}

// ---------- dialog ----------

export function Dialog({ title, children, onClose, actions }: { title: string; children: ReactNode; onClose: () => void; actions?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')].filter((el) => !el.hasAttribute('disabled'));
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={id} ref={ref}>
        <h2 id={id}>{title}</h2>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>
  );
}

export function Confirm({ title, message, confirmLabel, danger, onConfirm, onCancel }: { title: string; message: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      actions={
        <>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {message}
    </Dialog>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
