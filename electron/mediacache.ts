// Chunked disk cache for online media.
//
// ffmpeg/ffprobe never talk to the download server directly. They read http://127.0.0.1:<port>/m/<id>, a
// local server that supports Range requests and answers from 4 MB chunk files on disk. A missing chunk is
// fetched once from the origin with a ranged request (a few chunks per request); while something plays, a
// window ahead of the read position is downloaded in the background, chunk by chunk. Seeking back into
// anything already downloaded is therefore instant, and nothing is downloaded twice.

import { app, dialog } from 'electron';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync, promises as fs } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { originFetch } from './online/http';

const CHUNK = 4 * 1024 * 1024;
const CHUNKS_PER_REQUEST = 4; // 16 MB per origin request
const READ_AHEAD = Number(process.env.OCEAN_READ_AHEAD_CHUNKS) || 24; // chunks (~96 MB) kept ahead of the read position while playing
const PREFETCH_JOBS = 2;
let maxCacheBytes = 3 * 1024 ** 3;

type Deferred = { promise: Promise<void>; resolve: () => void; reject: (e: unknown) => void };
function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  promise.catch(() => {}); // rejections are observed by whoever awaits
  return { promise, resolve, reject };
}

type Entry = {
  id: string;
  url: string;
  dir: string;
  size: number;
  type: string;
  have: Set<number>;
  pending: Map<number, Deferred>;
  jobs: number;
  active: number; // open playback sessions using this entry
  lastUsed: number;
  saveTimer?: NodeJS.Timeout;
};

const entries = new Map<string, Entry>();
let server: http.Server | null = null;
let port = 0;

const defaultRoot = () => path.join(app.getPath('userData'), 'media-cache');
const configFile = () => path.join(app.getPath('userData'), 'cache-location.json');
let customRoot: string | null | undefined; // undefined = not read yet

/** Cache folder: the user's choice (always a dedicated "Ocean Cache" subfolder, so clearing never touches other files) or the default. */
function readConfig() {
  if (customRoot === undefined) {
    try {
      customRoot = JSON.parse(readFileSync(configFile(), 'utf8')).dir ?? null;
    } catch {
      customRoot = null;
    }
  }
  return customRoot;
}
const root = () => readConfig() ?? defaultRoot();

export function cacheDir() {
  return { dir: root(), isDefault: !readConfig() };
}

async function removeIdle(dir: string) {
  for (const [id, e] of entries) if (!e.active && e.dir.startsWith(dir)) entries.delete(id);
  const ids = await fs.readdir(dir).catch(() => [] as string[]);
  for (const id of ids) {
    if (![...entries.values()].some((e) => e.active && e.id === id)) await fs.rm(path.join(dir, id), { recursive: true, force: true });
  }
  await fs.rmdir(dir).catch(() => {}); // only succeeds when empty
}

/** Switches the cache folder. The old folder's idle cache is deleted (it is only a cache); a playing file finishes where it is. */
async function setRoot(dir: string | null) {
  const old = root();
  await fs.mkdir(dir ?? defaultRoot(), { recursive: true });
  customRoot = dir;
  await fs.writeFile(configFile(), JSON.stringify({ dir })).catch(() => {});
  if (old !== root()) await removeIdle(old);
}

export async function chooseCacheDir(parent: Electron.BrowserWindow | null) {
  const res = await dialog.showOpenDialog(parent!, {
    title: 'Choose where to keep the online playback cache',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: path.dirname(root()),
  });
  if (res.canceled || !res.filePaths[0]) return cacheDir();
  await setRoot(path.join(res.filePaths[0], 'Ocean Cache'));
  return cacheDir();
}

export async function resetCacheDir() {
  await setRoot(null);
  return cacheDir();
}
const chunkCount = (e: Entry) => Math.ceil(e.size / CHUNK);
const chunkFile = (e: Entry, i: number) => path.join(e.dir, `c${i}`);

export function setCacheLimit(bytes: number) {
  maxCacheBytes = bytes;
}

async function ensureServer() {
  if (server) return;
  server = http.createServer((req, res) => {
    serve(req, res).catch(() => res.destroy());
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  port = (server.address() as AddressInfo).port;
}

/**
 * Returns the local URL to read `url` through, or the original URL when the server cannot do ranged
 * requests (then there is nothing to cache chunk-wise).
 */
export async function register(url: string): Promise<string> {
  await ensureServer();
  const id = createHash('sha1').update(url.replace(/[?&]v=\d+/, '')).digest('hex').slice(0, 20);
  let e = entries.get(id);
  if (!e) {
    const loaded = await load(id, url).catch(() => null);
    if (!loaded) return url;
    e = loaded;
    entries.set(id, e);
  }
  e.url = url; // fresh token in ?v= for future origin requests
  e.active++;
  e.lastUsed = Date.now();
  saveMeta(e);
  enforceLimit().catch(() => {});
  return `http://127.0.0.1:${port}/m/${id}`;
}

export function release(localUrl: string) {
  const e = entryFor(localUrl);
  if (e) e.active = Math.max(0, e.active - 1);
}

function entryFor(localUrl: string) {
  const m = /\/m\/([0-9a-f]+)/.exec(localUrl);
  return m ? entries.get(m[1]) : undefined;
}

async function load(id: string, url: string): Promise<Entry | null> {
  const dir = path.join(root(), id);
  // Known from a previous run?
  try {
    const meta = JSON.parse(await fs.readFile(path.join(dir, 'meta.json'), 'utf8'));
    const files = new Set(await fs.readdir(dir));
    const have = new Set<number>((meta.have as number[]).filter((i) => files.has(`c${i}`)));
    return { id, url, dir, size: meta.size, type: meta.type, have, pending: new Map(), jobs: 0, active: 0, lastUsed: Date.now() };
  } catch {
    /* new entry */
  }
  // Ask the origin for the size with a one-byte range request.
  const res = await originFetch(url, { headers: { Range: 'bytes=0-0' } });
  const total = Number(/\/(\d+)$/.exec(res.headers.get('content-range') ?? '')?.[1]);
  res.body?.cancel().catch(() => {});
  if (res.status !== 206 || !Number.isFinite(total) || total <= 0) return null;
  await fs.mkdir(dir, { recursive: true });
  const type = res.headers.get('content-type') || 'application/octet-stream';
  return { id, url, dir, size: total, type, have: new Set(), pending: new Map(), jobs: 0, active: 0, lastUsed: Date.now() };
}

function saveMeta(e: Entry) {
  clearTimeout(e.saveTimer);
  e.saveTimer = setTimeout(() => {
    fs.writeFile(
      path.join(e.dir, 'meta.json'),
      JSON.stringify({ url: e.url, size: e.size, type: e.type, have: [...e.have], lastUsed: e.lastUsed }),
    ).catch(() => {});
  }, 1500);
}

/** Downloads chunks [first, first+n) with one ranged request, writing each chunk as soon as it is complete. */
async function fetchRun(e: Entry, first: number, n: number) {
  const last = Math.min(first + n, chunkCount(e)) - 1;
  const ids: number[] = [];
  for (let i = first; i <= last; i++) {
    if (e.have.has(i) || e.pending.has(i)) break;
    e.pending.set(i, deferred());
    ids.push(i);
  }
  if (!ids.length) return;
  e.jobs++;
  const start = ids[0] * CHUNK;
  const end = Math.min((ids[ids.length - 1] + 1) * CHUNK, e.size) - 1;
  let current = ids[0];
  try {
    const res = await originFetch(e.url, { headers: { Range: `bytes=${start}-${end}` } });
    if (res.status !== 206 || !res.body) throw new Error(`origin answered ${res.status}`);
    const reader = res.body.getReader();
    let buf = Buffer.alloc(0);
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buf = Buffer.concat([buf, Buffer.from(value)]);
      // Flush every complete chunk.
      while (current <= ids[ids.length - 1]) {
        const need = Math.min(CHUNK, e.size - current * CHUNK);
        if (buf.length < need) break;
        await fs.writeFile(chunkFile(e, current), buf.subarray(0, need));
        buf = buf.subarray(need);
        e.have.add(current);
        e.pending.get(current)?.resolve();
        e.pending.delete(current);
        current++;
      }
      if (done) break;
    }
    if (current <= ids[ids.length - 1]) throw new Error('origin closed the connection early');
  } catch (err) {
    for (let i = current; i <= ids[ids.length - 1]; i++) {
      e.pending.get(i)?.reject(err);
      e.pending.delete(i);
    }
  } finally {
    e.jobs--;
    saveMeta(e);
  }
}

/** Waits until chunk `i` is on disk, fetching it (and a few after it) if needed. Retries twice. */
async function ensureChunk(e: Entry, i: number) {
  for (let attempt = 0; ; attempt++) {
    if (e.have.has(i)) return;
    if (!e.pending.has(i)) fetchRun(e, i, CHUNKS_PER_REQUEST);
    try {
      await e.pending.get(i)?.promise;
      if (e.have.has(i)) return;
    } catch (err) {
      if (attempt >= 2) throw err;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

/** Keeps READ_AHEAD chunks after `from` downloading, a few requests at a time. */
function prefetch(e: Entry, from: number) {
  if (!e.active) return;
  const lastChunk = Math.min(chunkCount(e) - 1, from + READ_AHEAD);
  for (let i = from; i <= lastChunk && e.jobs < PREFETCH_JOBS; i++) {
    if (!e.have.has(i) && !e.pending.has(i)) fetchRun(e, i, CHUNKS_PER_REQUEST);
  }
}

async function serve(req: http.IncomingMessage, res: http.ServerResponse) {
  const e = entryFor(req.url ?? '');
  if (!e) {
    res.writeHead(404).end();
    return;
  }
  e.lastUsed = Date.now();
  let a = 0;
  let b = e.size - 1;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
  if (m) {
    if (m[1] === '' && m[2] !== '') a = Math.max(0, e.size - Number(m[2]));
    else {
      a = Number(m[1] || 0);
      if (m[2]) b = Math.min(Number(m[2]), e.size - 1);
    }
  }
  if (a > b || a >= e.size) {
    res.writeHead(416, { 'Content-Range': `bytes */${e.size}` }).end();
    return;
  }
  res.writeHead(m ? 206 : 200, {
    'Content-Type': e.type,
    'Content-Length': String(b - a + 1),
    'Accept-Ranges': 'bytes',
    ...(m ? { 'Content-Range': `bytes ${a}-${b}/${e.size}` } : {}),
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  let closed = false;
  res.on('close', () => (closed = true));
  let pos = a;
  while (pos <= b && !closed) {
    const ci = Math.floor(pos / CHUNK);
    await ensureChunk(e, ci);
    prefetch(e, ci + 1);
    const data = await fs.readFile(chunkFile(e, ci));
    const slice = data.subarray(pos - ci * CHUNK, Math.min(data.length, b + 1 - ci * CHUNK));
    if (!res.write(slice) && !closed) await Promise.race([once(res, 'drain'), once(res, 'close')]);
    pos += slice.length;
  }
  res.end();
}

/** Downloaded parts as [start, end] fractions of the file (for the seek bar). */
export function cachedRanges(localUrl: string): [number, number][] {
  const e = entryFor(localUrl);
  if (!e) return [];
  const n = chunkCount(e);
  const out: [number, number][] = [];
  let runStart = -1;
  for (let i = 0; i <= n; i++) {
    const has = i < n && e.have.has(i);
    if (has && runStart < 0) runStart = i;
    if (!has && runStart >= 0) {
      out.push([runStart / n, i / n]);
      runStart = -1;
    }
  }
  return out;
}

/** Keeps the cache under the size limit by deleting the least recently used files that are not playing. */
export async function enforceLimit() {
  const dirs = await fs.readdir(root()).catch(() => [] as string[]);
  const items: { id: string; bytes: number; lastUsed: number }[] = [];
  for (const id of dirs) {
    const dir = path.join(root(), id);
    const files = await fs.readdir(dir).catch(() => [] as string[]);
    const meta = await fs.readFile(path.join(dir, 'meta.json'), 'utf8').then(JSON.parse).catch(() => ({}));
    const live = entries.get(id);
    items.push({
      id,
      bytes: files.filter((f) => f.startsWith('c')).length * CHUNK,
      lastUsed: live?.active ? Infinity : (live?.lastUsed ?? meta.lastUsed ?? 0),
    });
  }
  let total = items.reduce((s, i) => s + i.bytes, 0);
  for (const it of items.sort((x, y) => x.lastUsed - y.lastUsed)) {
    if (total <= maxCacheBytes || it.lastUsed === Infinity) break;
    await fs.rm(path.join(root(), it.id), { recursive: true, force: true });
    entries.delete(it.id);
    total -= it.bytes;
  }
  return total;
}

export async function cacheSize() {
  const dirs = await fs.readdir(root()).catch(() => [] as string[]);
  let total = 0;
  for (const id of dirs) total += (await fs.readdir(path.join(root(), id)).catch(() => [])).filter((f) => f.startsWith('c')).length * CHUNK;
  return total;
}

export async function clearCache() {
  for (const [id, e] of entries) if (!e.active) entries.delete(id);
  const dirs = await fs.readdir(root()).catch(() => [] as string[]);
  for (const id of dirs) if (!entries.has(id)) await fs.rm(path.join(root(), id), { recursive: true, force: true });
}
