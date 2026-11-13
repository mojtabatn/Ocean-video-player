/** A run of cue text with the colour/italics the subtitle file gave it. */
export type CuePart = { text: string; color?: string; italic?: boolean };
/** `parts` is present only when the file coloured part of the line (e.g. translator credits, site address). */
export type Cue = { start: number; end: number; text: string; top?: boolean; parts?: CuePart[] };

const SRT_TIME = /(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;

function toSeconds(stamp: string) {
  const m = SRT_TIME.exec(stamp);
  if (!m) return NaN;
  return (+(m[1] ?? 0)) * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, '0') / 1000;
}

const stripTags = (t: string) => t.replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '');

/** ASS "&HBBGGRR&" (optionally with alpha "&HAABBGGRR&") → "#rrggbb". */
function assColor(v: string) {
  const hex = v.replace(/[&H]/gi, '').padStart(6, '0').slice(-6);
  return `#${hex.slice(4, 6)}${hex.slice(2, 4)}${hex.slice(0, 2)}`.toLowerCase();
}

function htmlColor(v: string) {
  const c = v.trim().replace(/^["']|["']$/g, '');
  if (/^#?[0-9a-f]{6}$/i.test(c)) return (c.startsWith('#') ? c : `#${c}`).toLowerCase();
  if (/^#?[0-9a-f]{3}$/i.test(c)) return (c.startsWith('#') ? c : `#${c}`).toLowerCase();
  return /^[a-z]+$/i.test(c) ? c.toLowerCase() : undefined;
}

/**
 * Splits raw cue text into coloured runs: SRT/HTML <font color>, <i>, and ASS {\c&H…&} / {\1c…} / {\i1}.
 * Returns undefined when nothing is coloured, so plain cues stay lightweight.
 */
function richParts(raw: string): CuePart[] | undefined {
  const parts: CuePart[] = [];
  const colors: (string | undefined)[] = [];
  let assColorNow: string | undefined;
  let italic = 0;
  let any = false;
  const re = /<font\b[^>]*?color\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)[^>]*>|<\/font\s*>|<(\/?)i\s*>|<[^>]+>|\{([^}]*)\}/gi;
  let last = 0;
  const push = (text: string) => {
    if (!text) return;
    const color = assColorNow ?? colors[colors.length - 1];
    const prev = parts[parts.length - 1];
    if (prev && prev.color === color && !!prev.italic === italic > 0) prev.text += text;
    else parts.push({ text, color, italic: italic > 0 || undefined });
  };
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    push(raw.slice(last, m.index));
    last = re.lastIndex;
    if (m[1] !== undefined) {
      colors.push(htmlColor(m[1]));
      any = true;
    } else if (/^<\/font/i.test(m[0])) colors.pop();
    else if (m[2] !== undefined) italic = Math.max(0, italic + (m[2] ? -1 : 1));
    else if (m[3] !== undefined) {
      const tag = m[3];
      const c = /\\1?c(&H[0-9a-f]+&?)?/i.exec(tag);
      if (c) {
        assColorNow = c[1] ? assColor(c[1]) : undefined;
        if (c[1]) any = true;
      }
      const it = /\\i([01])/.exec(tag);
      if (it) italic = it[1] === '1' ? 1 : 0;
      if (/\\r/.test(tag)) {
        assColorNow = undefined;
        italic = 0;
      }
    }
  }
  push(raw.slice(last));
  if (!any) return undefined;
  const out = parts.map((p) => ({ ...p, text: p.text.replace(/\\N/gi, '\n').replace(/\\h/g, ' ') }));
  // Trim like the plain text is trimmed.
  if (out.length) {
    out[0].text = out[0].text.replace(/^\s+/, '');
    out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, '');
  }
  return out.filter((p) => p.text);
}

function parseSrtVtt(source: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of source.split(/\n{2,}/)) {
    const lines = block.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const [a, b] = lines[i].split('-->');
    const start = toSeconds(a);
    const end = toSeconds(b);
    const raw = lines.slice(i + 1).join('\n');
    const top = /\{\\an[789]\}/.test(raw) || /line:\s*[0-3]?\d%/.test(lines[i]);
    const text = stripTags(raw).trim();
    const parts = richParts(raw);
    if (Number.isFinite(start) && Number.isFinite(end) && text) cues.push({ start, end, text, top, ...(parts ? { parts } : {}) });
  }
  return cues;
}

/** ASS/SSA: reads Dialogue lines; styling is replaced by Ocean's subtitle style (top/bottom placement is kept). */
function parseAss(source: string): Cue[] {
  const cues: Cue[] = [];
  let format: string[] = ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];
  let inEvents = false;
  const topStyles = new Set<string>();
  let styleFormat: string[] = [];
  for (const line of source.split('\n')) {
    const t = line.trim();
    if (/^\[events\]/i.test(t)) inEvents = true;
    else if (/^\[/.test(t)) inEvents = false;
    if (/^format:/i.test(t)) {
      const f = t.slice(7).split(',').map((s) => s.trim().toLowerCase());
      if (inEvents) format = f;
      else styleFormat = f;
    }
    if (/^style:/i.test(t) && styleFormat.length) {
      const parts = t.slice(6).split(',');
      const align = Number(parts[styleFormat.indexOf('alignment')]);
      const name = parts[styleFormat.indexOf('name')]?.trim();
      // Legacy SSA uses 5-7 for top; ASS numpad uses 7-9.
      if (name && align >= 7) topStyles.add(name);
    }
    if (!/^dialogue:/i.test(t)) continue;
    const body = t.slice(9);
    const parts: string[] = [];
    let rest = body;
    for (let i = 0; i < format.length - 1; i++) {
      const idx = rest.indexOf(',');
      parts.push(rest.slice(0, idx).trim());
      rest = rest.slice(idx + 1);
    }
    parts.push(rest);
    const get = (k: string) => parts[format.indexOf(k)] ?? '';
    const rawText = get('text');
    // Drawing commands (\p1) are vector shapes, not text.
    if (/\\p[1-9]/.test(rawText)) continue;
    const text = stripTags(rawText.replace(/\\N/gi, '\n').replace(/\\h/g, ' ')).trim();
    const rich = richParts(rawText);
    const start = toSeconds(get('start').replace(/(\.\d{2})$/, '$10'));
    const end = toSeconds(get('end').replace(/(\.\d{2})$/, '$10'));
    const top = /\\an[789]/.test(rawText) || topStyles.has(get('style'));
    if (text && Number.isFinite(start) && Number.isFinite(end)) cues.push({ start, end, text, top, ...(rich ? { parts: rich } : {}) });
  }
  return cues;
}

/** Parses SRT, WebVTT and ASS/SSA into cues sorted by start time. */
export function parseSubtitles(source: string): Cue[] {
  const s = source.replace(/\r/g, '').replace(/^﻿/, '');
  const cues = /^\s*\[script info\]/i.test(s) || /^dialogue:/im.test(s) ? parseAss(s) : parseSrtVtt(s);
  return cues.sort((x, y) => x.start - y.start);
}

/** UTF-8 (with or without BOM) or UTF-16; otherwise Windows-1256, the usual encoding of older Persian SRTs. */
export function decodeSubtitle(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1256').decode(bytes);
  }
}

/** Cues active at media time `t`, with the subtitle delay applied. Binary search keeps long files cheap. */
export function cuesAt(cues: Cue[], t: number, delay = 0) {
  const time = t - delay;
  let lo = 0;
  let hi = cues.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= time) lo = mid + 1;
    else hi = mid;
  }
  const out: Cue[] = [];
  // Overlapping cues: look back over a small window.
  for (let i = lo - 1; i >= 0 && i >= lo - 20; i--) {
    if (cues[i].end >= time) out.unshift(cues[i]);
  }
  return out;
}

export function toSrt(cues: Cue[], delay = 0) {
  const stamp = (s: number) => {
    const ms = Math.max(0, Math.round(s * 1000));
    const pad = (n: number, w = 2) => String(n).padStart(w, '0');
    return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
  };
  return cues
    .map((c, i) => `${i + 1}\n${stamp(c.start + delay)} --> ${stamp(c.end + delay)}\n${c.top ? '{\\an8}' : ''}${c.text}\n`)
    .join('\n');
}
