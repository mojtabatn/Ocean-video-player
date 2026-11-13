import type { UpdateState } from '../lib/updates';
import { CloseIcon } from './icons';

const DownloadIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M.43 9v.86c0 .45.18.89.5 1.21.32.32.76.5 1.21.5h7.72c.45 0 .89-.18 1.21-.5.32-.32.5-.76.5-1.21V9" />
    <path d="M3.43 5.14L6 8.14l2.57-3" />
    <path d="M6 8.14V.43" />
  </svg>
);

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(b > 1e8 ? 0 : 1)} MB`;

/** "Ocean vX is Available!" card (Figma: Update message), bottom-right over the video / home panel. */
export function UpdateToast({ u }: { u: UpdateState }) {
  const info = u.info;
  if (!info?.available || u.dismissed) return null;
  const p = u.progress;
  const downloading = !!p && !p.done && !p.error;
  const pct = p && p.total ? Math.min(100, Math.round((p.received / p.total) * 100)) : 0;

  return (
    <aside className="update-toast" role="status" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
      <div className="update-toast__title">Ocean v{info.latest} is Available!</div>
      {downloading ? (
        <div className="update-toast__progress" aria-label="Downloading">
          <div className="update-toast__bar">
            <span style={{ width: `${pct}%` }} />
          </div>
          <span>{p.total ? `${pct}% · ${mb(p.received)} / ${mb(p.total)}` : 'Starting…'}</span>
        </div>
      ) : p?.error ? (
        <div className="update-toast__error">
          {p.error} <button className="update-toast__link" onClick={u.install}>Retry</button>
        </div>
      ) : p?.done ? (
        <div className="update-toast__note">{info.assetName?.endsWith('.zip') ? 'Downloaded. Extract it to update.' : 'Updating… Ocean will restart by itself.'}</div>
      ) : (
        <button className="update-toast__link" onClick={u.install}>
          <DownloadIcon />
          Download &amp; Install
        </button>
      )}
      {!downloading && (
        <button className="update-toast__close" aria-label="Close" onClick={u.dismiss}>
          <CloseIcon />
        </button>
      )}
    </aside>
  );
}
