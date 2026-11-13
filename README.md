# Ocean Player

A video player for Windows built with Electron, React and FFmpeg, styled after the Ocean Player Figma design.

## How playback works

Every file is probed with `ffprobe` and played one of three ways:

| Mode | When | Cost |
|---|---|---|
| **Direct** | MP4 / WebM / MOV with codecs Chromium decodes (H.264 8-bit, VP9, AV1, HEVC with GPU support; AAC, MP3, Opus, FLAC) | none |
| **Remux** | Video Chromium can decode inside another container (MKV, AVI, TS…) or with AC3 / E-AC3 / DTS / TrueHD audio | almost none: video is copied, audio converted to AAC |
| **Transcode** | MPEG-2, Xvid/DivX, VC-1/WMV, RMVB, 10-bit H.264, HEVC without GPU support, or image subtitles (PGS / VobSub) burned in | encoder: NVENC → QSV → AMF → Media Foundation |

Remux / transcode stream fragmented MP4 from ffmpeg through the `ocean-stream://` protocol. Seeking restarts
ffmpeg; for stream copy the exact keyframe ffmpeg will land on is looked up first, so the clock stays exact
(`tests/e2e.cjs` checks the shown frame against ffmpeg's frame at the reported time).

## Features

- Playback: resume position, folder playlist / playlist panel, shuffle & repeat, speed 0.25–4× (pitch kept),
  frame stepping, A-B repeat, chapters, seek-bar thumbnails, URL playback, recent files
- Audio: track selection, delay (±, negative via ffmpeg), volume boost to 200%, 10-band EQ with presets, normalize
- Subtitles: SRT / VTT / ASS / SSA / SUB / SMI, embedded text tracks, PGS / VobSub (burned in), auto-load
  (same-name file or preferred language), Persian encodings (UTF-8 / UTF-16 / Windows-1256), delay, styling,
  secondary subtitle, save as SRT, OpenSubtitles.com search (needs a free API key in Settings).
  Subtitles render in **Vazirmatn**; the UI uses **Manrope**.
- Video: aspect ratio, zoom, crop (fill), rotate, flip, brightness / contrast / saturation / hue, screenshots
  (full resolution, saved to `Pictures\Ocean`), fullscreen, mini player, picture-in-picture, always on top, media info
- Customisable keyboard shortcuts, right-click menu, drag & drop, "Open with" / file associations

## Home screen

The home screen ("Pick and watch online") reads trending titles through `electron/online/index.ts`.
**The tejaratban.top parser is not written yet** — the site could not be reached from the development
environment. Until then the row shows placeholders and "Couldn't load titles".

## Development

```bash
npm install
npm run dev          # Vite + Electron with hot reload (uses ffmpeg/ffprobe from PATH)
npm run typecheck
```

Tests (Linux needs `xvfb-run`; they generate nothing themselves — pass a folder of test media):

```bash
xvfb-run -a node tests/e2e.cjs <media-dir> <out-dir>
xvfb-run -a node tests/features.cjs <media-dir> <out-dir> http://127.0.0.1:8765
```

## Releases

Push a tag such as `v0.2.0` and the **Build Windows** workflow builds the installer and the zip and attaches them to a
GitHub Release. The in-app updater (Settings › About) reads the latest release of `mojtabatn/Ocean-video-player`.
Add an `OMDB_KEY` repository secret to enable IMDb ratings in release builds.

## Building for Windows

```bash
npm run dist         # build + fetch LGPL FFmpeg (vendor/ffmpeg/win32-x64) + NSIS installer & portable exe
```

The NSIS installer must be built on Windows (or Linux with 32-bit Wine). `.github/workflows/build-windows.yml`
builds it on a Windows runner and uploads `release/*.exe`.

The bundled FFmpeg is the BtbN **LGPL** shared build (no libx264). Use `node scripts/fetch-ffmpeg.mjs --gpl --force`
for a GPL build with libx264 — the app must then be distributed under the GPL.
