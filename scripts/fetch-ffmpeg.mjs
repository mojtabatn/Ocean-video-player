// Downloads an LGPL FFmpeg build for Windows x64 into vendor/ffmpeg/win32-x64 (bundled by electron-builder).
// LGPL builds have no libx264; on-the-fly conversion uses the GPU (NVENC / QSV / AMF) or Windows Media Foundation.
// Pass --gpl for a GPL build (adds libx264; the whole app must then be distributed under GPL terms).
import { execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const flavor = process.argv.includes('--gpl') ? 'gpl' : 'lgpl';
// "master-latest" is the one asset name BtbN keeps stable across releases.
// The -shared build keeps the codecs in DLLs used by both ffmpeg.exe and ffprobe.exe (~half the size).
const name = `ffmpeg-master-latest-win64-${flavor}-shared`;
const url = `https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/${name}.zip`;
const out = path.resolve('vendor/ffmpeg/win32-x64');
const tmp = path.resolve('vendor/ffmpeg/tmp');

if (existsSync(path.join(out, 'ffmpeg.exe')) && !process.argv.includes('--force')) {
  console.log('FFmpeg already present in', out);
  process.exit(0);
}
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
mkdirSync(out, { recursive: true });

console.log('Downloading', url);
const res = await fetch(url);
if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
const zip = path.join(tmp, 'ffmpeg.zip');
await pipeline(Readable.fromWeb(res.body), createWriteStream(zip));

// Windows 10+ ships bsdtar as tar.exe, which can unzip; on Linux/macOS use unzip.
if (process.platform === 'win32') execFileSync('tar', ['-xf', zip, '-C', tmp]);
else execFileSync('unzip', ['-q', zip, '-d', tmp]);

const dir = readdirSync(tmp).find((d) => d.startsWith('ffmpeg-'));
const bin = path.join(tmp, dir, 'bin');
for (const f of readdirSync(bin)) if (f !== 'ffplay.exe') renameSync(path.join(bin, f), path.join(out, f));
rmSync(tmp, { recursive: true, force: true });
console.log('FFmpeg', flavor.toUpperCase(), 'ready in', out);
