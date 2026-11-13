import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './icons';

export function Dialog({
  title,
  onClose,
  children,
  width = 420,
  modal = true,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  /** Non-modal dialogs float at the right so the video stays visible while adjusting. */
  modal?: boolean;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return createPortal(
    <div className={`dialog-layer ${modal ? 'dialog-layer--modal' : ''}`} onMouseDown={modal ? onClose : undefined}>
      <section
        className={`dialog ${modal ? '' : 'dialog--floating'}`}
        style={{ width }}
        role="dialog"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <header className="dialog__head">
          <h2 className="dialog__title">{title}</h2>
          <button className="dialog__close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        <div className="dialog__body">{children}</div>
        {footer && <footer className="dialog__foot">{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}

export function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    // A <div>, not a <label>: a label passes hover and clicks on its text to the control inside it, so
    // pointing at a description highlighted (and clicking it pressed) the row's button.
    <div className="row">
      <span className="row__label">
        {label}
        {hint && <span className="row__hint">{hint}</span>}
      </span>
      <span className="row__control">{children}</span>
    </div>
  );
}

export function Range({
  value, min, max, step, onChange, format,
}: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <span className="range">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--pct' as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {format && <span className="range__value">{format(value)}</span>}
    </span>
  );
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`toggle ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__knob" />
    </button>
  );
}

export function Select<T extends string | number>({
  value, options, onChange,
}: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <select
      className="select"
      value={String(value)}
      onChange={(e) => {
        const opt = options.find((o) => String(o.value) === e.target.value);
        if (opt) onChange(opt.value);
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Button({
  children, onClick, variant = 'secondary', disabled, type = 'button',
}: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost'; disabled?: boolean; type?: 'button' | 'submit' }) {
  return (
    <button type={type} className={`btn btn--${variant}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function Stepper({ value, onChange, step, format }: { value: number; onChange: (v: number) => void; step: number; format: (v: number) => string }) {
  return (
    <span className="stepper">
      <button type="button" onClick={() => onChange(Math.round((value - step) * 1000) / 1000)} aria-label="Decrease">−</button>
      <span className="stepper__value">{format(value)}</span>
      <button type="button" onClick={() => onChange(Math.round((value + step) * 1000) / 1000)} aria-label="Increase">+</button>
    </span>
  );
}
