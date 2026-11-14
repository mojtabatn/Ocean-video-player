import { app, BrowserWindow, session } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Looks like desktop Chrome: some site firewalls block "Electron" user agents and non-browser clients. */
export const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

const debug = (...a: unknown[]) => process.env.OCEAN_DEBUG && console.log('[site]', ...a);

// ---------- Sessions ----------

/**
 * The user's Film2Media account. The site shows content only to signed-in users, so every page request
 * goes through this persistent session (its cookies survive restarts, like a browser profile). Uses
 * Chromium's network stack, so Windows proxy / VPN settings apply exactly like in Chrome.
 */
let accountSession: Electron.Session | null = null;
/** Last requests to the site with the names (never values) of the cookies they carried — for diagnostics. */
const sentLog: string[] = [];
function account() {
  if (!accountSession) {
    accountSession = session.fromPartition('persist:f2m-account');
    accountSession.setUserAgent(CHROME_UA, 'fa-IR,fa,en-US,en');
    accountSession.webRequest.onBeforeSendHeaders((d, cb) => {
      if (/tejaratban|127\.0\.0\.1:8766/.test(d.url) && /^(mainFrame|other|xhr)$/.test(d.resourceType)) {
        const names = (d.requestHeaders.Cookie ?? '').split(';').map((c) => c.split('=')[0].trim()).filter(Boolean);
        sentLog.push(`${new Date().toISOString()} ${d.resourceType} ${d.method} ${d.url}  cookies: ${names.join(', ') || '(none)'}`);
        if (sentLog.length > 30) sentLog.shift();
      }
      cb({ requestHeaders: d.requestHeaders });
    });
  }
  return accountSession;
}

/** Cookie-less session for the download servers (they need no account). */
let guestSession: Electron.Session | null = null;
function guest() {
  if (!guestSession) {
    guestSession = session.fromPartition('site-guest'); // in-memory
    guestSession.setUserAgent(CHROME_UA, 'fa-IR,fa,en-US,en');
  }
  return guestSession;
}

/** Older versions kept site cookies in another persistent session; remove them. */
export function forgetOldSiteCookies() {
  session.fromPartition('persist:site').clearStorageData().catch(() => {});
}

// ---------- Account state ----------

/** `report`: diagnostics file written when the site rejected the session. */
export type AccountStatus = { signedIn: boolean; user?: string; expired?: boolean; report?: string };

let siteBase = 'https://www.tejaratban.top';
let expired = false;
let lastReport: string | undefined;
const listeners = new Set<(s: AccountStatus) => void>();

export function setSiteBase(base: string) {
  siteBase = base.replace(/\/$/, '');
}

export function onAccountChange(fn: (s: AccountStatus) => void) {
  listeners.add(fn);
}

async function loginCookie() {
  const cookies = await account().cookies.get({ url: siteBase + '/' });
  return cookies.find((c) => c.name.startsWith('wordpress_logged_in'));
}

/**
 * The site's sign-in form has no "remember me", so its cookies may be session cookies that disappear when the
 * app quits. Keep them like a browser profile would: re-store session cookies with an expiry — the one
 * written inside the WordPress login cookie ("user|expiration|token|hmac") or 14 days.
 */
async function keepCookies() {
  const s = account();
  const cookies = await s.cookies.get({ url: siteBase + '/' });
  const wp = cookies.find((c) => c.name.startsWith('wordpress_logged_in'));
  const wpExpiry = wp ? Number(decodeURIComponent(wp.value).split('|')[1]) : NaN;
  const expirationDate = Number.isFinite(wpExpiry) && wpExpiry > Date.now() / 1000 ? wpExpiry : Date.now() / 1000 + 14 * 86400;
  for (const c of cookies) {
    if (!c.session) continue;
    await s.cookies
      .set({
        url: `${c.secure ? 'https' : new URL(siteBase).protocol.replace(':', '')}://${(c.domain ?? new URL(siteBase).host).replace(/^\./, '')}${c.path ?? '/'}`,
        name: c.name,
        value: c.value,
        ...(c.hostOnly ? {} : { domain: c.domain }),
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite,
        expirationDate,
      })
      .catch(() => {});
  }
  await s.cookies.flushStore().catch(() => {});
}

export async function accountStatus(): Promise<AccountStatus> {
  const c = await loginCookie().catch(() => undefined);
  // WordPress login cookie: "username|expiration|token|hmac" (URL-encoded).
  const user = c ? decodeURIComponent(c.value).split('|')[0] : undefined;
  return { signedIn: !!c, user, expired: !c && expired, report: !c ? lastReport : undefined };
}

async function notify() {
  const s = await accountStatus();
  listeners.forEach((fn) => fn(s));
}

/** Cookie metadata for diagnostics — names, scope and flags only, never values. */
async function cookieReport() {
  const cookies = await account().cookies.get({});
  return cookies.map(
    (c) =>
      `${c.name}  domain=${c.domain} path=${c.path} hostOnly=${c.hostOnly} secure=${c.secure} httpOnly=${c.httpOnly} sameSite=${c.sameSite} ` +
      (c.session ? 'session' : `expires=${new Date((c.expirationDate ?? 0) * 1000).toISOString()}`),
  );
}

/**
 * The site answered with its sign-in page through both a direct request and a real (hidden) page load:
 * the session is over. Save what happened, then forget the session quietly.
 */
async function sessionEnded(pages: Record<string, string>) {
  const note = headerNote(['Cookies in the account session:', ...(await cookieReport()), '', 'Requests sent to the site:', ...sentLog]);
  lastReport = await dump('session', Object.fromEntries(Object.entries(pages).map(([k, v]) => [k, note + v]))).catch(() => undefined);
  expired = true;
  await account().clearStorageData({ storages: ['cookies'] }).catch(() => {});
  await notify();
}

export async function signOut() {
  expired = false;
  lastReport = undefined;
  await account().clearStorageData().catch(() => {});
  await notify();
}

/**
 * Opens the site's own sign-in page (username, password and captcha are handled by the site; Ocean never
 * sees them). Resolves true once the WordPress login cookie appears, false if the window is closed first.
 */
export function signIn(parent?: BrowserWindow | null, page: 'login' | 'register' = 'login'): Promise<boolean> {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 520,
      height: 760,
      parent: parent ?? undefined,
      modal: !!parent,
      title: page === 'register' ? 'Create account — Film2Media' : 'Sign in — Film2Media',
      autoHideMenuBar: true,
      backgroundColor: '#0f0f0f',
      webPreferences: { session: account(), sandbox: true },
    });
    let done = false;
    const finish = async (ok: boolean) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      // close() (not destroy()) so a modal child hands input back to its parent; re-enable it explicitly too.
      if (!win.isDestroyed()) win.close();
      if (parent && !parent.isDestroyed()) {
        parent.setEnabled(true);
        parent.focus();
      }
      if (ok) {
        expired = false;
        lastReport = undefined;
        await keepCookies();
      }
      await notify();
      resolve(ok);
    };
    // Once the login cookie exists, let the site finish whatever follows (redirects, more cookies) before
    // closing the window: wait until it stops loading, plus a short grace period.
    let seen = false;
    const timer = setInterval(async () => {
      if (seen || !(await loginCookie().catch(() => undefined))) return;
      seen = true;
      const settle = () => setTimeout(() => finish(true), 2000);
      if (!win.isDestroyed() && win.webContents.isLoading()) win.webContents.once('did-stop-loading', settle);
      else settle();
    }, 800);
    win.on('closed', () => finish(false));
    win.loadURL(siteBase + (page === 'register' ? '/profile/?action=register' : '/profile/'), { userAgent: CHROME_UA });
  });
}

// ---------- Diagnostics ----------

export const debugDir = () => path.join(app.getPath('userData'), 'diagnostics');

/** Saves what the site returned, so a failure can be inspected. Returns the file path. */
async function dump(name: string, parts: Record<string, string>) {
  const dir = debugDir();
  await fs.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let first = '';
  for (const [k, v] of Object.entries(parts)) {
    if (!v) continue;
    const file = path.join(dir, `${name}-${k}-${stamp}.html`);
    await fs.writeFile(file, v, 'utf8');
    first ||= file;
  }
  return first;
}

/** Error that carries the path of the saved diagnostic page (shown as "Show file" in the UI). */
export class SiteError extends Error {
  constructor(message: string, readonly file?: string) {
    super(`${message}${file ? ` [file:${file}]` : ''}`);
  }
}

export const SIGNED_OUT = 'Sign in to Film2Media in Settings to watch online.';

/** The theme answers with a sign-in form (#auth-wrap) instead of content when it wants a signed-in user. */
export const isLoginWall = (html: string) => html.includes('id="auth-wrap"') && !html.includes('id="siteBody"');

const headerNote = (lines: string[]) => `<!-- Ocean diagnostics\n${lines.join('\n').replace(/--/g, '- -')}\n-->\n`;

// ---------- Fetching pages ----------

/**
 * Fetches a site page as the signed-in user. `isUsable` decides whether the HTML actually contains what we
 * need (titles / download links). First a normal request; if that is not usable (a JavaScript challenge or
 * content that appears only after scripts run), the page is rendered in a hidden window of the same session.
 * A sign-in page means the session ended: the app quietly switches to signed-out.
 */
/** Set once a direct request got the sign-in page while a real page load worked: then skip direct requests. */
let preferPageLoad = false;

export async function getPage(url: string, isUsable: (html: string) => boolean, name: string): Promise<string> {
  if (!(await loginCookie().catch(() => undefined))) throw new SiteError(SIGNED_OUT);

  const seen: Record<string, string> = {};
  let fetchProblem = '';
  if (!preferPageLoad) try {
    const res = await account().fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'fa-IR,fa;q=0.9,en;q=0.8' },
    });
    const html = await res.text();
    seen.fetch = headerNote([`GET ${url}`, `status ${res.status}`, ...[...res.headers.entries()].map(([k, v]) => `${k}: ${v}`)]) + html;
    if (res.ok && isUsable(html)) {
      keepCookies(); // the site may have refreshed its cookies
      return html;
    }
    // A sign-in page here is not proof the session ended: direct requests may lack cookies a real page load
    // sends (e.g. SameSite=Strict). The page load below decides.
    fetchProblem = res.ok ? (isLoginWall(html) ? 'sign-in page' : 'content not found') : `HTTP ${res.status}`;
    debug('fetch', url, res.status, html.length, fetchProblem);
  } catch (e) {
    if (e instanceof SiteError) throw e;
    fetchProblem = (e as Error).message;
  }

  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    paintWhenInitiallyHidden: true,
    webPreferences: { session: account(), javascript: true, sandbox: true, backgroundThrottling: false },
  });
  let rendered = '';
  let loadError = '';
  try {
    win.webContents.on('did-fail-load', (_e, code, desc, _u, isMain) => {
      if (isMain && code !== -3) loadError = `${desc} (${code})`;
    });
    await win.loadURL(url, { userAgent: CHROME_UA }).catch(() => {});
    // Challenge pages reload themselves and lazy content appears on scroll: poll for up to ~30 s.
    for (let i = 0; i < 60; i++) {
      rendered = await win.webContents
        .executeJavaScript(
          `(() => { window.scrollTo(0, (window.scrollY + 700) % Math.max(1, document.body ? document.body.scrollHeight : 1));
                    window.dispatchEvent(new Event('scroll')); return document.documentElement.outerHTML; })()`,
        )
        .catch(() => '');
      if (isUsable(rendered)) {
        if (fetchProblem === 'sign-in page') preferPageLoad = true;
        keepCookies();
        return rendered;
      }
      if (isLoginWall(rendered) && i > 6) break;
      if (loadError && i > 4) break;
      await new Promise((r) => setTimeout(r, 500));
    }
  } finally {
    win.destroy();
  }

  if (isLoginWall(rendered)) {
    await sessionEnded({ ...seen, rendered });
    throw new SiteError(SIGNED_OUT);
  }
  const file = await dump(name, { ...seen, rendered }).catch(() => '');
  if (loadError && !rendered) throw new SiteError(`Couldn’t reach the site: ${loadError}`, file);
  throw new SiteError(`The page didn’t contain the expected content (${fetchProblem}).`, file);
}

/** ocean-img://i/?u=<url>: posters fetched through the account session (same cookies and user agent). */
export async function handleImage(request: Request): Promise<Response> {
  const target = new URL(request.url).searchParams.get('u');
  if (!target || !/^https?:\/\//i.test(target)) return new Response('Bad request', { status: 400 });
  try {
    // Note: a manual Referer header makes Chromium's net stack reject the request (ERR_BLOCKED_BY_CLIENT).
    // Time-limited: a stalled image server must not leave the card blank forever (it falls back to the title).
    // (session.fetch does not honour an abort signal, so race it against a timer.)
    const res = await Promise.race([
      account().fetch(target, { credentials: 'include', headers: { Accept: 'image/avif,image/webp,image/*,*/*' } }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out')), 15000)),
    ]);
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('image/')) return new Response('Not an image', { status: 502 });
    return new Response(await res.arrayBuffer(), { headers: { 'Content-Type': type, 'Cache-Control': 'max-age=86400' } });
  } catch (e) {
    debug('img error', target, (e as Error).message);
    return new Response('Unreachable', { status: 502 });
  }
}

/** A response that carries the file itself (not an error or a web page). */
const isMedia = (res: Response) => res.status === 206 || (res.ok && !/text\/html|text\/plain/i.test(res.headers.get('content-type') ?? ''));

/** Download hosts that only answered the signed-in session; later requests go there directly. */
const accountHosts = new Set<string>();

/**
 * Request to a download server. First cookie-less (Chromium network stack, system proxy); if the server does
 * not hand out the file that way (error status or a web page), retry once with the signed-in account session,
 * since some servers only serve visitors who are logged in to the site.
 */
export async function originFetch(url: string, init: RequestInit = {}) {
  const host = new URL(url).hostname;
  const viaAccount = () => account().fetch(url, { credentials: 'include', cache: 'no-store', ...init });
  if (accountHosts.has(host)) return viaAccount();
  let first: Response | null = null;
  let firstError: unknown = null;
  try {
    first = await guest().fetch(url, { credentials: 'omit', cache: 'no-store', ...init });
    if (isMedia(first)) return first;
  } catch (e) {
    firstError = e;
  }
  try {
    const alt = await viaAccount();
    if (isMedia(alt)) {
      first?.body?.cancel().catch(() => {});
      accountHosts.add(host);
      debug('download host needs the account session:', host);
      return alt;
    }
    alt.body?.cancel().catch(() => {});
  } catch {
    /* keep the first answer */
  }
  if (first) return first;
  throw firstError;
}

/**
 * Human-readable reason a download server did not deliver the file. The server's answer is saved under
 * diagnostics so it can be inspected; the message ends with "[file:<path>]" in that case.
 */
export async function describeOriginFailure(url: string, res: Response | null, error?: unknown): Promise<string> {
  let host = url;
  try {
    host = new URL(url).hostname;
  } catch {
    /* keep the raw url */
  }
  if (!res) {
    const msg = String((error as Error)?.message ?? error ?? 'no answer').replace(/^net::/, '');
    return `Could not reach the download server (${host}): ${msg}`;
  }
  const type = res.headers.get('content-type') ?? '';
  let file = '';
  try {
    const text = (await res.text()).slice(0, 20000);
    await fs.mkdir(debugDir(), { recursive: true });
    file = path.join(debugDir(), `download-${host}-${Date.now()}.txt`);
    const headers = [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n');
    await fs.writeFile(file, `URL: ${url}\nStatus: ${res.status} ${res.statusText}\n${headers}\n\n${text}`);
  } catch {
    file = '';
  }
  const what =
    res.status >= 400
      ? `answered ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`
      : /html|text/i.test(type)
        ? 'sent a web page instead of the video'
        : `answered ${res.status} without the file size`;
  return `The download server (${host}) ${what}.${file ? ` [file:${file}]` : ''}`;
}

/** JSON from the site (WordPress REST API) through the account session. */
export async function siteJson<T>(url: string): Promise<T> {
  const res = await account().fetch(url, { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.includes('json')) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}
