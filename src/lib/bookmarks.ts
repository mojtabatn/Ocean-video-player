import { useSyncExternalStore } from 'react';
import type { OnlineTitle } from '../../shared/media';
import { loadRaw, save } from './storage';

const KEY = 'ocean.bookmarks';

let items: OnlineTitle[] = loadRaw<OnlineTitle[]>(KEY, []).filter((t) => t && t.id && t.pageUrl);
const listeners = new Set<() => void>();
const emit = () => {
  save(KEY, items);
  listeners.forEach((l) => l());
};

/** Saved titles, newest first. Whole titles are kept so they open without searching again. */
export function useBookmarks() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => items,
  );
}

export function toggleBookmark(t: OnlineTitle) {
  items = items.some((b) => b.id === t.id) ? items.filter((b) => b.id !== t.id) : [t, ...items];
  emit();
}
