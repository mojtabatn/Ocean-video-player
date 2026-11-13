import { CloseIcon } from './icons';

export type PlaylistItem = { input: string; title: string };
export type RepeatMode = 'off' | 'all' | 'one';

type Props = {
  items: PlaylistItem[];
  index: number;
  repeat: RepeatMode;
  shuffle: boolean;
  onPlay: (i: number) => void;
  onRemove: (i: number) => void;
  onRepeat: (r: RepeatMode) => void;
  onShuffle: (s: boolean) => void;
  onAdd: () => void;
  onClear: () => void;
  onClose: () => void;
};

const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' };

export function Playlist(p: Props) {
  return (
    <aside className="playlist" onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <header className="playlist__head">
        <h2>Playlist</h2>
        <span className="playlist__count">{p.items.length}</span>
        <button className="dialog__close" aria-label="Close playlist" onClick={p.onClose}>
          <CloseIcon />
        </button>
      </header>
      <div className="playlist__tools">
        <button className={`chip ${p.shuffle ? 'is-on' : ''}`} onClick={() => p.onShuffle(!p.shuffle)}>Shuffle</button>
        <button className={`chip ${p.repeat !== 'off' ? 'is-on' : ''}`} onClick={() => p.onRepeat(NEXT_REPEAT[p.repeat])}>
          {p.repeat === 'one' ? 'Repeat one' : p.repeat === 'all' ? 'Repeat all' : 'Repeat off'}
        </button>
        <span className="playlist__spacer" />
        <button className="chip" onClick={p.onAdd}>Add</button>
        <button className="chip" onClick={p.onClear} disabled={!p.items.length}>Clear</button>
      </div>
      <ol className="playlist__list">
        {p.items.map((it, i) => (
          <li key={it.input + i} className={i === p.index ? 'is-current' : ''}>
            <button className="playlist__item" onClick={() => p.onPlay(i)} title={it.input}>
              <span className="playlist__num">{i === p.index ? '▶' : i + 1}</span>
              <span className="playlist__title" dir="auto">{it.title}</span>
            </button>
            <button className="playlist__remove" aria-label="Remove" onClick={() => p.onRemove(i)}>
              <CloseIcon width={8} height={8} />
            </button>
          </li>
        ))}
        {!p.items.length && <li className="playlist__empty">Drop files here or use Add.</li>}
      </ol>
    </aside>
  );
}
