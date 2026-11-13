import type { UpdateState } from '../lib/updates';
import { CloseIcon } from './icons';

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
        <div className="update-toast__note">Downloaded. {info.assetName?.endsWith('.zip') ? 'Extract it to update.' : 'Starting the installer…'}</div>
      ) : (
        <button className="update-toast__link" onClick={u.install}>
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
