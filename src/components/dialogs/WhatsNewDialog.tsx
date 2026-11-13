import { useEffect, useState } from 'react';
import { ocean } from '../../lib/bridge';
import { Dialog } from '../ui';

/** Release notes of the running version, from its GitHub release. Lines starting with "-" or "*" become bullets. */
export function WhatsNewDialog({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<{ version: string; notes: string } | null>(null);
  useEffect(() => {
    ocean?.releaseNotes().then(setData);
  }, []);
  const lines = (data?.notes ?? '').split('\n');
  return (
    <Dialog title={`What’s new${data ? ` in ${data.version}` : ''}`} width={480} onClose={onClose}>
      {!data ? (
        <p className="dialog__text">Loading…</p>
      ) : !data.notes ? (
        <p className="dialog__text">No release notes were published for this version.</p>
      ) : (
        <div className="notes" dir="auto">
          {lines.map((l, i) => {
            const t = l.trim();
            if (!t) return <div key={i} className="notes__gap" />;
            if (/^#{1,6}\s/.test(t)) return <h3 key={i}>{t.replace(/^#{1,6}\s+/, '')}</h3>;
            if (/^[-*]\s/.test(t)) return <li key={i}>{t.slice(2)}</li>;
            return <p key={i}>{t}</p>;
          })}
        </div>
      )}
    </Dialog>
  );
}
