import { useEffect, useState } from 'react';
import { ocean } from '../../lib/bridge';
import { Button, Dialog } from '../ui';

type Result = Awaited<ReturnType<NonNullable<typeof ocean>['searchSubtitles']>>[number];

type Props = {
  initialQuery: string;
  filePath?: string;
  apiKey: string;
  languages: string;
  onLoaded: (bytes: Uint8Array, label: string) => void;
  onOpenSettings: () => void;
  onClose: () => void;
};

export function SubtitleSearchDialog(p: Props) {
  const [query, setQuery] = useState(p.initialQuery);
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (!ocean) return;
    setBusy(true);
    setError(null);
    try {
      const r = await ocean.searchSubtitles(p.apiKey, { query, languages: p.languages, filePath: p.filePath });
      setResults(r.sort((a, b) => Number(b.hashMatch) - Number(a.hashMatch) || b.downloads - a.downloads));
    } catch (e: any) {
      setError(String(e?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (p.apiKey) search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!p.apiKey) {
    return (
      <Dialog title="Search Subtitles Online" width={440} onClose={p.onClose}>
        <p className="dialog__text">
          Online search uses OpenSubtitles.com. Create a free API key there, then paste it in Settings → Online subtitles.
        </p>
        <div className="dialog__actions">
          <Button variant="primary" onClick={p.onOpenSettings}>Open Settings</Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title="Search Subtitles Online" width={560} onClose={p.onClose}>
      <form
        className="search-row"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Movie or series name" />
        <Button variant="primary" type="submit" disabled={busy}>{busy ? 'Searching…' : 'Search'}</Button>
      </form>
      {error && <p className="dialog__error">{error}</p>}
      {results && results.length === 0 && !busy && <p className="dialog__text">No subtitles found.</p>}
      <ul className="results">
        {results?.map((r) => (
          <li key={r.fileId}>
            <button
              className="results__item"
              disabled={busy}
              onClick={async () => {
                if (!ocean) return;
                setBusy(true);
                try {
                  p.onLoaded(await ocean.downloadSubtitle(p.apiKey, r.fileId), r.release);
                  p.onClose();
                } catch (e: any) {
                  setError(String(e?.message ?? e));
                  setBusy(false);
                }
              }}
            >
              <span className="results__lang">{r.language?.toUpperCase()}</span>
              <span className="results__name" dir="auto">{r.release}</span>
              {r.hashMatch && <span className="results__badge">Exact match</span>}
              <span className="results__dl">{r.downloads.toLocaleString()} ↓</span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
