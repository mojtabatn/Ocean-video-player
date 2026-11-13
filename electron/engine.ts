import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type {
  AudioTrack, Capabilities, Chapter, MediaInfo, OpenResult, PlayPlan, StreamRequest, SubtitleTrack,
} from '../shared/media';
import { FFMPEG, FFPROBE, h264Encoder, inputOpts, run, spawnFfmpeg } from './ffmpeg';
import * as cache from './mediacache';
import { parseSubtitles, type Cue } from '../src/lib/subtitles';

/** Receives subtitle cues extracted live from a running stream (set by main.ts to forward to the window). */
export let onLiveCues: (sessionId: string, track: number, cues: Cue[]) => void = () => {};
export function setLiveCuesListener(fn: typeof onLiveCues) {
  onLiveCues = fn;
}

const DIRECT_CONTAINERS = ['mov', 'mp4', 'm4a', '3gp', 'webm', 'ogg'];
const BROWSER_AUDIO = ['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm_s16le', 'pcm_f32le'];
/** Audio that can be stream-copied into fragmented MP4. */
const MP4_COPY_AUDIO = ['aac', 'mp3', 'opus', 'flac'];
const TEXT_SUBS = ['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text', 'text', 'microdvd', 'subviewer', 'sami', 'realtext'];

/** `src` is what ffmpeg reads: the file path, or for online media the local chunk-cache URL. */
type Session = { input: string; src: string; info: MediaInfo; proc?: ChildProcess; subProc?: ChildProcess };
const sessions = new Map<string, Session>();

let caps: Capabilities = { hevc: false, av1: true, vp9: true };
export function setCapabilities(c: Capabilities) {
  caps = c;
}

const isUrl = (s: string) => /^[a-z][a-z0-9+.-]*:\/\//i.test(s);
const num = (v: unknown) => (v === undefined || v === null || v === 'N/A' ? undefined : Number(v));

function parseFps(rate?: string) {
  if (!rate) return 0;
  const [a, b] = rate.split('/').map(Number);
  return b ? a / b : a || 0;
}

export async function probe(input: string, src = input): Promise<MediaInfo> {
  const { stdout } = await run(
    FFPROBE,
    ['-v', 'error', ...inputOpts(src, 'ffprobe'), '-show_format', '-show_streams', '-show_chapters', '-of', 'json', src],
    { timeout: 30000 },
  );
  const j = JSON.parse(stdout.toString('utf8'));
  const streams: any[] = j.streams ?? [];
  const tag = (s: any, k: string) => s.tags?.[k] ?? s.tags?.[k.toUpperCase()];

  const v = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const audio: AudioTrack[] = streams
    .filter((s) => s.codec_type === 'audio')
    .map((s, index) => ({
      index,
      codec: s.codec_name,
      channels: s.channels ?? 2,
      language: tag(s, 'language'),
      title: tag(s, 'title'),
      isDefault: !!s.disposition?.default,
    }));
  const subtitles: SubtitleTrack[] = streams
    .filter((s) => s.codec_type === 'subtitle')
    .map((s, index) => ({
      index,
      codec: s.codec_name ?? 'unknown',
      kind: TEXT_SUBS.includes(s.codec_name) ? 'text' : 'image',
      language: tag(s, 'language'),
      title: tag(s, 'title'),
      isDefault: !!s.disposition?.default,
      forced: !!s.disposition?.forced,
    }));
  const chapters: Chapter[] = (j.chapters ?? []).map((c: any, i: number) => ({
    start: Number(c.start_time),
    end: Number(c.end_time),
    title: c.tags?.title ?? `Chapter ${i + 1}`,
  }));

  const pixFmt: string | undefined = v?.pix_fmt;
  const bitDepth = Number(v?.bits_per_raw_sample) || (pixFmt && /p(10|12)/.test(pixFmt) ? Number(/p(10|12)/.exec(pixFmt)![1]) : 8);
  const durations = [num(j.format?.duration), num(v?.duration)].filter((d): d is number => !!d && Number.isFinite(d));

  return {
    input,
    isUrl: isUrl(input),
    formatName: j.format?.format_name ?? '',
    formatLongName: j.format?.format_long_name ?? '',
    startTime: num(j.format?.start_time) ?? 0,
    duration: durations[0] ?? 0,
    size: num(j.format?.size),
    bitRate: num(j.format?.bit_rate),
    video: v && {
      codec: v.codec_name,
      profile: v.profile,
      width: v.width,
      height: v.height,
      fps: parseFps(v.avg_frame_rate) || parseFps(v.r_frame_rate),
      pixFmt,
      bitDepth,
      bitRate: num(v.bit_rate),
      hdr: ['smpte2084', 'arib-std-b67'].includes(v.color_transfer),
    },
    audio,
    subtitles,
    chapters,
  };
}

function browserCanDecodeVideo(info: MediaInfo) {
  const v = info.video;
  if (!v) return true;
  switch (v.codec) {
    case 'h264':
      return v.bitDepth <= 8; // Chromium has no 10-bit H.264 decoder
    case 'hevc':
      return caps.hevc;
    case 'av1':
      return caps.av1;
    case 'vp9':
      return caps.vp9;
    case 'vp8':
    case 'theora':
      return true;
    default:
      return false;
  }
}

function defaultAudio(info: MediaInfo) {
  return info.audio.find((a) => a.isDefault) ?? info.audio[0];
}

export async function plan(info: MediaInfo): Promise<PlayPlan> {
  const a = defaultAudio(info);
  const containerOk = DIRECT_CONTAINERS.some((c) => info.formatName.split(',').includes(c));
  const audioOk = !a || BROWSER_AUDIO.includes(a.codec);
  const videoOk = browserCanDecodeVideo(info);
  // MP4/WebM can hold only VP8/VP9/AV1/H.264/HEVC; theora stays direct only in ogg.
  const copyableVideo = !info.video || ['h264', 'hevc', 'av1', 'vp9'].includes(info.video.codec);

  if (!videoOk) {
    const enc = await h264Encoder();
    return {
      mode: 'transcode',
      reason: `${info.video?.codec.toUpperCase()}${info.video && info.video.bitDepth > 8 ? ` ${info.video.bitDepth}-bit` : ''} video is converted on the fly`,
      videoEncoder: enc?.name,
    };
  }
  if (containerOk && audioOk && !info.isUrl) return { mode: 'direct', reason: 'Played natively' };
  if (copyableVideo) {
    return {
      mode: 'remux',
      reason: !audioOk ? `${a!.codec.toUpperCase()} audio is converted to AAC` : `${info.formatName.split(',')[0].toUpperCase()} container is repackaged`,
    };
  }
  const enc = await h264Encoder();
  return { mode: 'transcode', reason: `${info.video?.codec} video is converted on the fly`, videoEncoder: enc?.name };
}

export async function open(input: string): Promise<OpenResult> {
  let src = input;
  try {
    if (isUrl(input) && /^https?:/i.test(input)) src = await cache.register(input).catch(() => input);
    const info = await probe(input, src);
    if (!info.video && info.audio.length === 0) return { ok: false, error: 'No playable audio or video found in this file.' };
    const p = await plan(info);
    if (p.mode === 'transcode' && !p.videoEncoder) {
      return { ok: false, error: 'This video needs conversion, but no H.264 encoder is available.' };
    }
    const sessionId = randomUUID();
    sessions.set(sessionId, { input, src, info });
    return { ok: true, sessionId, info, plan: p };
  } catch (e: any) {
    if (src !== input) cache.release(src);
    return { ok: false, error: e?.stderr?.trim().split('\n').pop() || 'This file could not be opened.' };
  }
}

export function close(sessionId: string) {
  const s = sessions.get(sessionId);
  s?.proc?.kill('SIGKILL');
  s?.subProc?.kill('SIGKILL');
  if (s && s.src !== s.input) cache.release(s.src);
  sessions.delete(sessionId);
}

/**
 * Where a stream-copy seek to `t` really starts. ffmpeg lands on a seekable keyframe at or before `t`
 * (for MKV often an earlier cue point), so we ask ffmpeg itself: copy one packet with original
 * timestamps and read its pts. The stream is then started exactly there and the clock stays exact.
 */
export async function keyframeBefore(sessionId: string, t: number) {
  const s = sessions.get(sessionId);
  if (!s || t <= 0) return 0;
  try {
    const { stdout } = await run(
      FFMPEG,
      ['-hide_banner', '-loglevel', 'error', '-copyts', ...inputOpts(s.src), '-ss', t.toFixed(3), '-i', s.src,
        '-map', '0:v:0', '-c', 'copy', '-frames:v', '1', '-f', 'framecrc', '-'],
      { timeout: 15000 },
    );
    const text = stdout.toString();
    const tb = /#tb 0: (\d+)\/(\d+)/.exec(text);
    const line = text.split('\n').find((l) => /^0,/.test(l));
    if (!tb || !line) return t;
    const pts = Number(line.split(',')[1]);
    const landing = (pts * Number(tb[1])) / Number(tb[2]) - s.info.startTime;
    return Number.isFinite(landing) && landing <= t + 0.01 ? Math.max(0, landing) : t;
  } catch {
    return t;
  }
}

function audioArgs(info: MediaInfo, audioIndex: number, forceEncode: boolean) {
  const a = info.audio[audioIndex];
  if (!a) return [];
  if (!forceEncode && MP4_COPY_AUDIO.includes(a.codec)) return ['-c:a', 'copy'];
  const channels = Math.min(a.channels || 2, 6);
  return ['-c:a', 'aac', '-ac', String(channels), '-b:a', channels > 2 ? '384k' : '192k'];
}

/** Builds the ffmpeg command for a fragmented-MP4 stream starting at `start`. */
export async function streamArgs(req: StreamRequest): Promise<{ args: string[]; liveTracks: number[] }> {
  const s = sessions.get(req.sessionId);
  if (!s) throw new Error('Unknown session');
  const { info, src: input } = s;
  const net = inputOpts(input);
  const seek = req.start > 0 ? ['-ss', req.start.toFixed(3)] : [];
  const args: string[] = [...net, ...seek, '-i', input];

  const hasAudio = info.audio.length > 0;
  const delay = req.audioDelay;
  // A separate audio input lets us shift audio either direction with -itsoffset.
  if (hasAudio && delay !== 0) args.push(...net, '-itsoffset', delay.toFixed(3), ...seek, '-i', input);
  const audioInput = hasAudio && delay !== 0 ? 1 : 0;

  const transcode = req.mode === 'transcode' || req.burnSubtitle !== undefined;
  if (info.video) {
    if (transcode) {
      const enc = await h264Encoder();
      if (!enc) throw new Error('No H.264 encoder');
      const filters: string[] = [];
      const maxW = enc.name.startsWith('lib') || enc.name === 'h264_mf' ? 1920 : 3840;
      if (req.burnSubtitle !== undefined) {
        args.push('-filter_complex',
          `[0:v:0][0:s:${req.burnSubtitle}]overlay=eof_action=pass,scale='min(${maxW},iw)':-2,format=yuv420p[v]`,
          '-map', '[v]');
      } else {
        filters.push(`scale='min(${maxW},iw)':-2`, 'format=yuv420p');
        args.push('-map', '0:v:0', '-vf', filters.join(','));
      }
      args.push('-c:v', enc.name, ...enc.args, '-g', String(Math.round((info.video.fps || 25) * 2)));
    } else {
      args.push('-map', '0:v:0', '-c:v', 'copy');
      if (info.video.codec === 'hevc') args.push('-tag:v', 'hvc1');
    }
  }
  if (hasAudio) {
    args.push('-map', `${audioInput}:a:${req.audioIndex}?`, ...audioArgs(info, req.audioIndex, delay !== 0 || transcode));
  }
  args.push(
    '-sn', '-dn', '-map_chapters', '-1', '-max_muxing_queue_size', '4096',
    '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-frag_duration', '1000000', 'pipe:1',
  );
  // Online files: text subtitle tracks are written as SRT to extra pipes while the stream runs, so they
  // arrive ahead of playback without reading the whole remote file first.
  const liveTracks = info.isUrl ? info.subtitles.filter((t) => t.kind === 'text').slice(0, 6).map((t) => t.index) : [];
  liveTracks.forEach((track, k) => {
    args.push('-map', `0:s:${track}`, '-c:s', 'srt', '-flush_packets', '1', '-f', 'srt', `pipe:${3 + k}`);
  });
  return { args, liveTracks };
}

/** Protocol handler for ocean-stream://s/<session>?t=..&a=..&d=..&m=..&b=.. */
export async function handleStream(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.pathname.replace(/^\//, '');
  const s = sessions.get(sessionId);
  if (!s) return new Response('Gone', { status: 410 });

  const b = url.searchParams.get('b');
  const req: StreamRequest = {
    sessionId,
    start: Number(url.searchParams.get('t') ?? 0),
    audioIndex: Number(url.searchParams.get('a') ?? 0),
    audioDelay: Number(url.searchParams.get('d') ?? 0),
    mode: url.searchParams.get('m') === 'transcode' ? 'transcode' : 'remux',
    burnSubtitle: b === null || b === '' ? undefined : Number(b),
  };

  // One live ffmpeg per session: a new request (seek / track change) replaces the old one.
  s.proc?.kill('SIGKILL');
  const { args, liveTracks } = await streamArgs(req);
  const proc = spawnFfmpeg(args, liveTracks.length);
  s.proc = proc;
  liveTracks.forEach((track, k) => readLiveSubtitles(proc, 3 + k, sessionId, track, req.start));
  backfillSubtitles(s, sessionId, liveTracks, req.start);
  let stderr = '';
  proc.stderr?.on('data', (d) => {
    stderr = (stderr + d.toString()).slice(-4000);
  });
  proc.on('close', (code) => {
    if (code && code !== 255 && !proc.killed) console.error(`[ffmpeg ${code}]`, stderr.trim());
  });

  // Let ffmpeg run ahead of playback (up to 64 MB) so network hiccups on online sources don't stall.
  const body = Readable.toWeb(proc.stdout!, {
    strategy: new ByteLengthQueuingStrategy({ highWaterMark: 64 * 1024 * 1024 }),
  }) as unknown as ReadableStream;
  return new Response(body, { status: 200, headers: { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
}

// ---------- Thumbnails (seek-bar preview) ----------

let thumbBusy = false;
let thumbNext: { input: string; t: number; width: number; resolve: (v: string | null) => void } | null = null;

/** JPEG data URL of the frame at `t`. Requests coalesce: only the latest pending one runs. */
export function thumbnail(sessionId: string, t: number, width = 192): Promise<string | null> {
  const s = sessions.get(sessionId);
  if (!s || !s.info.video) return Promise.resolve(null);
  return new Promise((resolve) => {
    thumbNext?.resolve(null);
    thumbNext = { input: s.src, t, width, resolve };
    pumpThumbs();
  });
}

async function pumpThumbs() {
  if (thumbBusy || !thumbNext) return;
  const job = thumbNext;
  thumbNext = null;
  thumbBusy = true;
  try {
    const { stdout } = await run(
      FFMPEG,
      ['-hide_banner', '-loglevel', 'error', ...inputOpts(job.input), '-skip_frame', 'nokey', '-ss', String(Math.max(0, job.t)), '-i', job.input,
        '-frames:v', '1', '-vf', `scale=${job.width}:-2`, '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '6', 'pipe:1'],
      { timeout: 6000, maxBuffer: 4 * 1024 * 1024 },
    );
    job.resolve(stdout.length ? `data:image/jpeg;base64,${stdout.toString('base64')}` : null);
  } catch {
    job.resolve(null);
  } finally {
    thumbBusy = false;
    pumpThumbs();
  }
}

// ---------- Embedded subtitles ----------

/** Extracts a text subtitle stream as ASS (keeps styling) or SRT. */
export async function extractSubtitle(sessionId: string, index: number): Promise<{ format: 'ass' | 'srt'; text: string } | null> {
  const s = sessions.get(sessionId);
  const track = s?.info.subtitles[index];
  if (!s || !track || track.kind !== 'text') return null;
  const format = track.codec === 'ass' || track.codec === 'ssa' ? 'ass' : 'srt';
  const { stdout } = await run(
    FFMPEG,
    ['-hide_banner', '-loglevel', 'error', ...inputOpts(s.src), '-i', s.src, '-map', `0:s:${index}`, '-c:s', format, '-f', format, 'pipe:1'],
    { timeout: 120000, maxBuffer: 64 * 1024 * 1024 },
  );
  return { format, text: stdout.toString('utf8') };
}

/** Screenshot at full source resolution, written as PNG. */
export async function screenshot(sessionId: string, t: number, outFile: string) {
  const s = sessions.get(sessionId);
  if (!s) throw new Error('Unknown session');
  await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...inputOpts(s.src), '-ss', String(t), '-i', s.src, '-frames:v', '1', outFile], {
    timeout: 20000,
  });
  return outFile;
}

export function killAll() {
  for (const id of sessions.keys()) close(id);
}

/** Downloaded parts of an online file as fractions (empty for local files). */
export function cached(sessionId: string) {
  const s = sessions.get(sessionId);
  return s && s.src !== s.input ? cache.cachedRanges(s.src) : [];
}

/** Parses SRT arriving on an ffmpeg pipe block by block and forwards cues shifted to media time. */
function readLiveSubtitles(proc: ChildProcess, fd: number, sessionId: string, track: number, offset: number) {
  const stream = proc.stdio[fd] as NodeJS.ReadableStream | undefined;
  if (!stream) return;
  let pending = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => {
    pending += chunk.replace(/\r/g, '');
    const cut = pending.lastIndexOf('\n\n');
    if (cut < 0) return;
    const complete = pending.slice(0, cut + 2);
    pending = pending.slice(cut + 2);
    const cues = parseSubtitles(complete).map((c) => ({ ...c, start: c.start + offset, end: c.end + offset }));
    if (cues.length) onLiveCues(sessionId, track, cues);
  });
  stream.on('end', () => {
    const cues = parseSubtitles(pending).map((c) => ({ ...c, start: c.start + offset, end: c.end + offset }));
    if (cues.length) onLiveCues(sessionId, track, cues);
  });
  stream.on('error', () => {});
}

/**
 * After a seek the stream restarts at a video keyframe, so subtitles already on screen at that moment (they
 * started earlier) never pass through it. A short subtitle-only read of the window before the restart point
 * delivers them. It shares the chunk cache with the stream, so it costs almost no extra download.
 */
const BACKFILL_SECONDS = 40;
function backfillSubtitles(s: Session, sessionId: string, tracks: number[], start: number) {
  s.subProc?.kill('SIGKILL');
  s.subProc = undefined;
  if (!tracks.length || start <= 1) return;
  const from = Math.max(0, start - BACKFILL_SECONDS);
  const args = [...inputOpts(s.src), '-ss', from.toFixed(3), '-t', String(start - from + 2), '-i', s.src, '-vn', '-an', '-dn'];
  tracks.forEach((track, k) => args.push('-map', `0:s:${track}`, '-c:s', 'srt', '-f', 'srt', `pipe:${3 + k}`));
  const proc = spawnFfmpeg(args, tracks.length);
  s.subProc = proc;
  proc.stdout?.on('data', () => {});
  proc.stderr?.on('data', () => {});
  tracks.forEach((track, k) => readLiveSubtitles(proc, 3 + k, sessionId, track, from));
}
