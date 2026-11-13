import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type MenuEntry =
  | {
      type?: 'item';
      label: string;
      icon?: ReactNode;
      hint?: string;
      checked?: boolean;
      disabled?: boolean;
      /** Styled like the "Open New File" button in the design. */
      primary?: boolean;
      submenu?: MenuEntry[] | (() => MenuEntry[]);
      onSelect?: () => void;
      /** Keep the menu open after selecting (toggles, steppers). */
      keepOpen?: boolean;
      dir?: 'auto' | 'ltr' | 'rtl';
    }
  | { type: 'divider' }
  | { type: 'header'; label: string };

type PanelProps = {
  items: MenuEntry[];
  x: number;
  y: number;
  /** For submenus: the parent's left edge, used to flip to the left when there is no room on the right. */
  parentLeft?: number;
  onClose: () => void;
  /** Closes the whole menu tree (after an item is chosen). */
  onDismiss?: () => void;
  depth?: number;
  autoFocus?: boolean;
  /** Open upwards from `y` (menus anchored to the control bar). */
  above?: boolean;
};

const ROW = 32;

function Chevron() {
  return (
    <svg className="menu__chevron" width="6" height="10" viewBox="0 0 6 10" fill="none">
      <path d="M1.5 8L4.5 5L1.5 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Check() {
  return (
    <svg className="menu__check" width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MenuPanel({ items, x, y, parentLeft, onClose, onDismiss, depth = 0, autoFocus, above }: PanelProps) {
  const dismiss = onDismiss ?? onClose;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [open, setOpen] = useState<{ index: number; top: number; left: number; parentLeft: number } | null>(null);
  const [focus, setFocus] = useState(-1);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Keep the panel on screen: flip submenus left, shift up when near the bottom.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = x;
    let top = above ? y - r.height - 6 : y;
    if (left + r.width > window.innerWidth - 8) left = parentLeft !== undefined ? parentLeft - r.width - 6 : window.innerWidth - r.width - 8;
    if (top + r.height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - r.height - 8);
    setPos({ left: Math.max(8, left), top });
  }, [x, y, parentLeft, items, above]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const openSub = (i: number) => {
    const entry = items[i];
    const btn = rowRefs.current[i];
    if (!btn || !entry || entry.type === 'divider' || entry.type === 'header' || !entry.submenu || entry.disabled) {
      setOpen(null);
      return;
    }
    const r = btn.getBoundingClientRect();
    const panel = ref.current!.getBoundingClientRect();
    setOpen({ index: i, top: r.top + 6 - 10, left: panel.right + 6, parentLeft: panel.left });
  };

  const activate = (i: number) => {
    const entry = items[i];
    if (!entry || entry.type === 'divider' || entry.type === 'header' || entry.disabled) return;
    if (entry.submenu) {
      openSub(i);
      return;
    }
    entry.onSelect?.();
    if (!entry.keepOpen) dismiss();
  };

  const selectable = items.map((e, i) => (e.type === 'divider' || e.type === 'header' || e.disabled ? -1 : i)).filter((i) => i >= 0);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (open && e.key !== 'Escape') return; // child panel handles keys
    const at = selectable.indexOf(focus);
    switch (e.key) {
      case 'ArrowDown':
        setFocus(selectable[(at + 1) % selectable.length]);
        break;
      case 'ArrowUp':
        setFocus(selectable[(at - 1 + selectable.length) % selectable.length]);
        break;
      case 'ArrowRight':
        if (focus >= 0) openSub(focus);
        break;
      case 'ArrowLeft':
      case 'Escape':
        if (depth > 0 || e.key === 'Escape') onClose();
        break;
      case 'Enter':
      case ' ':
        activate(focus);
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  useEffect(() => {
    if (focus >= 0) rowRefs.current[focus]?.focus();
  }, [focus]);

  const sub = open ? items[open.index] : null;
  const subItems = sub && sub.type !== 'divider' && sub.type !== 'header' && sub.submenu ? (typeof sub.submenu === 'function' ? sub.submenu() : sub.submenu) : null;

  return (
    <>
      <div
        ref={ref}
        className={`menu ${depth > 0 ? 'menu--sub' : ''}`}
        style={{ left: pos.left, top: pos.top }}
        role="menu"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="menu__scroll" style={{ maxHeight: above ? y - 40 : `calc(100vh - ${Math.max(pos.top, 8) + 28}px)` }}>
          {items.map((entry, i) => {
            if (entry.type === 'divider') return <div key={i} className="menu__divider" role="separator" />;
            if (entry.type === 'header')
              return (
                <div key={i} className="menu__header" dir="auto">
                  {entry.label}
                </div>
              );
            const isOpen = open?.index === i;
            return (
              <button
                key={i}
                ref={(el) => (rowRefs.current[i] = el)}
                className={`menu__item ${entry.primary ? 'menu__item--primary' : ''} ${isOpen ? 'is-open' : ''} ${entry.checked ? 'is-checked' : ''}`}
                role="menuitem"
                aria-haspopup={!!entry.submenu}
                aria-checked={entry.checked}
                disabled={entry.disabled}
                tabIndex={-1}
                style={{ minHeight: entry.primary ? 36 : ROW }}
                onMouseEnter={() => {
                  setFocus(-1);
                  if (entry.submenu) openSub(i);
                  else setOpen(null);
                }}
                onClick={() => activate(i)}
              >
                {entry.icon && <span className="menu__icon">{entry.icon}</span>}
                <span className="menu__label" dir={entry.dir ?? 'auto'}>
                  {entry.label}
                </span>
                {entry.hint && <span className="menu__hint">{entry.hint}</span>}
                {entry.checked && <Check />}
                {entry.submenu && <Chevron />}
              </button>
            );
          })}
        </div>
      </div>
      {open && subItems && (
        <MenuPanel
          key={open.index}
          items={subItems}
          x={open.left}
          y={open.top}
          parentLeft={open.parentLeft}
          depth={depth + 1}
          onDismiss={dismiss}
          autoFocus
          onClose={() => {
            setOpen(null);
            ref.current?.focus();
          }}
        />
      )}
    </>
  );
}

/** Root menu with click-outside handling, rendered in a portal above everything. */
export function Menu({ items, x, y, onClose, above }: { items: MenuEntry[]; x: number; y: number; onClose: () => void; above?: boolean }) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [onClose]);

  return createPortal(
    <div className="menu-layer">
      <MenuPanel items={items} x={x} y={y} onClose={onClose} autoFocus above={above} />
    </div>,
    document.body,
  );
}
