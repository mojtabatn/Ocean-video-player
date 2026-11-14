import { useSyncExternalStore } from 'react';
import type { OnlineTitle, SourcePref } from '../../shared/media';
import { loadRaw, save } from './storage';

/** One entry per online title (a series keeps only the episode watched last). */
export type HistoryItem = {
  id: string;
  title: OnlineTitle;
  season?: number;
  episode?: number;
  position: number;
  duration: number;
  at: number;
  /** Version and quality being watched, so resuming picks the same one. */
  pref?: SourcePref;
};

const KEY = 'ocean.history';
const MAX = 30;

let items: HistoryItem[] = loadRaw<HistoryItem[]>(KEY, []).filter((h) => h && h.id && h.title?.pageUrl);
const listeners = new Set<() => void>();
const emit = () => {
  save(KEY, items);
  listeners.forEach((l) => l());
};

export function useHistory() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => items,
  );
}

/** Adds or updates an entry and moves it to the front when it is a different title than the first. */
export function recordHistory(h: Omit<HistoryItem, 'at'>) {
  const prev = items.find((x) => x.id === h.id);
  // Nothing to show for a title that was barely started and has no entry yet.
  if (!prev && h.position < 10) return;
  const next: HistoryItem = { ...h, at: Date.now() };
  items = [next, ...items.filter((x) => x.id !== h.id)].slice(0, MAX);
  // Frequent progress updates only touch storage, listeners fire only when the list order/progress changes visibly.
  emit();
}

export function removeHistory(id: string) {
  items = items.filter((x) => x.id !== id);
  emit();
}

export const isFinished = (h: Pick<HistoryItem, 'position' | 'duration'>) => h.duration > 0 && h.duration - h.position < 30;
