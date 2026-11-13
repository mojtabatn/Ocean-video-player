// Updates from GitHub Releases: check for a newer version, read release notes, download the Windows installer
// and run it. No third-party updater: the CI workflow publishes Ocean-Player-Setup.exe on each release.
import { app, net, shell } from 'electron';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { GITHUB_REPO, type UpdateInfo, type UpdateProgress } from '../shared/app';

const repo = () => process.env.OCEAN_GITHUB_REPO ?? GITHUB_REPO;
const api = () => process.env.OCEAN_UPDATE_API ?? 'https://api.github.com';
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'Ocean-Player-Updater', 'X-GitHub-Api-Version': '2022-11-28' };

type Release = {
  tag_name: string;
  html_url: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets: { name: string; size: number; browser_download_url: string }[];
};

/** 0.10.1 vs 0.9.0 → compares numbers part by part. */
export function isNewer(a: string, b: string) {
  const parse = (v: string) => v.replace(/^v/i, '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await net.fetch(url, { headers });
  if (res.status === 404) throw new Error('No releases found on GitHub yet');
  if (res.status === 403 || res.status === 429) throw new Error('GitHub is rate-limiting requests right now; try again later');
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  return (await res.json()) as T;
}

/** The installer if the release has one, else the portable zip. */
function pickAsset(r: Release) {
  return (
    r.assets.find((a) => /setup.*\.exe$/i.test(a.name)) ??
    r.assets.find((a) => /\.exe$/i.test(a.name)) ??
    r.assets.find((a) => /win.*\.zip$/i.test(a.name)) ??
    r.assets.find((a) => /\.zip$/i.test(a.name))
  );
}

let latestRelease: Release | null = null;

export async function checkForUpdate(): Promise<UpdateInfo> {
  const current = app.getVersion();
  if (!repo()) return { configured: false, current, available: false };
  try {
    const r = await getJson<Release>(`${api()}/repos/${repo()}/releases/latest`);
    latestRelease = r;
    const latest = r.tag_name.replace(/^v/i, '');
    const asset = pickAsset(r);
    return { configured: true, current, latest, available: isNewer(latest, current) && !!asset, pageUrl: r.html_url, assetName: asset?.name, assetSize: asset?.size };
  } catch (e) {
    return { configured: true, current, available: false, error: (e as Error).message };
  }
}

/** Release notes of the version that is running now (shown as "What's new"). */
export async function releaseNotes(): Promise<{ version: string; notes: string }> {
  const version = app.getVersion();
  if (!repo()) return { version, notes: '' };
  try {
    const r = await getJson<Release>(`${api()}/repos/${repo()}/releases/tags/v${version}`);
    return { version, notes: (r.body ?? '').trim() };
  } catch {
    return { version, notes: '' };
  }
}

let downloading = false;

/** Downloads the new release's installer with progress, then runs it (installer) or shows it (zip). */
export async function downloadAndInstall(onProgress: (p: UpdateProgress) => void): Promise<void> {
  if (downloading) return;
  if (!latestRelease) await checkForUpdate();
  const asset = latestRelease && pickAsset(latestRelease);
  if (!asset) return onProgress({ received: 0, total: 0, error: 'No download found for this release.' });
  const url = asset.browser_download_url;
  if (!/^https:\/\//i.test(url) && !process.env.OCEAN_UPDATE_API) return onProgress({ received: 0, total: 0, error: 'Refusing a non-HTTPS download.' });

  downloading = true;
  const dir = path.join(app.getPath('temp'), 'ocean-update');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, asset.name);
  try {
    const res = await net.fetch(url, { headers: { 'User-Agent': headers['User-Agent'] }, redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
    const total = Number(res.headers.get('content-length')) || asset.size;
    const out = createWriteStream(file);
    let received = 0;
    let last = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()));
      if (Date.now() - last > 150) {
        last = Date.now();
        onProgress({ received, total });
      }
    }
    await new Promise<void>((resolve, reject) => out.end((e: Error | null | undefined) => (e ? reject(e) : resolve())));
    if (total && received < total) throw new Error('The download was cut short. Try again.');
    onProgress({ received, total: total || received, done: true, file });
    if (process.env.OCEAN_UPDATE_DRYRUN) return;
    if (/\.exe$/i.test(file)) {
      // Installed copy (it has the installer's uninstaller beside it): update silently in the same folder and
      // start the new version when done. A portable copy gets the normal installer wizard instead.
      const installed = existsSync(path.join(path.dirname(process.execPath), 'Uninstall Ocean Player.exe'));
      if (installed) {
        spawn(file, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
      } else {
        await shell.openPath(file);
      }
      // Let the installer take over: it replaces the files in place and starts the new version itself.
      setTimeout(() => {
        app.quit(); // runs the normal shutdown (stops ffmpeg so the installer can replace its files)
        setTimeout(() => app.exit(0), 3000);
      }, installed ? 600 : 800);
    } else {
      shell.showItemInFolder(file);
    }
  } catch (e) {
    await fs.rm(file, { force: true }).catch(() => {});
    onProgress({ received: 0, total: 0, error: (e as Error).message });
  } finally {
    downloading = false;
  }
}
