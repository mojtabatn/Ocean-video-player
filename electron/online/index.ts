import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { OnlineDetails, OnlineTitle } from '../../shared/media';
import { getPage, originFetch, setSiteBase, SIGNED_OUT, siteJson } from './http';
import { rememberImdbId } from './ratings';
import { fromWp, parseDetails, parseSearchPage, parseTrending } from './tejaratban-parse';

/** The site moves between mirror domains; the first one that answers wins. */
const MIRRORS = process.env.OCEAN_SITE_BASE ? [process.env.OCEAN_SITE_BASE] : ['https://www.tejaratban.top'];
setSiteBase(MIRRORS[0]);
const FRESH_MS = 30 * 60 * 1000;

type Cache = { fetchedAt: number; titles: OnlineTitle[] };
const cacheFile = () => path.join(app.getPath('userData'), 'trending-cache.json');

async function readCache(): Promise<Cache | null> {
  try {
    return JSON.parse(await fs.readFile(cacheFile(), 'utf8')) as Cache;
  } catch {
    return null;
  }
}

async function fetchTrending(): Promise<OnlineTitle[]> {
  let lastError: unknown;
  for (const base of MIRRORS) {
    try {
      const html = await getPage(base + '/', (h) => parseTrending(h, base + '/').length > 0, 'home');
      return parseTrending(html, base + '/');
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

/**
 * Trending titles from the homepage slider. The slider changes daily, so it is fetched live; the last
 * good result is cached on disk so the home screen fills instantly and still works offline.
 */
export async function trending(opts: { force?: boolean } = {}): Promise<{ titles: OnlineTitle[]; fetchedAt: number; stale: boolean }> {
  const cache = await readCache();
  if (!opts.force && cache && Date.now() - cache.fetchedAt < FRESH_MS) return { ...cache, stale: false };
  try {
    const titles = await fetchTrending();
    const fresh: Cache = { fetchedAt: Date.now(), titles };
    await fs.writeFile(cacheFile(), JSON.stringify(fresh)).catch(() => {});
    return { ...fresh, stale: false };
  } catch (e) {
    // Signed out: nothing from the site is shown (not even the cached list).
    if (cache && !String((e as Error).message).includes(SIGNED_OUT)) return { ...cache, stale: true };
    throw e;
  }
}

export function cachedTrending() {
  return readCache();
}

const detailsCache = new Map<string, { at: number; details: OnlineDetails }>();

/** Download boxes from the title page: qualities (movies) or seasons → episodes → qualities (series). */
export async function details(title: OnlineTitle): Promise<OnlineDetails> {
  const hit = detailsCache.get(title.pageUrl);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.details;
  // Point the page at the mirror that answered the homepage, if the domain changed.
  const page = process.env.OCEAN_SITE_BASE ? new URL(new URL(title.pageUrl).pathname, process.env.OCEAN_SITE_BASE).toString() : title.pageUrl;
  const usable = (h: string) => {
    const d = parseDetails(h, title);
    return d.sources.length > 0 || d.episodes.length > 0;
  };
  const html = await getPage(page, usable, 'title');
  const d = parseDetails(html, title);
  if (d.title.imdbId) rememberImdbId(title.id, d.title.imdbId);
  detailsCache.set(title.pageUrl, { at: Date.now(), details: d });
  return d;
}


const sizeCache = new Map<string, number | null>();
const sizeKey = (url: string) => url.replace(/[?&]v=\d+/, '');

/** File sizes from the download server (a one-byte ranged request each; nothing is downloaded). */
export async function sizes(urls: string[]): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  const todo = urls.filter((u) => {
    if (sizeCache.has(sizeKey(u))) out[u] = sizeCache.get(sizeKey(u))!;
    return !sizeCache.has(sizeKey(u));
  });
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const url = todo[next++];
      let size: number | null = null;
      try {
        const res = await originFetch(url, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(25000) });
        // A web page (login wall, error page) is not the file: its length says nothing about the video.
        const page = /text\/html|text\/plain/i.test(res.headers.get('content-type') ?? '');
        const total = page ? null : /\/(\d+)$/.exec(res.headers.get('content-range') ?? '')?.[1] ?? (res.status === 200 ? res.headers.get('content-length') : null);
        res.body?.cancel().catch(() => {});
        size = total ? Number(total) : null;
      } catch {
        size = null;
      }
      if (size) sizeCache.set(sizeKey(url), size);
      out[url] = size;
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, todo.length) }, worker));
  return out;
}

/**
 * Searches the whole site (movies and series), not just the slider. WordPress REST search for both post
 * types, interleaved by relevance; falls back to the site's own search page if the API is unavailable.
 */
export async function search(query: string): Promise<OnlineTitle[]> {
  const q = query.trim();
  if (!q) return [];
  const base = MIRRORS[0];
  const api = (type: string) => `${base}/wp-json/wp/v2/${type}?search=${encodeURIComponent(q)}&per_page=20&_embed=wp:featuredmedia`;
  try {
    const [posts, series] = await Promise.all([siteJson<any[]>(api('posts')), siteJson<any[]>(api('series')).catch(() => [])]);
    const a = fromWp(posts);
    const b = fromWp(series);
    const out: OnlineTitle[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (b[i]) out.push(b[i]);
      if (a[i]) out.push(a[i]);
    }
    return out;
  } catch {
    const url = `${base}/?s=${encodeURIComponent(q)}`;
    const html = await getPage(url, (h) => parseSearchPage(h, url).length > 0 || /search-no-results|nothing found|نتیجه‌ای/i.test(h), 'search');
    return parseSearchPage(html, url);
  }
}
export { setAllowExpiredCerts } from './http';
