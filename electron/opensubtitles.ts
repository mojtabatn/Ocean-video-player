import { open as fsOpen } from 'node:fs/promises';

const API = 'https://api.opensubtitles.com/api/v1';
const UA = 'Ocean Player v0.1';

export type SubtitleSearchResult = {
  fileId: number;
  release: string;
  language: string;
  downloads: number;
  hashMatch: boolean;
  hearingImpaired: boolean;
};

/** OpenSubtitles "moviehash": size + 64-bit word sums of the first and last 64 KiB. */
export async function movieHash(filePath: string) {
  const CHUNK = 64 * 1024;
  const fh = await fsOpen(filePath, 'r');
  try {
    const { size } = await fh.stat();
    if (size < CHUNK * 2) return null;
    const buf = Buffer.alloc(CHUNK * 2);
    await fh.read(buf, 0, CHUNK, 0);
    await fh.read(buf, CHUNK, CHUNK, size - CHUNK);
    let sum = BigInt(size);
    for (let i = 0; i < buf.length; i += 8) sum = (sum + buf.readBigUInt64LE(i)) & 0xffffffffffffffffn;
    return sum.toString(16).padStart(16, '0');
  } finally {
    await fh.close();
  }
}

function headers(apiKey: string) {
  return { 'Api-Key': apiKey, 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json' };
}

export async function search(apiKey: string, opts: { query: string; languages: string; filePath?: string }) {
  if (!apiKey) throw new Error('Add your OpenSubtitles API key in Settings first.');
  const params = new URLSearchParams({ languages: opts.languages || 'fa,en' });
  if (opts.query) params.set('query', opts.query);
  if (opts.filePath) {
    const hash = await movieHash(opts.filePath).catch(() => null);
    if (hash) params.set('moviehash', hash);
  }
  const res = await fetch(`${API}/subtitles?${params}`, { headers: headers(apiKey) });
  if (!res.ok) throw new Error(`OpenSubtitles: ${res.status} ${res.statusText}`);
  const json: any = await res.json();
  return (json.data ?? []).flatMap((d: any): SubtitleSearchResult[] =>
    (d.attributes?.files ?? []).map((f: any) => ({
      fileId: f.file_id,
      release: d.attributes.release || f.file_name || 'Subtitle',
      language: d.attributes.language,
      downloads: d.attributes.download_count ?? 0,
      hashMatch: !!d.attributes.moviehash_match,
      hearingImpaired: !!d.attributes.hearing_impaired,
    })),
  );
}

export async function download(apiKey: string, fileId: number) {
  const res = await fetch(`${API}/download`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ file_id: fileId, sub_format: 'srt' }),
  });
  if (!res.ok) throw new Error(`OpenSubtitles: ${res.status} ${res.statusText}`);
  const { link } = (await res.json()) as { link: string };
  const file = await fetch(link);
  return new Uint8Array(await file.arrayBuffer());
}
