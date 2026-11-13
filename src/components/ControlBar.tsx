import type { ReactNode } from 'react';
import type { Chapter } from '../../shared/media';
import { formatTime } from '../lib/format';
import { CaptionsIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, VolumeIcon, VolumeMutedIcon } from './controlIcons';
import { SeekBar } from './SeekBar';
import { Slider } from './Slider';

type Props = {
  disabled: boolean;
  playing: boolean;
  time: number;
  duration: number;
  buffered: number;
  chapters: Chapter[];
  abRepeat: { a?: number; b?: number };
  cached?: [number, number][];
  volume: number;
  /** Above 1 (boost) is reached with the wheel / arrow keys; the bar shows 100% full like the design. */
  maxVolume: number;
  muted: boolean;
  captionsOn: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  /** Extra controls for online titles (quality / season / episode). */
  extra?: ReactNode;
  thumbnail?: (t: number) => Promise<string | null>;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (t: number) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
  onVolume: (v: number) => void;
  onToggleMute: () => void;
  onCaptions: (e: React.MouseEvent) => void;
};

export function ControlBar(p: Props) {
  return (
    <footer className={`controls ${p.disabled ? 'is-disabled' : ''}`} onDoubleClick={(e) => e.stopPropagation()}>
      <button className="ctl" aria-label="Previous" disabled={!p.hasPrev} onClick={p.onPrev}>
        <PrevIcon />
      </button>
      <button className="ctl" aria-label={p.playing ? 'Pause' : 'Play'} onClick={p.onTogglePlay} disabled={p.disabled}>
        {p.playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button className="ctl" aria-label="Next" disabled={!p.hasNext} onClick={p.onNext}>
        <NextIcon />
      </button>

      <SeekBar
        time={p.time}
        duration={p.duration}
        buffered={p.buffered}
        chapters={p.chapters}
        abRepeat={p.abRepeat}
        cached={p.cached}
        thumbnail={p.thumbnail}
        onSeek={p.onSeek}
        onScrubStart={p.onScrubStart}
        onScrubEnd={p.onScrubEnd}
      />

      <div className="controls__time">
        {formatTime(p.time)}
        <span className="controls__sep">/</span>
        {formatTime(p.duration)}
      </div>

      {p.extra && <div className="controls__extra">{p.extra}</div>}

      <button className={`ctl controls__cc ${p.captionsOn ? 'is-on' : ''} ${p.extra ? 'controls__cc--tight' : ''}`} aria-label="Subtitles" aria-pressed={p.captionsOn} onClick={p.onCaptions}>
        <CaptionsIcon />
      </button>
      <button className="ctl ctl--volume" aria-label={p.muted ? 'Unmute' : 'Mute'} onClick={p.onToggleMute}>
        {p.muted || p.volume === 0 ? <VolumeMutedIcon /> : <VolumeIcon />}
      </button>
      <Slider
        className="controls__volume"
        label="Volume"
        thumb="hover"
        value={p.muted ? 0 : Math.min(1, p.volume)}
        max={1}
        onChange={p.onVolume}
      />
    </footer>
  );
}
