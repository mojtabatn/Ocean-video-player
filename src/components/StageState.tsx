import loadingArt from '../assets/states/loading.svg';
import missingArt from '../assets/states/error-loading.svg';
import formatArt from '../assets/states/format-error.svg';
import { ABOUT } from '../lib/about';
import { GITHUB_REPO } from '../../shared/app';
import { ocean } from '../lib/bridge';

export type StageKind = 'loading' | 'missing' | 'format';

/** Whether a failure message reads like a missing / unreachable file rather than an unreadable one. */
export const looksMissing = (message: string) =>
  /download server|no such file|not found|404|403|410|forbidden|connection|network|timed? ?out|refused|resolve|server returned|enoent|unable to connect|i\/o error|unreachable/i.test(message);

const GUIDE_URL = `https://github.com/${GITHUB_REPO}#why-ocean`;

/** Full-stage states shown while a file loads or when it cannot be opened (Figma: loading / error_loading / format_error). */
export function StageState({ kind, onRetry, detail }: { kind: StageKind; onRetry: () => void; detail?: string | null }) {
  // The technical reason, shown small under the message; "[file:<path>]" points to the saved server answer.
  const file = detail ? /\[file:(.+?)\]$/.exec(detail)?.[1] : undefined;
  const reason = detail?.replace(/\s*\[file:.+?\]$/, '');
  const why = kind !== 'loading' && reason ? (
    <p className="stage-state__detail" dir="auto">
      {reason}
      {file && (
        <>
          {' '}
          <button className="stage-state__detail-link" onClick={() => ocean?.showItemInFolder(file)}>
            Show details
          </button>
        </>
      )}
    </p>
  ) : null;
  return (
    <div className={`stage-state stage-state--${kind}`} role={kind === 'loading' ? 'status' : 'alert'} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <img className="stage-state__art" src={kind === 'loading' ? loadingArt : kind === 'missing' ? missingArt : formatArt} alt="" draggable={false} />
      {kind === 'loading' && (
        <>
          <p className="stage-state__text">It may take a few seconds to load the file</p>
          <div className="stage-state__bar" aria-hidden>
            <span />
          </div>
        </>
      )}
      {kind === 'missing' && (
        <>
          <p className="stage-state__text">Unfortunately, no file was found!</p>
          <div className="stage-state__actions">
            <button className="stage-state__link stage-state__link--warm" onClick={onRetry}>
              Try again
            </button>
            <i aria-hidden />
            <button className="stage-state__link" onClick={() => window.open(ABOUT.telegram)}>
              Support
            </button>
          </div>
          {why}
        </>
      )}
      {kind === 'format' && (
        <>
          <p className="stage-state__text">
            The desired file format cannot be read.
            <br />
            <button className="stage-state__link" onClick={() => window.open(GUIDE_URL)}>
              Guide to approved files
            </button>
          </p>
          {why}
        </>
      )}
    </div>
  );
}
