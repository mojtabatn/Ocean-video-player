import { useEffect, useState } from 'react';
import { ACTIONS, eventToKey, keysFor, prettyKey, type ActionId } from '../../lib/actions';
import { Button, Dialog } from '../ui';

type Props = { overrides: Record<string, string[]>; onChange: (o: Record<string, string[]>) => void; onClose: () => void };

export function ShortcutsDialog({ overrides, onChange, onClose }: Props) {
  const [recording, setRecording] = useState<ActionId | null>(null);

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setRecording(null);
        return;
      }
      const key = eventToKey(e);
      if (!key) return;
      // A key can belong to one action only: take it away from any other action.
      const next: Record<string, string[]> = {};
      for (const a of ACTIONS) {
        const keys = keysFor(a.id, overrides).filter((k) => k !== key);
        if (a.id === recording) next[a.id] = [key];
        else if (keys.length !== a.keys.length || keys.some((k, i) => k !== a.keys[i])) next[a.id] = keys;
        else if (overrides[a.id]) next[a.id] = keys;
      }
      onChange(next);
      setRecording(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, overrides, onChange]);

  const groups = [...new Set(ACTIONS.map((a) => a.group))];
  return (
    <Dialog
      title="Keyboard Shortcuts"
      width={520}
      onClose={onClose}
      footer={
        <>
          <span className="dialog__note">Click a shortcut to change it</span>
          <Button variant="ghost" onClick={() => onChange({})}>Restore defaults</Button>
        </>
      }
    >
      {groups.map((g) => (
        <div key={g}>
          <div className="section-title">{g}</div>
          {ACTIONS.filter((a) => a.group === g).map((a) => {
            const keys = keysFor(a.id, overrides);
            return (
              <div key={a.id} className="shortcut">
                <span className="shortcut__label">{a.label}</span>
                <button className={`shortcut__keys ${recording === a.id ? 'is-recording' : ''}`} onClick={() => setRecording(a.id)}>
                  {recording === a.id
                    ? 'Press a key…'
                    : keys.length
                      ? keys.map((k) => <kbd key={k}>{prettyKey(k)}</kbd>)
                      : <span className="shortcut__none">Not set</span>}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </Dialog>
  );
}
