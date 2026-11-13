import type { MediaInfo, OpenResult, PlayMode, PlayPlan } from '../../shared/media';
import { ocean } from '../lib/bridge';
import { AudioGraph } from './audioGraph';
import type { Cue } from '../lib/subtitles';

export type PlayerSnapshot = {
  input: string | null;
  title: string;
  info: MediaInfo | null;
  plan: PlayPlan | null;
  mode: PlayMode | null;
  loading: boolean;
  error: string | null;
  playing: boolean;
  time: number;
  duration: number;
  bufferedEnd: number;
  volume: number;
  muted: boolean;
  rate: number;
  audioIndex: number;
  audioDelay: number;
  burnSubtitle: number | null;
  ended: boolean;
  videoWidth: number;
  videoHeight: number;
  /** Bumped whenever live subtitle cues arrive (online files). */
  cueVersion: number;
};

const initial: PlayerSnapshot = {
  input: null, title: '', info: null, plan: null, mode: null, loading: false, error: null,
  playing: false, time: 0, duration: 0, bufferedEnd: 0, volume: 1, muted: false, rate: 1,
  audioIndex: 0, audioDelay: 0, burnSubtitle: null, ended: false, videoWidth: 0, videoHeight: 0, cueVersion: 0,
};

/**
 * Wraps one <video> element and hides how media reaches it:
 *  - direct: the file is streamed as-is (ocean-media://)
 *  - remux/transcode: ffmpeg produces fragmented MP4 starting at `offset` (ocean-stream://);
 *    seeking outside the buffered window restarts ffmpeg, so media time = offset + video.currentTime.
 */
export class Player {
  readonly video: HTMLVideoElement;
  private audio: AudioGraph | null = null;
  private sessionId: string | null = null;
  offset = 0;
  private snap: PlayerSnapshot = { ...initial };
  private listeners = new Set<() => void>();
  private loadToken = 0;
  private wantPlay = true;
  private restartTimer: number | undefined;
  private restartSeq = 0;
  /** Live-extracted subtitle cues per embedded track, keyed by start time (deduplicated across restarts by start time + text). */
  private liveCues = new Map<number, Map<string, Cue>>();

  constructor() {
    const v = document.createElement('video');
    v.className = 'stage__video';
    v.crossOrigin = 'anonymous'; // keeps Web Audio un-tainted for our custom protocols
    v.preload = 'auto';
    v.playsInline = true;
    this.video = v;
    ocean?.onLiveCues((sessionId, track, cues) => {
      if (sessionId !== this.sessionId) return;
      let m = this.liveCues.get(track);
      if (!m) this.liveCues.set(track, (m = new Map()));
      for (const c of cues) m.set(`${Math.round(c.start * 1000)}|${c.text}`, c);
      this.set({ cueVersion: this.snap.cueVersion + 1 });
    });

    const on = (ev: string, fn: () => void) => v.addEventListener(ev, fn);
    // 'timeupdate' fires only ~4×/s, which delayed subtitles by up to 250 ms; while playing, refresh the clock every 80 ms.
    let tick: number | undefined;
    const startTick = () => {
      window.clearInterval(tick);
      tick = window.setInterval(() => !v.paused && this.set({ time: this.time }), 80);
    };
    on('play', () => {
      this.set({ playing: true, ended: false });
      startTick();
    });
    on('pause', () => {
      window.clearInterval(tick);
      this.set({ playing: false, time: this.time });
    });
    on('timeupdate', () => this.set({ time: this.time }));
    on('seeked', () => this.set({ time: this.time }));
    on('ratechange', () => this.set({ rate: v.playbackRate }));
    on('progress', () => {
      const b = v.buffered;
      if (b.length) this.set({ bufferedEnd: this.offset + b.end(b.length - 1) });
    });
    on('durationchange', () => {
      if (this.snap.mode === 'direct' && Number.isFinite(v.duration)) this.set({ duration: v.duration });
    });
    on('loadeddata', () => this.set({ loading: false }));
    on('canplay', () => this.video.paused && this.set({ loading: false }));
    on('waiting', () => this.set({ loading: true }));
    on('playing', () => this.set({ loading: false }));
    on('ended', () => this.set({ ended: true, playing: false }));
    on('error', () => this.onVideoError());
    on('resize', () => this.set({ videoWidth: v.videoWidth, videoHeight: v.videoHeight }));
    on('loadedmetadata', () => this.set({ videoWidth: v.videoWidth, videoHeight: v.videoHeight }));
  }

  // ---------- subscription (useSyncExternalStore) ----------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;
  private set(patch: Partial<PlayerSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }

  /** Media time in seconds, independent of how the media is delivered. */
  get time() {
    return this.offset + (this.video.currentTime || 0);
  }

  get session() {
    return this.sessionId;
  }

  private ensureAudio() {
    if (!this.audio) {
      try {
        this.audio = new AudioGraph(this.video);
        this.audio.setVolume(this.snap.muted ? 0 : this.snap.volume);
      } catch {
        this.audio = null;
      }
    }
    return this.audio;
  }

  get audioGraph() {
    return this.ensureAudio();
  }

  // ---------- loading ----------
  async load(input: string, opts: { title?: string; startAt?: number; autoplay?: boolean; audioLanguage?: string } = {}) {
    const token = ++this.loadToken;
    this.wantPlay = opts.autoplay ?? true;
    if (this.sessionId) ocean?.closeMedia(this.sessionId);
    this.sessionId = null;
    this.video.removeAttribute('src');
    this.video.load();
    this.offset = 0;
    this.liveCues.clear();
    this.set({
      ...initial,
      volume: this.snap.volume, muted: this.snap.muted, rate: this.snap.rate,
      input, title: opts.title ?? titleFromInput(input), loading: true,
    });
    this.ensureAudio();

    if (!ocean) {
      // Plain-browser preview: only direct playback is possible.
      this.setDirect(input);
      return;
    }
    const res: OpenResult = await ocean.openMedia(input);
    if (token !== this.loadToken) return;
    if (!res.ok) {
      this.set({ loading: false, error: res.error });
      return;
    }
    this.sessionId = res.sessionId;
    const preferred = opts.audioLanguage ? res.info.audio.findIndex((a) => languageMatches(a.language, opts.audioLanguage!)) : -1;
    const def = preferred >= 0 ? preferred : res.info.audio.findIndex((a) => a.isDefault);
    this.set({
      info: res.info,
      plan: res.plan,
      mode: res.plan.mode,
      duration: res.info.duration,
      audioIndex: def >= 0 ? def : 0,
    });
    await this.start(opts.startAt ?? 0);
  }

  private setDirect(input: string) {
    this.video.src = /^[a-z]+:\/\//i.test(input) ? input : `ocean-media://local/${encodeURIComponent(input)}`;
    this.applyRate();
    if (this.wantPlay) this.video.play().catch(() => {});
  }

  private async start(at: number) {
    const { mode } = this.snap;
    if (!mode || !this.snap.input) return;
    if (mode === 'direct') {
      this.offset = 0;
      this.setDirect(this.snap.input);
      if (at > 0) this.video.currentTime = at;
      return;
    }
    await this.restartStream(at);
  }

  /**
   * (Re)starts the ffmpeg stream at `at`. Stream copy can only begin on a keyframe, so we ask where ffmpeg
   * will really land; when seeking forward and that is behind `minStart`, we step to a later keyframe
   * so that "+5 s" never jumps backwards on files with long GOPs.
   */
  private async restartStream(at: number, minStart = 0) {
    if (!this.sessionId || !ocean) return;
    const token = this.loadToken;
    const restartId = ++this.restartSeq;
    const mode = this.snap.mode === 'transcode' || this.snap.burnSubtitle !== null ? 'transcode' : 'remux';
    this.set({ loading: true, time: at });
    let start = at;
    if (mode === 'remux' && at > 0) {
      start = await ocean.keyframeBefore(this.sessionId, at);
      for (let probe = at + 2; start < minStart && probe < at + 14 && probe < this.snap.duration; probe += 2) {
        start = Math.max(start, await ocean.keyframeBefore(this.sessionId, probe));
      }
    }
    if (token !== this.loadToken || restartId !== this.restartSeq) return;
    this.offset = start;
    const q = new URLSearchParams({
      t: start.toFixed(3),
      a: String(this.snap.audioIndex),
      d: String(Math.min(0, this.snap.audioDelay)),
      m: mode,
      b: this.snap.burnSubtitle === null ? '' : String(this.snap.burnSubtitle),
      n: String(Date.now()),
    });
    this.set({ time: start, bufferedEnd: start });
    this.video.src = `ocean-stream://s/${this.sessionId}?${q}`;
    this.applyRate();
    if (this.wantPlay) this.video.play().catch(() => {});
  }

  private applyRate() {
    this.video.playbackRate = this.snap.rate;
    this.video.defaultPlaybackRate = this.snap.rate;
  }

  private onVideoError() {
    const err = this.video.error;
    if (!err || !this.snap.input) return;
    // Direct playback failed (unexpected codec): fall back to ffmpeg.
    if (this.snap.mode === 'direct' && this.sessionId) {
      this.set({ mode: 'remux', plan: { mode: 'remux', reason: 'Native playback failed; repackaged with FFmpeg' } });
      this.restartStream(this.time);
      return;
    }
    if (this.snap.mode === 'remux' && this.sessionId) {
      this.set({ mode: 'transcode', plan: { mode: 'transcode', reason: 'Repackaging failed; converting with FFmpeg' } });
      this.restartStream(this.time);
      return;
    }
    this.set({ loading: false, playing: false, error: 'This file could not be played.' });
  }

  // ---------- transport ----------
  play() {
    this.wantPlay = true;
    if (this.snap.ended) this.seek(0);
    this.video.play().catch(() => {});
  }
  pause() {
    this.wantPlay = false;
    this.video.pause();
  }
  toggle() {
    if (this.video.paused) this.play();
    else this.pause();
  }

  seek(t: number) {
    const dur = this.snap.duration || Infinity;
    t = Math.max(0, Math.min(dur - 0.05, t));
    const from = this.time;
    this.set({ time: t, ended: false });
    if (this.snap.mode === 'direct' || !this.sessionId) {
      this.video.currentTime = t;
      return;
    }
    // ffmpeg streams are not byte-seekable (Chromium would refetch from the start), so every seek
    // restarts ffmpeg. Debounced so dragging the seek bar does not spawn a process per pixel.
    window.clearTimeout(this.restartTimer);
    this.restartTimer = window.setTimeout(() => this.restartStream(t, t > from + 0.5 ? from + 0.5 : 0), 120);
  }

  seekBy(delta: number) {
    this.seek(this.snap.time + delta);
  }

  frameStep(dir: 1 | -1) {
    this.pause();
    const fps = this.snap.info?.video?.fps || 25;
    if (this.snap.mode !== 'direct' && dir === 1) {
      // Forward steps inside an ffmpeg stream: let the decoder advance one frame by playing briefly.
      const target = this.video.currentTime + 1 / fps;
      const onFrame = () => {
        if (this.video.currentTime >= target - 0.001) {
          this.video.pause();
          return;
        }
        (this.video as any).requestVideoFrameCallback?.(onFrame);
      };
      (this.video as any).requestVideoFrameCallback?.(onFrame);
      this.video.play().catch(() => {});
      return;
    }
    this.seek(this.snap.time + dir / fps);
  }

  setRate(rate: number) {
    rate = Math.round(Math.max(0.25, Math.min(4, rate)) * 100) / 100;
    this.set({ rate });
    this.applyRate();
  }

  setVolume(v: number) {
    v = Math.max(0, Math.min(2, v));
    this.set({ volume: v, muted: v === 0 ? true : false });
    this.syncVolume();
  }

  setMuted(m: boolean) {
    this.set({ muted: m });
    this.syncVolume();
  }

  private syncVolume() {
    const g = this.ensureAudio();
    const level = this.snap.muted ? 0 : this.snap.volume;
    if (g) {
      this.video.volume = 1;
      g.setVolume(level);
    } else {
      this.video.volume = Math.min(1, level);
    }
  }

  // ---------- tracks ----------
  setAudioTrack(index: number) {
    if (index === this.snap.audioIndex) return;
    this.set({ audioIndex: index });
    const tracks = (this.video as any).audioTracks as { length: number; [i: number]: { enabled: boolean } } | undefined;
    if (this.snap.mode === 'direct') {
      if (tracks && tracks.length > index) {
        for (let i = 0; i < tracks.length; i++) tracks[i].enabled = i === index;
        return;
      }
      this.set({ mode: 'remux' });
    }
    this.restartStream(this.time);
  }

  /** Positive delays use Web Audio (instant); negative delays need ffmpeg's -itsoffset. */
  setAudioDelay(seconds: number) {
    seconds = Math.round(seconds * 1000) / 1000;
    const prev = this.snap.audioDelay;
    this.set({ audioDelay: seconds });
    this.ensureAudio()?.setDelay(Math.max(0, seconds));
    const needsStream = seconds < 0 || prev < 0;
    if (!needsStream || !this.sessionId) return;
    if (this.snap.mode === 'direct') this.set({ mode: 'remux' });
    window.clearTimeout(this.restartTimer);
    this.restartTimer = window.setTimeout(() => this.restartStream(this.time), 400);
  }

  /** Image subtitles (PGS/VobSub) can only be shown by burning them in. */
  setBurnSubtitle(index: number | null) {
    if (index === this.snap.burnSubtitle) return;
    this.set({ burnSubtitle: index });
    if (!this.sessionId) return;
    if (index === null && this.snap.plan?.mode === 'direct') {
      this.set({ mode: 'direct' });
      this.start(this.time);
      return;
    }
    if (this.snap.mode === 'direct') this.set({ mode: 'transcode' });
    this.restartStream(this.time);
  }

  /** Cues of an embedded track extracted live from the stream so far, sorted by time. */
  liveCuesFor(track: number): Cue[] {
    return [...(this.liveCues.get(track)?.values() ?? [])].sort((a, b) => a.start - b.start);
  }

  async thumbnail(t: number, width = 192) {
    if (!this.sessionId || !ocean) return null;
    return ocean.thumbnail(this.sessionId, t, width);
  }

  async screenshot() {
    if (!this.sessionId || !ocean) return null;
    return ocean.screenshot(this.sessionId, this.time, this.snap.title || 'Ocean');
  }

  async extractSubtitle(index: number) {
    if (!this.sessionId || !ocean) return null;
    return ocean.extractSubtitle(this.sessionId, index);
  }

  unload() {
    this.loadToken++;
    if (this.sessionId) ocean?.closeMedia(this.sessionId);
    this.sessionId = null;
    this.video.removeAttribute('src');
    this.video.load();
    this.offset = 0;
    this.set({ ...initial, volume: this.snap.volume, muted: this.snap.muted, rate: this.snap.rate });
  }
}

export function titleFromInput(input: string) {
  let name = input;
  try {
    if (/^[a-z]+:\/\//i.test(input)) name = decodeURIComponent(new URL(input).pathname);
  } catch {
    /* keep */
  }
  return (name.split(/[\\/]/).pop() || input).replace(/\.[^.]+$/, '');
}

const ISO: Record<string, string[]> = {
  fa: ['fa', 'per', 'fas'], en: ['en', 'eng'], ar: ['ar', 'ara'], tr: ['tr', 'tur'], fr: ['fr', 'fre', 'fra'],
  de: ['de', 'ger', 'deu'], es: ['es', 'spa'], ja: ['ja', 'jpn'], ko: ['ko', 'kor'],
};

/** Matches ISO 639-1 preferences ("fa") against stream tags, which are usually 639-2 ("per"/"fas"). */
export function languageMatches(tag: string | undefined, pref: string) {
  if (!tag || !pref) return false;
  const t = tag.toLowerCase();
  return (ISO[pref] ?? [pref]).some((c) => t === c || t.startsWith(c + '-'));
}
