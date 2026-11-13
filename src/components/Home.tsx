import { useEffect, useRef, useState } from 'react';
import type { OnlineTitle } from '../../shared/media';
import logo from '../assets/logo.svg';
import { useAccount } from '../lib/account';
import { ocean } from '../lib/bridge';

type Props = { onPick: (t: OnlineTitle) => void; onOpenFile: () => void; onOpenSettings: () => void };

const CARD = 180;
const GAP = 16;

/** First view (Figma: "Property 1 = Default - Select"). */
export function Home({ onPick, onOpenFile, onOpenSettings }: Props) {
  const [titles, setTitles] = useState<OnlineTitle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rail = useRef<HTMLDivElement>(null);

  // Search covers the whole site archive; results take the place of the trending items.
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OnlineTitle[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchSeq = useRef(0);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || !ocean) {
      setResults(null);
      setSearching(false);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const t = window.setTimeout(() => {
      ocean!
        .searchSite(q)
        .then((r) => seq === searchSeq.current && setResults(r))
        .catch(() => seq === searchSeq.current && setResults([]))
        .finally(() => seq === searchSeq.current && setSearching(false));
    }, 450);
    return () => window.clearTimeout(t);
  }, [query]);

  const load = (force = false) => {
    setError(null);
    if (!ocean) {
      setTitles([]);
      return;
    }
    ocean
      .trending(force)
      .then((r) => {
        setTitles(r.titles);
        if (r.stale) setError('Showing the last saved list (offline)');
      })
      .catch((e) => {
        setTitles((t) => t ?? []);
        setError(String(e?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
      });
  };

  // The site shows content only to signed-in users: the whole "Trending Now" section stays hidden
  // until the user signs in (Settings → Film2Media account). Then: cached list first (instant), the live
  // slider, and a refresh every 30 min since the site changes it daily.
  const account = useAccount();
  const signedIn = !!account?.signedIn;
  useEffect(() => {
    if (!signedIn) {
      setTitles(null);
      setError(null);
      return;
    }
    ocean?.cachedTrending().then((c) => c?.titles.length && setTitles((t) => (t?.length ? t : c.titles)));
    load();
    const timer = window.setInterval(() => load(true), 30 * 60 * 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  // Start one card in, so the previous poster peeks in from the left as in the design (trending only;
  // search results start at the first one).
  const shown = results ?? titles;

  // IMDb ratings the site did not give (OMDb, cached), filled in quietly after the posters show.
  const [ratings, setRatings] = useState<Record<string, string | null>>({});
  useEffect(() => {
    const missing = (shown ?? []).filter((t) => !t.imdb && !(t.id in ratings));
    if (!missing.length || !ocean) return;
    ocean.imdbRatings(missing).then((r) => setRatings((cur) => ({ ...cur, ...r })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  useEffect(() => {
    if (!rail.current) return;
    rail.current.scrollLeft = !results && titles && titles.length > 1 ? CARD + GAP : 0;
  }, [titles, results]);

  // Drag to scroll: follows the pointer, then snaps to the nearest poster (with a flick carrying further).
  const drag = useRef({ active: false, moved: false, startX: 0, startScroll: 0, lastX: 0, lastT: 0, velocity: 0, suppressClick: false, id: -1 });
  const dragStart = (e: React.PointerEvent) => {
    if (e.button !== 0 || !rail.current) return;
    drag.current = { ...drag.current, active: true, moved: false, startX: e.clientX, startScroll: rail.current.scrollLeft, lastX: e.clientX, lastT: performance.now(), velocity: 0, id: e.pointerId };
  };
  const dragMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = rail.current;
    if (!d.active || !el) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < 6) return;
    if (!d.moved) {
      d.moved = true;
      el.setPointerCapture(d.id);
      el.classList.add('is-dragging');
    }
    const now = performance.now();
    d.velocity = (e.clientX - d.lastX) / Math.max(1, now - d.lastT);
    d.lastX = e.clientX;
    d.lastT = now;
    el.scrollLeft = d.startScroll - dx;
  };
  const dragEnd = () => {
    const d = drag.current;
    const el = rail.current;
    d.active = false;
    if (!d.moved || !el) return;
    d.suppressClick = true;
    window.setTimeout(() => (d.suppressClick = false), 50);
    const step = CARD + GAP;
    const target = Math.round((el.scrollLeft - d.velocity * 250) / step) * step;
    el.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    window.setTimeout(() => el.classList.remove('is-dragging'), 450);
  };

  const scroll = (dir: 1 | -1) => {
    const el = rail.current;
    if (!el) return;
    const step = Math.max(1, Math.floor((el.clientWidth - 124) / (CARD + GAP))) * (CARD + GAP);
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
  };

  const skeleton = (shown === null || shown.length === 0) && !(results && !searching);
  const noResults = !!results && results.length === 0 && !searching;

  return (
    <div className="home">
      <div className="home__hero">
        <button className="home__logo" onClick={onOpenFile} title="Open a file (Ctrl + O)">
          <img src={logo} width={74} height={80} alt="Ocean" />
        </button>
        <h1 className="home__welcome">Welcome to OCEAN!</h1>
        <p className="home__tagline">new style of video players</p>
      </div>

      {account && !signedIn && (
        <p className="home__signin-hint">
          To see new movies and watch online, go to{' '}
          <button className="home__signin-link" onClick={onOpenSettings}>
            Settings › Account
          </button>{' '}
          and sign in.
        </p>
      )}
      {signedIn && (
        <section className="home__section">
          <header className="home__head">
            <h2 className="home__title" dir="auto">{results || searching ? `Results for “${query.trim()}”` : 'Trending Now'}</h2>
            {!results && !searching && <span className="home__subtitle">
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                <path d="M2 1.2v7.6c0 .5.5.8.9.5l6-3.8c.4-.2.4-.8 0-1L2.9.7C2.5.4 2 .7 2 1.2Z" fill="currentColor" />
              </svg>
              Click a poster to watch online
            </span>}
            {error && (() => {
              // Errors may carry "[file:<path>]": the page the site returned, saved for diagnosis.
              const file = /\[file:(.+?)\]$/.exec(error)?.[1];
              const text = error.replace(/\s*\[file:.+?\]$/, '');
              return (
                <div className="home__error" title={text}>
                  <span className="home__error-text">{titles?.length ? text : `Couldn’t load titles: ${text}`}</span>
                  {file && (
                    <button className="home__retry" onClick={() => ocean?.showItemInFolder(file)}>
                      Show file
                    </button>
                  )}
                  <button className="home__retry" onClick={() => load(true)}>
                    Retry
                  </button>
                </div>
              );
            })()}
            <label className="home__search">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                <circle cx="9.2" cy="9.2" r="6.6" stroke="currentColor" strokeWidth="1.5" />
                <path d="M14.2 14.2l3.6 3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                value={query}
                placeholder="Search movies & series..."
                spellCheck={false}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setQuery('');
                }}
              />
              {query && (
                <button className="home__search-clear" aria-label="Clear search" onClick={() => setQuery('')}>
                  ×
                </button>
              )}
            </label>
            <div className="home__arrows">
              <button aria-label="Previous" onClick={() => scroll(-1)} disabled={skeleton}>
                <svg width="11" height="20" viewBox="0 0 11 20" fill="none">
                  <path d="M9.5 1.5L1.5 10l8 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button aria-label="Next" onClick={() => scroll(1)} disabled={skeleton}>
                <svg width="11" height="20" viewBox="0 0 11 20" fill="none">
                  <path d="M1.5 1.5l8 8.5-8 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </header>
          <div
            className="home__rail"
            ref={rail}
            onPointerDown={dragStart}
            onPointerMove={dragMove}
            onPointerUp={dragEnd}
            onPointerCancel={dragEnd}
            onClickCapture={(e) => {
              // A drag that ends over a poster must not open it.
              if (drag.current.suppressClick) {
                e.preventDefault();
                e.stopPropagation();
                drag.current.suppressClick = false;
              }
            }}
            onWheel={(e) => {
              // Mouse wheel scrolls the row sideways.
              if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) rail.current?.scrollBy({ left: e.deltaY, behavior: 'smooth' });
            }}
          >
            {noResults ? (
              <div className="home__empty">Nothing found for “{query.trim()}”.</div>
            ) : skeleton
              ? Array.from({ length: 10 }, (_, i) => <div key={i} className={`poster poster--skeleton ${shown === null || searching ? 'is-loading' : ''}`} />)
              : shown!.map((t) => (
                  <button key={t.id} className="poster" onClick={() => onPick(t)} aria-label={t.title}>
                    <img
                      src={ocean ? `ocean-img://i/?u=${encodeURIComponent(t.poster)}` : t.poster}
                      alt=""
                      loading="lazy"
                      draggable={false}
                      onError={(e) => e.currentTarget.parentElement?.classList.add('poster--noimage')}
                    />
                    <span className="poster__fallback" dir="auto">{t.title}</span>
                    <span className="poster__caption" dir="auto">
                      {t.title}
                      {(t.imdb ?? ratings[t.id]) && (
                        <span className="poster__meta">
                          <span className="imdb">IMDb</span>
                          <span className="poster__score">{t.imdb ?? ratings[t.id]}</span>
                        </span>
                      )}
                    </span>
                  </button>
                ))}
          </div>
        </section>
      )}
    </div>
  );
}
