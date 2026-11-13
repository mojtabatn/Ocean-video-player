import { app, BrowserWindow, dialog, ipcMain, protocol, screen, shell } from 'electron';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { Capabilities } from '../shared/media';
import * as engine from './engine';
import * as updater from './updater';
import * as mediaCache from './mediacache';
import * as subs from './opensubtitles';
import * as online from './online';
import { ratings } from './online/ratings';
import { accountStatus, forgetOldSiteCookies, handleImage, onAccountChange, signIn, signOut } from './online/http';
import type { OnlineTitle } from '../shared/media';

export const VIDEO_EXTENSIONS = [
  'mp4', 'm4v', 'mkv', 'webm', 'mov', 'ogv', 'ogg', 'avi', 'wmv', 'asf', 'flv', 'f4v', 'ts', 'm2ts', 'mts',
  'mpg', 'mpeg', 'vob', '3gp', '3g2', 'rm', 'rmvb', 'divx', 'xvid', 'mxf', 'dv', 'y4m',
  'mp3', 'm4a', 'aac', 'flac', 'wav', 'opus', 'oga', 'wma', 'ac3', 'dts', 'mka',
];
const SUBTITLE_EXTENSIONS = ['srt', 'vtt', 'ass', 'ssa', 'sub', 'smi'];

const MIME: Record<string, string> = {
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  mkv: 'video/x-matroska', ogv: 'video/ogg', ogg: 'video/ogg', avi: 'video/x-msvideo',
};

// Lets <video> stream local files with Range support so seeking works.
protocol.registerSchemesAsPrivileged([
  { scheme: 'ocean-media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } },
  { scheme: 'ocean-img', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'ocean-stream', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } },
]);

// Separate profile for automated tests.
if (process.env.OCEAN_USER_DATA) app.setPath('userData', process.env.OCEAN_USER_DATA);

// Exposes HTMLMediaElement.audioTracks so the Audio menu can switch tracks.
app.commandLine.appendSwitch('enable-blink-features', 'AudioVideoTracks');

let win: BrowserWindow | null = null;
let pendingFile: string | null = findFileArg(process.argv);

function findFileArg(argv: string[]): string | null {
  const isUrl = (a: string) => /^(https?|rtmp|rtsp):\/\//i.test(a);
  const arg = argv.slice(1).find((a) => !a.startsWith('-') && (isUrl(a) || VIDEO_EXTENSIONS.includes(ext(a))));
  if (!arg) return null;
  return isUrl(arg) ? arg : path.resolve(arg);
}

function ext(p: string) {
  return path.extname(p).slice(1).toLowerCase();
}

function mediaHandler(request: Request): Promise<Response> {
  const filePath = decodeURIComponent(new URL(request.url).pathname.slice(1));
  return fs.stat(filePath).then(
    (stat) => {
      const type = MIME[ext(filePath)] ?? 'application/octet-stream';
      const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') ?? '');
      if (!range) {
        const body = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
        return new Response(body, {
          status: 200,
          headers: { 'Content-Type': type, 'Content-Length': String(stat.size), 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' },
        });
      }
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      const body = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream;
      return new Response(body, {
        status: 206,
        headers: {
          'Content-Type': type,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
        },
      });
    },
    () => new Response('Not found', { status: 404 }),
  );
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 826,
    minWidth: 640,
    minHeight: 400,
    frame: false,
    backgroundColor: '#000000',
    title: 'Ocean',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win?.show());
  const send = (channel: string, ...args: unknown[]) => win?.webContents.send(channel, ...args);
  win.on('maximize', () => send('window:state', { maximized: true }));
  win.on('unmaximize', () => send('window:state', { maximized: false }));
  win.on('enter-full-screen', () => send('window:state', { fullscreen: true }));
  win.on('leave-full-screen', () => send('window:state', { fullscreen: false }));
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '../dist/index.html'));
}

function registerIpc() {
  const current = () => BrowserWindow.getFocusedWindow() ?? win;

  ipcMain.on('window:minimize', () => current()?.minimize());
  ipcMain.on('window:toggle-maximize', () => {
    const w = current();
    if (!w) return;
    if (w.isMaximized()) w.unmaximize();
    else w.maximize();
  });
  ipcMain.on('window:close', () => current()?.close());
  ipcMain.on('window:set-fullscreen', (_e, value: boolean) => current()?.setFullScreen(value));
  ipcMain.on('window:set-always-on-top', (_e, value: boolean) => current()?.setAlwaysOnTop(value, 'floating'));

  // Mini player: small always-on-top window in the bottom-right corner; restores previous bounds.
  let savedBounds: Electron.Rectangle | null = null;
  ipcMain.on('window:set-mini', (_e, mini: boolean, aspect: number) => {
    const w = current();
    if (!w) return;
    if (mini) {
      if (w.isFullScreen()) w.setFullScreen(false);
      if (w.isMaximized()) w.unmaximize();
      savedBounds = w.getBounds();
      const area = screen.getDisplayMatching(savedBounds).workArea;
      const width = 480;
      const height = Math.round(width / (aspect || 16 / 9));
      w.setMinimumSize(320, 180);
      w.setBounds({ x: area.x + area.width - width - 24, y: area.y + area.height - height - 24, width, height });
      w.setAlwaysOnTop(true, 'floating');
    } else {
      w.setMinimumSize(640, 400);
      if (savedBounds) w.setBounds(savedBounds);
      w.setAlwaysOnTop(false);
    }
  });

  ipcMain.handle('media:set-capabilities', (_e, c: Capabilities) => engine.setCapabilities(c));
  ipcMain.handle('media:open', (_e, input: string) => engine.open(input));
  ipcMain.handle('media:close', (_e, id: string) => engine.close(id));
  ipcMain.handle('media:cached', (_e, id: string) => engine.cached(id));
  ipcMain.handle('update:check', () => updater.checkForUpdate());
  ipcMain.handle('update:notes', () => updater.releaseNotes());
  ipcMain.handle('update:version', () => app.getVersion());
  ipcMain.handle('update:install', (e) => updater.downloadAndInstall((p) => e.sender.send('update:progress', p)));
  ipcMain.handle('cache:dir', () => mediaCache.cacheDir());
  ipcMain.handle('cache:choose-dir', () => mediaCache.chooseCacheDir(current()));
  ipcMain.handle('cache:reset-dir', () => mediaCache.resetCacheDir());
  ipcMain.handle('cache:size', () => mediaCache.cacheSize());
  ipcMain.handle('cache:clear', () => mediaCache.clearCache());
  ipcMain.handle('cache:set-limit', (_e, bytes: number) => {
    mediaCache.setCacheLimit(bytes);
    return mediaCache.enforceLimit();
  });
  ipcMain.handle('media:keyframe', (_e, id: string, t: number) => engine.keyframeBefore(id, t));
  ipcMain.handle('media:thumbnail', (_e, id: string, t: number, width: number) => engine.thumbnail(id, t, width));
  ipcMain.handle('media:extract-subtitle', (_e, id: string, index: number) => engine.extractSubtitle(id, index));
  ipcMain.handle('media:screenshot', async (_e, id: string, t: number, baseName: string) => {
    const dir = path.join(app.getPath('pictures'), 'Ocean');
    await fs.mkdir(dir, { recursive: true });
    const stamp = new Date(t * 1000).toISOString().substring(11, 19).replace(/:/g, '-');
    const out = path.join(dir, `${baseName.replace(/[\\/:*?"<>|]/g, '_')} ${stamp}.png`);
    return engine.screenshot(id, t, out);
  });
  ipcMain.on('shell:show-item', (_e, p: string) => shell.showItemInFolder(p));

  ipcMain.handle('subs:search', (_e, apiKey: string, opts: { query: string; languages: string; filePath?: string }) =>
    subs.search(apiKey, opts),
  );
  ipcMain.handle('online:trending', (_e, force?: boolean) => online.trending({ force }));
  ipcMain.handle('online:cached', () => online.cachedTrending());
  ipcMain.handle('account:status', () => accountStatus());
  ipcMain.handle('account:sign-in', (_e, page?: 'login' | 'register') => signIn(current(), page === 'register' ? 'register' : 'login'));
  ipcMain.handle('account:sign-out', () => signOut());
  onAccountChange((s) => BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('account:changed', s)));
  ipcMain.handle('online:ratings', (_e, titles: OnlineTitle[]) => ratings(titles));
  ipcMain.handle('online:search', (_e, q: string) => online.search(q));
  ipcMain.handle('online:sizes', (_e, urls: string[]) => online.sizes(urls));
  ipcMain.handle('online:details', (_e, t: OnlineTitle) => online.details(t));
  ipcMain.handle('subs:download', (_e, apiKey: string, fileId: number) => subs.download(apiKey, fileId));

  ipcMain.handle('app:take-pending-file', () => {
    const f = pendingFile;
    pendingFile = null;
    return f;
  });

  ipcMain.handle('dialog:open-video', async () => {
    const w = current();
    const res = await dialog.showOpenDialog(w!, {
      title: 'Open video',
      properties: ['openFile'],
      filters: [{ name: 'Media files', extensions: VIDEO_EXTENSIONS }, { name: 'All files', extensions: ['*'] }],
    });
    return res.canceled ? null : res.filePaths[0];
  });

  ipcMain.handle('dialog:open-subtitle', async () => {
    const w = current();
    const res = await dialog.showOpenDialog(w!, {
      title: 'Load subtitle',
      properties: ['openFile'],
      filters: [{ name: 'Subtitles', extensions: SUBTITLE_EXTENSIONS }, { name: 'All files', extensions: ['*'] }],
    });
    return res.canceled ? null : res.filePaths[0];
  });

  ipcMain.handle('dialog:save-subtitle', async (_e, suggestedName: string, contents: string) => {
    const w = current();
    const res = await dialog.showSaveDialog(w!, {
      title: 'Save subtitle',
      defaultPath: suggestedName,
      filters: [{ name: 'SubRip', extensions: ['srt'] }],
    });
    if (res.canceled || !res.filePath) return null;
    await fs.writeFile(res.filePath, contents, 'utf8');
    return res.filePath;
  });

  ipcMain.handle('fs:read-text', (_e, filePath: string) => fs.readFile(filePath));

  // Formats the renderer cannot parse itself (SAMI, MicroDVD, ...) are converted to SRT by ffmpeg.
  ipcMain.handle('subs:convert', async (_e, filePath: string) => {
    const { run, FFMPEG } = await import('./ffmpeg');
    const { stdout } = await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', filePath, '-f', 'srt', 'pipe:1'], { timeout: 30000 });
    return stdout.toString('utf8');
  });

  ipcMain.handle('fs:exists', (_e, filePath: string) =>
    fs.access(filePath).then(() => true, () => false),
  );

  // Videos in the same folder, natural-sorted: drives Previous / Next.
  ipcMain.handle('fs:siblings', async (_e, filePath: string) => {
    const dir = path.dirname(filePath);
    const names = await fs.readdir(dir).catch(() => [] as string[]);
    return names
      .filter((n) => VIDEO_EXTENSIONS.includes(ext(n)))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
      .map((n) => path.join(dir, n));
  });

  // Same-name subtitle next to the video (movie.mkv -> movie.srt / movie.fa.srt).
  ipcMain.handle('fs:find-subtitle', async (_e, filePath: string) => {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, path.extname(filePath)).toLowerCase();
    const names = await fs.readdir(dir).catch(() => [] as string[]);
    const match = names.find(
      (n) => SUBTITLE_EXTENSIONS.includes(ext(n)) && n.toLowerCase().startsWith(base),
    );
    return match ? path.join(dir, match) : null;
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const file = findFileArg(argv);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      if (file) win.webContents.send('app:open-file', file);
    }
  });

  app.whenReady().then(() => {
    protocol.handle('ocean-media', mediaHandler);
    protocol.handle('ocean-stream', engine.handleStream);
    engine.setLiveCuesListener((sessionId, track, cues, pass) => {
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send('media:live-cues', sessionId, track, cues, pass);
    });
    protocol.handle('ocean-img', handleImage);
    forgetOldSiteCookies();
    registerIpc();
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => engine.killAll());
}
