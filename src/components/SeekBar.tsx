import { useEffect, useRef, useState } from 'react';
import type { Chapter } from '../../shared/media';
import { formatTime } from '../lib/format';
import { Slider } from './Slider';

type Props = {
  time: number;
  duration: number;
  buffered: number;
  chapters: Chapter[];
  abRepeat: { a?: number; b?: number };
  /** Downloaded parts of an online file, as [start, end] fractions. */
  cached?: [number, number][];
  thumbnail?: (t: number) => Promise<string | null>;
  onSeek: (t: number) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
};

/** Seek bar with hover preview (frame thumbnail + time + chapter) and A-B markers. */
export function SeekBar(p: Props) {
  const [hover, setHover] = useState<{ t: number; x: number } | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const cache = useRef(new Map<number, string | null>());
  const timer = useRef<number>();

  useEffect(() => {
    cache.current.clear();
    setThumb(null);
  }, [p.duration, p.thumbnail]);

  useEffect(() => {
    if (!hover || !p.thumbnail) return;
    // 2-second buckets keep ffmpeg calls down while scrubbing across the bar.
    const bucket = Math.floor(hover.t / 2) * 2;
    if (cache.current.has(bucket)) {
      setThumb(cache.current.get(bucket)!);
      return;
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const img = await p.thumbnail!(bucket);
      cache.current.set(bucket, img);
      setThumb(img);
    }, 60);
  }, [hover?.t, p.thumbnail]); // eslint-disable-line react-hooks/exhaustive-deps

  const chapter = hover ? [...p.chapters].reverse().find((c) => hover.t >= c.start) : undefined;
  const { a, b } = p.abRepeat;

  return (
    <div className="seekbar">
      <Slider
        className="controls__seek"
        label="Seek"
        value={p.time}
        max={p.duration}
        buffered={p.buffered}
        markers={p.chapters.length > 1 ? p.chapters.slice(1).map((c) => c.start) : undefined}
        onChange={p.onSeek}
        onScrubStart={p.onScrubStart}
        onScrubEnd={p.onScrubEnd}
        onHover={(t, x) => setHover(t === null ? null : { t, x })}
      />
      {p.cached?.map(([s, e], i) => (
        <div key={i} className="seekbar__cached" style={{ left: `${s * 100}%`, width: `${(e - s) * 100}%` }} />
      ))}
      {a !== undefined && p.duration > 0 && (
        <div
          className="seekbar__ab"
          style={{ left: `${(a / p.duration) * 100}%`, width: b !== undefined ? `${((b - a) / p.duration) * 100}%` : 2 }}
        />
      )}
      {hover && p.duration > 0 && (
        <div className="seekbar__preview" style={{ left: hover.x }}>
          {p.thumbnail && (
            <div className="seekbar__thumb">{thumb ? <img src={thumb} alt="" /> : null}</div>
          )}
          {chapter && <div className="seekbar__chapter" dir="auto">{chapter.title}</div>}
          <div className="seekbar__time">{formatTime(hover.t)}</div>
        </div>
      )}
    </div>
  );
}
