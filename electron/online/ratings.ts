// IMDb ratings for home-screen titles that the site's slider did not rate (and for search results).
// Source: OMDb API (official IMDb ratings), looked up by IMDb id when the site gave one, else by title + year.
// Results are cached on disk for a few days so the shared daily request quota is barely touched.
import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { OnlineTitle } from '../../shared/media';

declare const __OMDB_KEY__: string;
const OMDB_KEY = typeof __OMDB_KEY__ === 'string' ? __OMDB_KEY__ : '';
const OMDB = process.env.OCEAN_OMDB_URL ?? 'https://www.omdbapi.com/';
const FOUND_TTL = 3 * 86400_000;
const MISSING_TTL = 86400_000;

type Entry = { rating: string | null; imdbId?: string; at: number };
let cache: Record<string, Entry> | null = null;
let saveTimer: NodeJS.Timeout | undefined;
const file = () => path.join(app.getPath('userData'), 'ratings-cache.json');

async function load() {
  if (!cache) cache = await fs.readFile(file(), 'utf8').then(JSON.parse).catch(() => ({}));
  return cache!;
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(file(), JSON.stringify(cache)).catch(() => {}), 1000);
}

/** IMDb ids the site printed on title pages (filled in by the title-page parser). */
const knownIds = new Map<string, string>();
export function rememberImdbId(titleId: string, imdbId: string) {
  knownIds.set(titleId, imdbId);
}

/** "Other Mommy 2026" → { name: "Other Mommy", year: "2026" }; "Underground/Yeralti" → "Underground". */
function query(t: OnlineTitle) {
  const year = t.year ?? /\b(19|20)\d{2}\b/.exec(t.title)?.[0];
  const name = t.title.replace(/\b(19|20)\d{2}\b/, '').split('/')[0].replace(/\s+/g, ' ').trim();
  return { name, year };
}

async function omdb(params: Record<string, string>) {
  const url = `${OMDB}?${new URLSearchParams({ ...params, apikey: OMDB_KEY })}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`OMDb ${res.status}`);
  return (await res.json()) as { Response: string; imdbRating?: string; imdbID?: string; Error?: string };
}

async function lookup(t: OnlineTitle): Promise<Entry> {
  const id = knownIds.get(t.id);
  const type = t.kind === 'series' ? 'series' : 'movie';
  let r = id ? await omdb({ i: id }) : null;
  if (!r || r.Response !== 'True') {
    const { name, year } = query(t);
    r = await omdb({ t: name, type, ...(year ? { y: year } : {}) });
    // A series' year on the site is often the latest season's; retry without it.
    if (r.Response !== 'True' && year) r = await omdb({ t: name, type });
  }
  const rating = r.Response === 'True' && r.imdbRating && r.imdbRating !== 'N/A' ? r.imdbRating : null;
  return { rating, imdbId: r.imdbID, at: Date.now() };
}

/** Ratings by title id for titles that have none yet. Missing / unknown → null. */
export async function ratings(titles: OnlineTitle[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  if (!OMDB_KEY) return out;
  const c = await load();
  const todo = titles.filter((t) => {
    if (t.imdb) return false;
    const e = c[t.id];
    if (e && Date.now() - e.at < (e.rating ? FOUND_TTL : MISSING_TTL)) {
      out[t.id] = e.rating;
      return false;
    }
    return true;
  });
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const t = todo[next++];
      try {
        c[t.id] = await lookup(t);
        out[t.id] = c[t.id].rating;
      } catch {
        /* network / quota: try again next time */
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, todo.length) }, worker));
  save();
  return out;
}
