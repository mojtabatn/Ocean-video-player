import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { UpdateInfo, UpdateProgress } from '../shared/app';
import type { Capabilities, OnlineDetails, OnlineTitle, OpenResult } from '../shared/media';
import type { SubtitleSearchResult } from './opensubtitles';
import type { AccountStatus } from './online/http';

export type WindowState = { maximized?: boolean; fullscreen?: boolean };

const api = {
  platform: process.platform,
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
  setFullscreen: (value: boolean) => ipcRenderer.send('window:set-fullscreen', value),
  setAlwaysOnTop: (value: boolean) => ipcRenderer.send('window:set-always-on-top', value),
  setMini: (mini: boolean, aspect: number) => ipcRenderer.send('window:set-mini', mini, aspect),
  showItemInFolder: (p: string) => ipcRenderer.send('shell:show-item', p),

  setCapabilities: (c: Capabilities): Promise<void> => ipcRenderer.invoke('media:set-capabilities', c),
  openMedia: (input: string): Promise<OpenResult> => ipcRenderer.invoke('media:open', input),
  closeMedia: (id: string): Promise<void> => ipcRenderer.invoke('media:close', id),
  cachedRanges: (id: string): Promise<[number, number][]> => ipcRenderer.invoke('media:cached', id),
  appVersion: (): Promise<string> => ipcRenderer.invoke('update:version'),
  checkForUpdate: (): Promise<UpdateInfo> => ipcRenderer.invoke('update:check'),
  releaseNotes: (): Promise<{ version: string; notes: string }> => ipcRenderer.invoke('update:notes'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('update:install'),
  onUpdateProgress: (cb: (p: UpdateProgress) => void) => {
    const listener = (_e: unknown, p: UpdateProgress) => cb(p);
    ipcRenderer.on('update:progress', listener);
    return () => ipcRenderer.removeListener('update:progress', listener);
  },
  cacheDir: (): Promise<{ dir: string; isDefault: boolean }> => ipcRenderer.invoke('cache:dir'),
  chooseCacheDir: (): Promise<{ dir: string; isDefault: boolean }> => ipcRenderer.invoke('cache:choose-dir'),
  resetCacheDir: (): Promise<{ dir: string; isDefault: boolean }> => ipcRenderer.invoke('cache:reset-dir'),
  cacheSize: (): Promise<number> => ipcRenderer.invoke('cache:size'),
  clearCache: (): Promise<void> => ipcRenderer.invoke('cache:clear'),
  setCacheLimit: (bytes: number): Promise<number> => ipcRenderer.invoke('cache:set-limit', bytes),
  keyframeBefore: (id: string, t: number): Promise<number> => ipcRenderer.invoke('media:keyframe', id, t),
  thumbnail: (id: string, t: number, width: number): Promise<string | null> => ipcRenderer.invoke('media:thumbnail', id, t, width),
  extractSubtitle: (id: string, index: number): Promise<{ format: 'ass' | 'srt'; text: string } | null> =>
    ipcRenderer.invoke('media:extract-subtitle', id, index),
  screenshot: (id: string, t: number, baseName: string): Promise<string> => ipcRenderer.invoke('media:screenshot', id, t, baseName),
  searchSubtitles: (apiKey: string, opts: { query: string; languages: string; filePath?: string }): Promise<SubtitleSearchResult[]> =>
    ipcRenderer.invoke('subs:search', apiKey, opts),
  downloadSubtitle: (apiKey: string, fileId: number): Promise<Uint8Array> => ipcRenderer.invoke('subs:download', apiKey, fileId),
  onWindowState: (cb: (s: WindowState) => void) => {
    const listener = (_e: unknown, s: WindowState) => cb(s);
    ipcRenderer.on('window:state', listener);
    return () => ipcRenderer.removeListener('window:state', listener);
  },
  onLiveCues: (cb: (sessionId: string, track: number, cues: { start: number; end: number; text: string; top?: boolean }[]) => void) => {
    const listener = (_e: unknown, id: string, track: number, cues: { start: number; end: number; text: string; top?: boolean }[]) => cb(id, track, cues);
    ipcRenderer.on('media:live-cues', listener);
    return () => ipcRenderer.removeListener('media:live-cues', listener);
  },
  onOpenFile: (cb: (path: string) => void) => {
    const listener = (_e: unknown, p: string) => cb(p);
    ipcRenderer.on('app:open-file', listener);
    return () => ipcRenderer.removeListener('app:open-file', listener);
  },
  takePendingFile: (): Promise<string | null> => ipcRenderer.invoke('app:take-pending-file'),
  openVideoDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:open-video'),
  openSubtitleDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:open-subtitle'),
  saveSubtitleDialog: (name: string, contents: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:save-subtitle', name, contents),
  readFile: (p: string): Promise<Uint8Array> => ipcRenderer.invoke('fs:read-text', p),
  convertSubtitle: (p: string): Promise<string> => ipcRenderer.invoke('subs:convert', p),
  exists: (p: string): Promise<boolean> => ipcRenderer.invoke('fs:exists', p),
  siblings: (p: string): Promise<string[]> => ipcRenderer.invoke('fs:siblings', p),
  findSubtitle: (p: string): Promise<string | null> => ipcRenderer.invoke('fs:find-subtitle', p),
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  trending: (force?: boolean): Promise<{ titles: OnlineTitle[]; fetchedAt: number; stale: boolean }> => ipcRenderer.invoke('online:trending', force),
  cachedTrending: (): Promise<{ titles: OnlineTitle[]; fetchedAt: number } | null> => ipcRenderer.invoke('online:cached'),
  accountStatus: (): Promise<AccountStatus> => ipcRenderer.invoke('account:status'),
  signIn: (page: 'login' | 'register' = 'login'): Promise<boolean> => ipcRenderer.invoke('account:sign-in', page),
  signOut: (): Promise<void> => ipcRenderer.invoke('account:sign-out'),
  onAccountChange: (cb: (s: AccountStatus) => void) => {
    const listener = (_e: unknown, s: AccountStatus) => cb(s);
    ipcRenderer.on('account:changed', listener);
    return () => ipcRenderer.removeListener('account:changed', listener);
  },
  imdbRatings: (titles: OnlineTitle[]): Promise<Record<string, string | null>> => ipcRenderer.invoke('online:ratings', titles),
  searchSite: (q: string): Promise<OnlineTitle[]> => ipcRenderer.invoke('online:search', q),
  sourceSizes: (urls: string[]): Promise<Record<string, number | null>> => ipcRenderer.invoke('online:sizes', urls),
  onlineDetails: (t: OnlineTitle): Promise<OnlineDetails> => ipcRenderer.invoke('online:details', t),
};

export type OceanApi = typeof api;

contextBridge.exposeInMainWorld('ocean', api);
