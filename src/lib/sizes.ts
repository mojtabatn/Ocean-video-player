import { useEffect, useState } from 'react';
import { ocean } from './bridge';

const known = new Map<string, number | null>();

export function formatSize(bytes: number | null | undefined) {
  if (!bytes) return undefined;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

/** File sizes for download links, fetched once per link and shared across components. */
export function useSizes(urls: string[]) {
  const key = urls.join('\n');
  const [, setTick] = useState(0);
  useEffect(() => {
    const missing = urls.filter((u) => !known.has(u));
    if (!missing.length || !ocean) return;
    let alive = true;
    ocean.sourceSizes(missing).then((r) => {
      for (const [u, s] of Object.entries(r)) known.set(u, s);
      if (alive) setTick((t) => t + 1);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (url: string): string | undefined => (known.has(url) ? (formatSize(known.get(url)) ?? '—') : '…');
}
