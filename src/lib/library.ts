import { loadRaw, save } from './storage';

export type RecentItem = {
  input: string;
  title: string;
  openedAt: number;
  position?: number;
  duration?: number;
  /** Online series: which title/episode this entry belongs to. */
  seriesId?: string;
  season?: number;
  episode?: number;
};

const RECENT = 'ocean.recent';
const MAX = 15;

export function getRecent(): RecentItem[] {
  return loadRaw<RecentItem[]>(RECENT, []);
}

export function addRecent(input: string, title: string) {
  const prev = getRecent().find((r) => r.input === input);
  const list = [{ ...prev, input, title, openedAt: Date.now() }, ...getRecent().filter((r) => r.input !== input)].slice(0, MAX);
  save(RECENT, list);
}

export function clearRecent() {
  save(RECENT, []);
}

/** Stores the resume point; cleared near the start/end so finished videos start over. */
export function savePosition(input: string, position: number, duration: number) {
  const list = getRecent();
  const item = list.find((r) => r.input === input);
  if (!item) return;
  item.position = position > 15 && duration - position > 30 ? position : undefined;
  item.duration = duration;
  save(RECENT, list);
}

export function getPosition(input: string) {
  return getRecent().find((r) => r.input === input)?.position;
}

export function tagRecent(input: string, tags: Pick<RecentItem, 'seriesId' | 'season' | 'episode'>) {
  const list = getRecent();
  const item = list.find((r) => r.input === input);
  if (!item) return;
  Object.assign(item, tags);
  save(RECENT, list);
}
