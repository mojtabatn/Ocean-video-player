import { CloseIcon } from './icons';

export type NoticeKind = 'success' | 'warning' | 'error';
export type Notice = { id: number; kind: NoticeKind; title: string; text: string };

const COLORS: Record<NoticeKind, string> = { success: '#00df4c', warning: '#ffd21e', error: '#f04248' };

/** Glyph on a coloured disc, as in the Figma notification cards. */
function Glyph({ kind }: { kind: NoticeKind }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r="10" fill={COLORS[kind]} />
      {kind === 'success' && <path d="M5.6 10.4l3 3 5.8-6" fill="none" stroke="#303746" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
      {kind === 'error' && <path d="M6.6 6.6l6.8 6.8M13.4 6.6l-6.8 6.8" fill="none" stroke="#303746" strokeWidth="2" strokeLinecap="round" />}
      {kind === 'warning' && (
        <>
          <rect x="9" y="4.6" width="2" height="6.8" rx="1" fill="#303746" />
          <rect x="9" y="13" width="2" height="2.2" rx="1" fill="#303746" />
        </>
      )}
    </svg>
  );
}

/** Success / warning / error cards (Figma: "Property 1 = Succes / Warning / Error"), stacked top-right. */
export function Notices({ items, onClose }: { items: Notice[]; onClose: (id: number) => void }) {
  if (!items.length) return null;
  return (
    <div className="notices" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
      {items.map((n) => (
        <div key={n.id} className={`notice notice--${n.kind}`} role={n.kind === 'error' ? 'alert' : 'status'}>
          <span className="notice__icon">
            <Glyph kind={n.kind} />
          </span>
          <div className="notice__body">
            <div className="notice__title">{n.title}</div>
            <div className="notice__text" dir="auto" title={n.text}>{n.text}</div>
          </div>
          <button className="notice__close" aria-label="Close" onClick={() => onClose(n.id)}>
            <CloseIcon />
          </button>
        </div>
      ))}
    </div>
  );
}
