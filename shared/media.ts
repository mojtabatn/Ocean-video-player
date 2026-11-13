// Types shared by the Electron main process and the renderer.

export type PlayMode = 'direct' | 'remux' | 'transcode';

export type AudioTrack = {
  /** Index among the file's audio streams (ffmpeg `0:a:N`). */
  index: number;
  codec: string;
  channels: number;
  language?: string;
  title?: string;
  isDefault: boolean;
};

export type SubtitleTrack = {
  /** Index among the file's subtitle streams (ffmpeg `0:s:N`). */
  index: number;
  codec: string;
  /** Text tracks can be extracted and styled; image tracks (PGS/VobSub) must be burned in. */
  kind: 'text' | 'image';
  language?: string;
  title?: string;
  isDefault: boolean;
  forced: boolean;
};

export type Chapter = { start: number; end: number; title: string };

export type MediaInfo = {
  input: string;
  isUrl: boolean;
  formatName: string;
  formatLongName: string;
  /** Container start time (non-zero for e.g. MPEG-TS); ffmpeg -ss is relative to it. */
  startTime: number;
  duration: number;
  size?: number;
  bitRate?: number;
  video?: {
    codec: string;
    profile?: string;
    width: number;
    height: number;
    fps: number;
    pixFmt?: string;
    bitDepth: number;
    bitRate?: number;
    hdr: boolean;
  };
  audio: AudioTrack[];
  subtitles: SubtitleTrack[];
  chapters: Chapter[];
};

export type Capabilities = { hevc: boolean; av1: boolean; vp9: boolean };

export type PlayPlan = {
  mode: PlayMode;
  /** Short human-readable reason, shown in Media Info. */
  reason: string;
  videoEncoder?: string;
};

export type StreamRequest = {
  sessionId: string;
  start: number;
  audioIndex: number;
  /** Seconds; positive delays audio. */
  audioDelay: number;
  /** Image subtitle stream to burn in (forces transcode). */
  burnSubtitle?: number;
  mode: Exclude<PlayMode, 'direct'>;
};

export type OpenResult =
  | { ok: true; sessionId: string; info: MediaInfo; plan: PlayPlan }
  | { ok: false; error: string };

// ---------- Online catalogue (home screen) ----------

export type OnlineTitle = {
  id: string;
  title: string;
  /** Full Persian headline from the site, e.g. "دانلود سریال سرزمین اوباش MobLand …". */
  persianTitle?: string;
  poster: string;
  backdrop?: string;
  imdb?: string;
  imdbId?: string;
  kind: 'movie' | 'series';
  /** Page on the source site; used to load qualities/episodes. */
  pageUrl: string;
  year?: string;
};

export type OnlineSource = {
  /** Quality as the site writes it, e.g. "BluRay 1080p 10bit x265". */
  label: string;
  /** Audio/subtitle version: Persian dub, hard-coded Persian subtitles, … */
  group: 'dubbed' | 'hardsub' | 'softsub' | 'other';
  /** Group heading from the site, e.g. "دوبله فارسی بدون حذفیات (دو زبانه)". */
  groupTitle: string;
  encoder?: string;
  note?: string;
  /** Vertical resolution used for sorting (lowest first). */
  height: number;
  url: string;
  size?: string;
};

export type OnlineEpisode = { season: number; episode: number; title?: string; sources: OnlineSource[] };

export type OnlineDetails = {
  title: OnlineTitle;
  /** Movies: one list of qualities. */
  sources: OnlineSource[];
  /** Series: qualities per episode. */
  episodes: OnlineEpisode[];
};

/**
 * Order used for "lowest quality first": resolution, then plain H.264 before 10-bit/x265/HDR/remux
 * (smaller to stream and decoded natively, no conversion needed).
 */
export function compareSources(a: OnlineSource, b: OnlineSource) {
  const heavy = (s: OnlineSource) => (/10bit|x265|hevc|hdr|remux/i.test(s.label + ' ' + s.url) ? 1 : 0);
  return (a.height || 9999) - (b.height || 9999) || heavy(a) - heavy(b);
}

export const GROUP_LABEL: Record<OnlineSource['group'], string> = {
  dubbed: 'دوبله فارسی',
  hardsub: 'زیرنویس چسبیده',
  softsub: 'زیرنویس',
  other: 'سایر',
};

export type SourcePref = Pick<OnlineSource, 'group' | 'label' | 'encoder'>;

/** Same version (dub / subtitle) and quality as before if this episode has it, else the closest. */
export function pickSource(sources: OnlineSource[], pref?: SourcePref) {
  const sorted = [...sources].sort(compareSources);
  if (!pref) return sorted[0];
  return (
    sorted.find((s) => s.group === pref.group && s.label === pref.label && s.encoder === pref.encoder) ??
    sorted.find((s) => s.group === pref.group && s.label === pref.label) ??
    sorted.filter((s) => s.group === pref.group).sort((a, b) => Math.abs(a.height - heightOfLabel(pref.label)) - Math.abs(b.height - heightOfLabel(pref.label)))[0] ??
    sorted[0]
  );
}

function heightOfLabel(label: string) {
  const m = /(\d{3,4})p\b/i.exec(label);
  return m ? Number(m[1]) : /4k|uhd/i.test(label) ? 2160 : 0;
}
