// Pure HTML parsing for tejaratban.top (Film2Media theme). No Electron imports, so tests can run it on fixtures.
import { parse, type HTMLElement } from 'node-html-parser';
import type { OnlineDetails, OnlineEpisode, OnlineSource, OnlineTitle } from '../../shared/media';

const decode = (s: string) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").trim();

/** Stable id from the page URL: ".../62388/the-odyssey-2026/" → "62388", ".../series/mobland/" → "series:mobland". */
export function idFromUrl(url: string) {
  const u = new URL(url);
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts[0] === 'series') return `series:${parts[1]}`;
  return /^\d+$/.test(parts[0]) ? parts[0] : parts.join('/');
}

/** Real image URL: lazy-loaders (LiteSpeed, Splide) keep it in data-* while `src` holds a placeholder. */
export function imgUrl(img: HTMLElement | null | undefined): string | undefined {
  if (!img) return undefined;
  const candidates = [
    img.getAttribute('data-src'),
    img.getAttribute('data-lazy-src'),
    img.getAttribute('data-splide-lazy'),
    img.getAttribute('data-original'),
    img.getAttribute('src'),
    (img.getAttribute('data-srcset') ?? img.getAttribute('srcset'))?.split(',')[0]?.trim().split(' ')[0],
  ];
  return candidates.find((u): u is string => !!u && !u.startsWith('data:') && /^(https?:)?\/\//.test(u.trim()))?.trim();
}

/** Title pages look like /62388/slug/ (movies) or /series/slug/. */
const TITLE_PATH = /^\/(\d+\/[^/]+|series\/[^/]+)\/?$/;

const realSlides = (container: HTMLElement | null) =>
  container ? container.querySelectorAll('.splide__slide').filter((s) => !/splide__slide--clone/.test(s.getAttribute('class') ?? '')) : [];

/**
 * The homepage hero slider (#cover-suggested-movies) and its thumbnail strip (#suggested-thumbnails)
 * list the same titles in the same order; the strip has the 180×280 posters the Ocean home screen uses.
 */
export function parseTrending(html: string, baseUrl: string): OnlineTitle[] {
  const root = parse(html);
  const host = new URL(baseUrl).host;
  const covers = realSlides(root.querySelector('#cover-suggested-movies'));
  const thumbs = realSlides(root.querySelector('#suggested-thumbnails'));
  const out: OnlineTitle[] = [];
  const seen = new Set<string>();
  covers.forEach((slide, i) => {
    const links = slide.querySelectorAll('a[href]').map((a) => ({ a, url: new URL(a.getAttribute('href')!, baseUrl) }));
    const link = links.find(({ url }) => TITLE_PATH.test(url.pathname) && url.host.replace(/^www\./, '') === host.replace(/^www\./, '')) ?? links[0];
    if (!link) return;
    const pageUrl = link.url.toString();
    if (seen.has(pageUrl)) return;
    seen.add(pageUrl);
    const coverImg = slide.querySelector('.cover img') ?? slide.querySelector('img');
    const title = decode(slide.querySelector('h2, h3')?.text ?? link.a.getAttribute('title') ?? link.a.text ?? '');
    const poster = imgUrl(thumbs[i]?.querySelector('img')) ?? imgUrl(coverImg) ?? '';
    // Year is in the calendar badge; some slides only have it in the title ("Other Mommy 2026").
    const year = /\b(19|20)\d{2}\b/.exec(slide.querySelector('.content span')?.text ?? '')?.[0] ?? /\b(19|20)\d{2}\b/.exec(title)?.[0];
    const imdb = slide.querySelector('strong')?.text.trim();
    out.push({
      id: idFromUrl(pageUrl),
      title: title || decode(coverImg?.getAttribute('alt') ?? ''),
      persianTitle: decode(coverImg?.getAttribute('alt') ?? ''),
      poster,
      backdrop: imgUrl(coverImg),
      kind: link.url.pathname.startsWith('/series/') ? 'series' : 'movie',
      pageUrl,
      year,
      imdb: imdb && /^\d+(\.\d+)?$/.test(imdb) ? imdb : undefined,
    });
  });
  return out.filter((t) => t.title);
}

// ---------- Title pages (download boxes) ----------


const ORDINALS = ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم', 'هفتم', 'هشتم', 'نهم', 'دهم', 'یازدهم', 'دوازدهم', 'سیزدهم', 'چهاردهم', 'پانزدهم'];
const faDigits = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

function groupOf(listClass: string, title: string): OnlineSource['group'] {
  if (/\bdubbled\b/.test(listClass) || /دوبله/.test(title)) return 'dubbed';
  if (/\bhardsub\b/.test(listClass) || /چسبیده/.test(title)) return 'hardsub';
  if (/\bsoftsub\b/.test(listClass) || /زیرنویس/.test(title)) return 'softsub';
  return 'other';
}

/** Vertical resolution from a quality string ("BluRay 4K 2160p 10bit HDR" → 2160). */
export function heightOf(quality: string) {
  const m = /(\d{3,4})p\b/i.exec(quality);
  if (m) return Number(m[1]);
  if (/\b4k\b|uhd/i.test(quality)) return 2160;
  return 0;
}

/** Text after a "label :" span inside a row, e.g. "انکودر : PSA" → "PSA". */
function field(row: ReturnType<typeof parse>, label: string) {
  const span = row.querySelectorAll('span').find((s) => s.text.includes(label));
  const text = span?.parentNode?.text.replace(span.text, '').replace(/\s+/g, ' ').trim();
  return text && text !== '—' && text !== '&mdash;' && text.toLowerCase() !== 'unknown' ? decode(text) : undefined;
}

function seasonFromHeading(text: string) {
  const m = /فصل\s+(\S+)/.exec(text);
  if (!m) return undefined;
  const n = Number(faDigits(m[1]));
  if (Number.isFinite(n) && n > 0) return n;
  const i = ORDINALS.indexOf(m[1].replace(/[^؀-ۿ]/g, ''));
  return i >= 0 ? i + 1 : undefined;
}

/** Movie and series pages share `.download-list` boxes; series nest them in `.download-season`. */
export function parseDetails(html: string, title: OnlineTitle): OnlineDetails {
  const root = parse(html);
  const sources: OnlineSource[] = [];
  const episodes = new Map<string, OnlineEpisode>();

  const seasonBoxes = root.querySelectorAll('.download-season');
  const containers = seasonBoxes.length ? seasonBoxes : [root];

  containers.forEach((box, boxIndex) => {
    const heading = box === root ? '' : (box.querySelector('[data-bs-target]')?.text ?? '');
    const headingSeason = seasonFromHeading(heading);
    for (const list of box.querySelectorAll('.download-list')) {
      const groupTitle = decode(list.querySelector('.title')?.text ?? '');
      const group = groupOf(list.getAttribute('class') ?? '', groupTitle + ' ' + heading);
      for (const li of list.querySelectorAll(':scope > ul > li')) {
        const quality = decode(li.querySelector('.text')?.text ?? '');
        if (!quality) continue;
        const base = {
          label: quality,
          height: heightOf(quality),
          group,
          groupTitle,
          encoder: field(li, 'انکودر'),
          note: field(li, 'توضیحات'),
          size: field(li, 'حجم'),
        };
        const episodeLinks = li.querySelectorAll('.series-downloaditems a.btn-default[href]');
        if (!episodeLinks.length) {
          // Movie row: the "دانلود مستقیم" link is the file itself.
          const direct = li.querySelectorAll('a[href]').find((a) => /\.(mkv|mp4|avi|m4v|webm|ts)(\?|$)/i.test(a.getAttribute('href') ?? ''));
          if (direct) sources.push({ ...base, url: decode(direct.getAttribute('href')!) });
          continue;
        }
        episodeLinks.forEach((a, i) => {
          const url = decode(a.getAttribute('href')!);
          const se = /S(\d{1,2})E(\d{1,3})/i.exec(decodeURIComponent(url));
          const season = se ? Number(se[1]) : (headingSeason ?? boxIndex + 1);
          const epText = /(\d+)/.exec(faDigits(a.text));
          const episode = se ? Number(se[2]) : epText ? Number(epText[1]) : i + 1;
          const key = `${season}:${episode}`;
          if (!episodes.has(key)) episodes.set(key, { season, episode, sources: [] });
          episodes.get(key)!.sources.push({ ...base, url });
        });
      }
    }
  });

  // The page header links to IMDb with the rating: <a href="https://www.imdb.com/title/tt…"><strong>8.4</strong>/10</a>
  const imdbLink = root.querySelector('a[href*="imdb.com/title/tt"]');
  const imdbId = /tt\d+/.exec(imdbLink?.getAttribute('href') ?? '')?.[0];
  const imdbRating = imdbLink?.querySelector('strong')?.text.trim();
  return {
    title: { ...title, imdb: title.imdb ?? (imdbRating && /^\d+(\.\d+)?$/.test(imdbRating) ? imdbRating : undefined), imdbId },
    sources,
    episodes: [...episodes.values()].sort((a, b) => a.season - b.season || a.episode - b.episode),
  };
}

export { compareSources } from '../../shared/media';

// ---------- Search ----------

/** "دانلود فیلم Kidnapping My Own Daughter 2026 بدون سانسور …" → "Kidnapping My Own Daughter 2026". */
export function englishTitle(headline: string) {
  const runs = decode(headline.replace(/<[^>]+>/g, '')).match(/[A-Za-z0-9][A-Za-z0-9 :'’&.,!?\-–/()]*[A-Za-z0-9)!?]/g) ?? [];
  const best = runs.sort((a, b) => b.length - a.length)[0];
  return best?.trim() || decode(headline);
}

type WpItem = {
  id: number;
  type: string;
  slug: string;
  link: string;
  title: { rendered: string };
  _embedded?: { 'wp:featuredmedia'?: { source_url?: string; media_details?: { sizes?: Record<string, { source_url: string }> } }[] };
};

/** WordPress REST results (posts = movies, series) → home-screen titles. */
export function fromWp(items: WpItem[]): OnlineTitle[] {
  return items.map((p) => {
    const media = p._embedded?.['wp:featuredmedia']?.[0];
    const headline = decode(p.title.rendered);
    const title = englishTitle(headline);
    return {
      id: p.type === 'series' ? `series:${p.slug}` : String(p.id),
      title,
      persianTitle: headline,
      poster: media?.media_details?.sizes?.thumbnail?.source_url ?? media?.source_url ?? '',
      kind: p.type === 'series' ? 'series' : 'movie',
      pageUrl: p.link,
      year: /\b(19|20)\d{2}\b/.exec(title)?.[0],
    };
  });
}

/** Fallback when the REST API is unavailable: title links with a poster on the site's search page. */
export function parseSearchPage(html: string, baseUrl: string): OnlineTitle[] {
  const root = parse(html);
  const main = root.querySelector('#siteBody') ?? root;
  const out: OnlineTitle[] = [];
  const seen = new Set<string>();
  for (const a of main.querySelectorAll('a[href]')) {
    const url = new URL(a.getAttribute('href')!, baseUrl);
    if (!TITLE_PATH.test(url.pathname) || seen.has(url.toString())) continue;
    let box: HTMLElement | null = a;
    for (let i = 0; i < 4 && box && !box.querySelector('img'); i++) box = box.parentNode as HTMLElement | null;
    const img = box?.querySelector('img');
    if (!img) continue;
    seen.add(url.toString());
    const headline = decode(a.getAttribute('title') ?? img.getAttribute('alt') ?? a.text);
    const title = englishTitle(headline);
    out.push({
      id: idFromUrl(url.toString()),
      title,
      persianTitle: headline,
      poster: imgUrl(img) ?? '',
      kind: url.pathname.startsWith('/series/') ? 'series' : 'movie',
      pageUrl: url.toString(),
      year: /\b(19|20)\d{2}\b/.exec(title)?.[0],
    });
  }
  return out;
}
