import { app } from 'electron';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const exe = process.platform === 'win32' ? '.exe' : '';

/** Locates a bundled binary: env override → packaged resources → vendor/ (dev) → PATH. */
function locate(name: 'ffmpeg' | 'ffprobe') {
  const env = process.env[`OCEAN_${name.toUpperCase()}`];
  if (env) return env;
  const candidates = [
    path.join(process.resourcesPath ?? '', 'ffmpeg', name + exe),
    path.join(app.getAppPath(), 'vendor', 'ffmpeg', `${process.platform}-${process.arch}`, name + exe),
  ];
  return candidates.find((p) => existsSync(p)) ?? name;
}

export const FFMPEG = locate('ffmpeg');
export const FFPROBE = locate('ffprobe');

export function run(bin: string, args: string[], opts: { maxBuffer?: number; encoding?: 'buffer' | 'utf8'; timeout?: number } = {}) {
  return new Promise<{ stdout: Buffer; stderr: string }>((resolve, reject) => {
    execFile(
      bin,
      args,
      { maxBuffer: opts.maxBuffer ?? 64 * 1024 * 1024, encoding: 'buffer', timeout: opts.timeout ?? 0, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) reject(Object.assign(err, { stderr: stderr?.toString() }));
        else resolve({ stdout, stderr: stderr.toString() });
      },
    );
  });
}

/** `extraPipes` adds readable pipes on fd 3, 4, … (for ffmpeg outputs written to pipe:3, pipe:4, …). */
export function spawnFfmpeg(args: string[], extraPipes = 0): ChildProcess {
  return spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-nostdin', ...args], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', ...Array.from({ length: extraPipes }, () => 'pipe' as const)],
  });
}

export type H264Encoder = { name: string; args: string[] };

// Preference order: GPU encoders first, then software. Each is test-encoded once.
const ENCODERS: H264Encoder[] = [
  { name: 'h264_nvenc', args: ['-preset', 'p2', '-tune', 'll', '-rc', 'vbr', '-cq', '21'] },
  { name: 'h264_qsv', args: ['-preset', 'veryfast', '-global_quality', '22'] },
  { name: 'h264_amf', args: ['-quality', 'speed', '-rc', 'cqp', '-qp_i', '20', '-qp_p', '22'] },
  { name: 'libx264', args: ['-preset', 'veryfast', '-tune', 'zerolatency', '-crf', '20'] },
  { name: 'h264_mf', args: ['-hw_encoding', 'true', '-rate_control', 'quality', '-quality', '70'] },
  { name: 'libopenh264', args: ['-b:v', '8M'] },
];

let encoderPromise: Promise<H264Encoder | null> | null = null;

/** First H.264 encoder that actually works on this machine (GPU drivers vary). */
export function h264Encoder() {
  encoderPromise ??= (async () => {
    for (const enc of ENCODERS) {
      try {
        await run(
          FFMPEG,
          ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=black:s=320x180:d=0.2',
            '-pix_fmt', 'yuv420p', '-c:v', enc.name, ...enc.args, '-f', 'null', '-'],
          { timeout: 8000 },
        );
        return enc;
      } catch {
        /* try next */
      }
    }
    return null;
  })();
  return encoderPromise;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

/** Options placed before `-i` for network inputs: browser user agent, site referer, reconnects. */
export function inputOpts(input: string, kind: 'ffmpeg' | 'ffprobe' = 'ffmpeg'): string[] {
  if (!/^https?:\/\//i.test(input)) return [];
  const opts = ['-user_agent', UA, '-headers', 'Referer: https://www.tejaratban.top/\r\n'];
  if (kind === 'ffmpeg') opts.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_on_network_error', '1', '-reconnect_delay_max', '5');
  return opts;
}
