import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { compareSources, GROUP_LABEL, pickSource, type OnlineDetails, type OnlineSource, type OnlineTitle, type SourcePref } from '../shared/media';
import { ControlBar } from './components/ControlBar';
import { EqualizerDialog } from './components/dialogs/EqualizerDialog';
import { HelpDialog } from './components/dialogs/HelpDialog';
import { MediaInfoDialog } from './components/dialogs/MediaInfoDialog';
import { OnlinePickerDialog } from './components/dialogs/OnlinePickerDialog';
import { OpenUrlDialog } from './components/dialogs/OpenUrlDialog';
import { SettingsDialog } from './components/dialogs/SettingsDialog';
import { ShortcutsDialog } from './components/dialogs/ShortcutsDialog';
import { SubtitleSearchDialog } from './components/dialogs/SubtitleSearchDialog';
import { SubtitleSettingsDialog } from './components/dialogs/SubtitleSettingsDialog';
import { DEFAULT_ADJUST, VideoAdjustDialog, type VideoAdjust } from './components/dialogs/VideoAdjustDialog';
import { Home } from './components/Home';
import { CloseIcon, OpenFileSmallIcon, RestoreIcon } from './components/icons';
import { Menu, type MenuEntry } from './components/Menu';
import { Playlist, type PlaylistItem, type RepeatMode } from './components/Playlist';
import { SubtitleOverlay } from './components/SubtitleOverlay';
import { TitleBar } from './components/TitleBar';
import { eventToKey, keymap, keysFor, prettyKey, type ActionId } from './lib/actions';
import { ocean } from './lib/bridge';
import { formatTime } from './lib/format';
import { addRecent, clearRecent, getPosition, getRecent, savePosition, tagRecent } from './lib/library';
import { isFinished, recordHistory, type HistoryItem } from './lib/history';
import { useSettings } from './lib/settings';
import { useSizes } from './lib/sizes';
import { useUpdates } from './lib/updates';
import { UpdateToast } from './components/UpdateToast';
import { WhatsNewDialog } from './components/dialogs/WhatsNewDialog';
import { cuesAt, decodeSubtitle, parseSubtitles, toSrt, type Cue } from './lib/subtitles';
import { languageMatches, Player, titleFromInput } from './player/Player';

const MEDIA_RE = /\.(mp4|m4v|mkv|webm|mov|ogv|ogg|avi|wmv|asf|flv|f4v|ts|m2ts|mts|mpg|mpeg|vob|3gp|3g2|rm|rmvb|divx|xvid|mxf|dv|mp3|m4a|aac|flac|wav|opus|oga|wma|ac3|dts|mka)$/i;
const SUB_RE = /\.(srt|vtt|ass|ssa|sub|smi|sami)$/i;
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4];
const ASPECTS = [
  { id: 'auto', label: 'Default' },
  { id: '16:9', label: '16:9' },
  { id: '4:3', label: '4:3' },
  { id: '21:9', label: '2.35:1 (Cinema)' },
  { id: '1:1', label: '1:1' },
  { id: 'fill', label: 'Fill window (crop)' },
  { id: 'stretch', label: 'Stretch' },
] as const;
type Aspect = (typeof ASPECTS)[number]['id'];
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

/** `live`: cues come from the running stream (online files) and keep growing. */
type SubTrack = { label: string; cues: Cue[]; embedded?: number; live?: boolean };
type DialogId =
  | 'whatsNew' | 'subtitleSettings' | 'audio' | 'videoAdjust' | 'mediaInfo' | 'settings' | 'shortcuts' | 'help' | 'openUrl' | 'subSearch';
type OnlineState = { details: OnlineDetails; episode: number; source: OnlineSource };

const errMsg = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const isUrl = (s: string) => /^[a-z][a-z0-9+.-]*:\/\//i.test(s);
const shuffleIndex = (len: number, current: number) => (len < 2 ? current : (current + 1 + Math.floor(Math.random() * (len - 1))) % len);

function videoBox(stageW: number, stageH: number, vw: number, vh: number, aspect: Aspect, zoom: number, rotate: number) {
  const rotated = rotate % 180 !== 0;
  const W = rotated ? stageH : stageW;
  const H = rotated ? stageW : stageH;
  if (!vw || !vh || !W || !H) return { w: W, h: H };
  const ratios: Record<string, number> = { '16:9': 16 / 9, '4:3': 4 / 3, '21:9': 2.35, '1:1': 1 };
  let w: number;
  let h: number;
  if (aspect === 'stretch') {
    w = W;
    h = H;
  } else {
    const ar = ratios[aspect] ?? vw / vh;
    const wide = W / H > ar;
    // contain, or cover for "fill"
    if (wide !== (aspect === 'fill')) {
      h = H;
      w = H * ar;
    } else {
      w = W;
      h = W / ar;
    }
  }
  return { w: w * zoom, h: h * zoom };
}

export default function App() {
  const [settings, updateSettings] = useSettings();
  const updates = useUpdates(settings.autoUpdateCheck);
  const player = useMemo(() => new Player(), []);
  // Exposed for the end-to-end tests (tests/e2e.cjs).
  (window as unknown as { __oceanPlayer: Player }).__oceanPlayer = player;
  const snap = useSyncExternalStore(player.subscribe, player.getSnapshot);

  const stageRef = useRef<HTMLElement>(null);
  const videoHost = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  const [maximized, setMaximized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [mini, setMini] = useState(false);
  const [onTop, setOnTop] = useState(false);
  const [pip, setPip] = useState(false);
  const [idle, setIdle] = useState(false);

  const [menu, setMenu] = useState<{ x: number; y: number; items?: MenuEntry[]; above?: boolean } | null>(null);
  const [dialog, setDialog] = useState<DialogId | null>(null);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [osd, setOsd] = useState<string | null>(null);
  const osdTimer = useRef<number>();

  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [plIndex, setPlIndex] = useState(-1);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const [shuffle, setShuffle] = useState(false);
  const [online, setOnline] = useState<OnlineState | null>(null);
  const [picker, setPicker] = useState<{ title: OnlineTitle; details: OnlineDetails | null; error: string | null; initialEpisode: number } | null>(null);

  const [primary, setPrimary] = useState<SubTrack | null>(null);
  const [secondary, setSecondary] = useState<SubTrack | null>(null);
  const [subDelay, setSubDelay] = useState(0);
  const [subsVisible, setSubsVisible] = useState(true);

  const [aspect, setAspect] = useState<Aspect>('auto');
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [adjust, setAdjust] = useState<VideoAdjust>(DEFAULT_ADJUST);
  const [ab, setAb] = useState<{ a?: number; b?: number }>({});
  const [cached, setCached] = useState<[number, number][]>([]);

  const flash = useCallback((msg: string) => {
    setOsd(msg);
    window.clearTimeout(osdTimer.current);
    osdTimer.current = window.setTimeout(() => setOsd(null), 1400);
  }, []);

  // ---------- one-time setup ----------
  useEffect(() => {
    const host = videoHost.current!;
    host.appendChild(player.video);
    player.setVolume(settings.rememberVolume ? Math.min(settings.volume, settings.maxVolume) : 1);
    ocean?.setCacheLimit(settings.cacheLimitGb * 1024 ** 3);
    const v = player.video;
    const onEnter = () => setPip(true);
    const onLeave = () => setPip(false);
    v.addEventListener('enterpictureinpicture', onEnter);
    v.addEventListener('leavepictureinpicture', onLeave);
    if (ocean) {
      const mse = (t: string) => typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(t);
      ocean.setCapabilities({
        hevc: mse('video/mp4; codecs="hvc1.1.6.L120.90"') || mse('video/mp4; codecs="hev1.1.6.L120.90"'),
        av1: mse('video/mp4; codecs="av01.0.08M.08"'),
        vp9: mse('video/mp4; codecs="vp09.00.10.08"'),
      });
    }
    return () => {
      v.removeEventListener('enterpictureinpicture', onEnter);
      v.removeEventListener('leavepictureinpicture', onLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setStage({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep the Web Audio chain in sync with settings.
  useEffect(() => {
    const g = player.audioGraph;
    g?.setEq(settings.eqEnabled ? settings.eqGains : settings.eqGains.map(() => 0));
    g?.setNormalize(settings.normalize);
  }, [player, settings.eqEnabled, settings.eqGains, settings.normalize]);

  // Persist volume (debounced by React batching; cheap localStorage write).
  useEffect(() => {
    if (!settings.rememberVolume) return;
    const t = window.setTimeout(() => updateSettings({ volume: snap.volume }), 400);
    return () => window.clearTimeout(t);
  }, [snap.volume, settings.rememberVolume, updateSettings]);

  // ---------- opening media ----------
  const resetPerFile = () => {
    setPrimary(null);
    setSecondary(null);
    setSubDelay(0);
    setAb({});
    setAspect('auto');
    setZoom(1);
    setRotate(0);
    setFlipH(false);
    setFlipV(false);
  };

  const play = useCallback(
    (input: string, title?: string, startAt?: number) => {
      resetPerFile();
      const t = title ?? titleFromInput(input);
      addRecent(input, t);
      player.load(input, {
        title: t,
        startAt: startAt !== undefined ? startAt : settings.resumePlayback ? getPosition(input) : undefined,
        audioLanguage: settings.preferredAudioLanguage || undefined,
      });
    },
    [player, settings.resumePlayback, settings.preferredAudioLanguage],
  );

  /** Opens local files: one file → its folder becomes the playlist; several → exactly those. */
  const openFiles = useCallback(
    async (paths: string[]) => {
      if (!paths.length) return;
      setOnline(null);
      if (paths.length === 1 && ocean && !isUrl(paths[0])) {
        const list = await ocean.siblings(paths[0]).catch(() => [] as string[]);
        const items = (list.length ? list : paths).map((p) => ({ input: p, title: titleFromInput(p) }));
        setPlaylist(items);
        setPlIndex(Math.max(0, items.findIndex((i) => i.input === paths[0])));
      } else {
        setPlaylist(paths.map((p) => ({ input: p, title: titleFromInput(p) })));
        setPlIndex(0);
      }
      play(paths[0]);
    },
    [play],
  );

  const openDialog = useCallback(async () => {
    if (ocean) {
      const p = await ocean.openVideoDialog();
      if (p) openFiles([p]);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,audio/*';
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) {
        setOnline(null);
        play(URL.createObjectURL(f), f.name.replace(/\.[^.]+$/, ''));
      }
    };
    input.click();
  }, [openFiles, play]);

  const openUrl = useCallback(
    (url: string) => {
      setOnline(null);
      setPlaylist([{ input: url, title: titleFromInput(url) }]);
      setPlIndex(0);
      play(url);
    },
    [play],
  );

  const playPlaylistIndex = useCallback(
    (i: number) => {
      const it = playlist[i];
      if (!it) return;
      setPlIndex(i);
      play(it.input, it.title);
    },
    [playlist, play],
  );

  // ---------- online titles (home screen) ----------
  const onlineName = (details: OnlineDetails, episode: number) => {
    const ep = details.episodes[episode];
    return ep ? `${details.title.title} S${String(ep.season).padStart(2, '0')} - E${String(ep.episode).padStart(2, '0')}` : details.title.title;
  };

  /** Plays a movie or an episode; keeps the chosen dub/subtitle version and quality across episodes. */
  const playOnline = useCallback(
    (details: OnlineDetails, episode: number, pref?: SourcePref, startAt?: number) => {
      const ep = details.episodes[episode];
      const sources = ep ? ep.sources : details.sources;
      if (!sources.length) {
        flash('No playable links found for this title');
        return;
      }
      const s = pickSource(sources, pref);
      setOnline({ details, episode, source: s });
      setPlaylist([]);
      setPlIndex(-1);
      play(s.url, onlineName(details, episode), startAt);
    },
    [play, flash],
  );

  /** "Recently watched" card: reopen the title (fresh links) at the same episode, version and quality, where it stopped. */
  const resumeOnline = useCallback(
    async (h: HistoryItem) => {
      if (!ocean) return;
      flash('Loading…');
      try {
        const details = await ocean.onlineDetails(h.title);
        const idx = details.episodes.findIndex((e) => e.season === h.season && e.episode === h.episode);
        let episode = Math.max(0, idx);
        let start = h.position >= 10 ? h.position : 0;
        if (isFinished(h)) {
          // Finished: a series moves on to the next episode, anything else starts over.
          start = 0;
          if (idx >= 0 && idx < details.episodes.length - 1) episode = idx + 1;
        }
        playOnline(details, episode, h.pref, start);
      } catch (e) {
        flash(errMsg(e));
      }
    },
    [playOnline, flash],
  );

  /** Poster click: open the picker (season / episode / version / quality), loading the title page meanwhile. */
  const pickOnline = useCallback(async (t: OnlineTitle) => {
    if (!ocean) return;
    setPicker({ title: t, details: null, error: null, initialEpisode: 0 });
    try {
      const details = await ocean.onlineDetails(t);
      // Series: preselect where the user left off in this series.
      const last = details.episodes.length ? getRecent().find((r) => r.seriesId === t.id) : undefined;
      const at = last ? details.episodes.findIndex((e) => e.season === last.season && e.episode === last.episode) : -1;
      setPicker((cur) => (cur?.title.id === t.id ? { ...cur, details, initialEpisode: Math.max(0, at) } : cur));
    } catch (e) {
      setPicker((cur) => (cur?.title.id === t.id ? { ...cur, error: errMsg(e) } : cur));
    }
  }, []);

  /** Switching quality or version keeps the playback position. */
  const switchSource = (s: OnlineSource) => {
    if (!online) return;
    const at = player.time;
    setOnline({ ...online, source: s });
    addRecent(s.url, snap.title);
    player.load(s.url, { title: snap.title, startAt: at, audioLanguage: settings.preferredAudioLanguage || undefined });
    flash(`${GROUP_LABEL[s.group]} · ${s.label}`);
  };

  // Remember the episode per series, so picking the series again continues there.
  useEffect(() => {
    if (!online || !snap.input) return;
    const ep = online.details.episodes[online.episode];
    if (ep) tagRecent(snap.input, { seriesId: online.details.title.id, season: ep.season, episode: ep.episode });
  }, [online, snap.input]);

  // ---------- navigation ----------
  const navInfo = useMemo(() => {
    if (online) {
      const n = online.details.episodes.length;
      return { hasPrev: online.episode > 0, hasNext: online.episode < n - 1 };
    }
    if (shuffle && playlist.length > 1) return { hasPrev: true, hasNext: true };
    return {
      hasPrev: plIndex > 0 || (repeat === 'all' && playlist.length > 1),
      hasNext: (plIndex >= 0 && plIndex < playlist.length - 1) || (repeat === 'all' && playlist.length > 1),
    };
  }, [online, playlist.length, plIndex, shuffle, repeat]);

  const goNext = useCallback(() => {
    if (online) {
      if (online.episode < online.details.episodes.length - 1) playOnline(online.details, online.episode + 1, online.source);
      return;
    }
    if (!playlist.length) return;
    if (shuffle) return playPlaylistIndex(shuffleIndex(playlist.length, plIndex));
    if (plIndex < playlist.length - 1) playPlaylistIndex(plIndex + 1);
    else if (repeat === 'all') playPlaylistIndex(0);
  }, [online, playlist.length, shuffle, plIndex, repeat, playOnline, playPlaylistIndex]);

  const goPrev = useCallback(() => {
    if (snap.time > 5) {
      player.seek(0);
      return;
    }
    if (online) {
      if (online.episode > 0) playOnline(online.details, online.episode - 1, online.source);
      return;
    }
    if (plIndex > 0) playPlaylistIndex(plIndex - 1);
    else if (repeat === 'all' && playlist.length > 1) playPlaylistIndex(playlist.length - 1);
  }, [online, plIndex, repeat, playlist.length, snap.time, player, playOnline, playPlaylistIndex]);

  // End of file: repeat one / next / stop.
  useEffect(() => {
    if (!snap.ended) return;
    if (snap.input) savePosition(snap.input, 0, snap.duration);
    if (repeat === 'one') {
      player.seek(0);
      player.play();
    } else if (settings.autoPlayNext && navInfo.hasNext) goNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.ended]);

  // Resume points.
  const lastSaved = useRef(0);
  useEffect(() => {
    if (!snap.input || !snap.duration || snap.loading) return;
    if (Math.abs(snap.time - lastSaved.current) >= 5) {
      lastSaved.current = snap.time;
      savePosition(snap.input, snap.time, snap.duration);
    }
  }, [snap.time, snap.input, snap.duration, snap.loading]);

  // Watch history for the home screen (online titles): progress every few seconds, final state on finish / leaving.
  const lastRecorded = useRef(0);
  const recordNow = useCallback(
    (position: number, duration: number) => {
      if (!online || !duration) return;
      const ep = online.details.episodes[online.episode];
      recordHistory({
        id: online.details.title.id,
        title: online.details.title,
        season: ep?.season,
        episode: ep?.episode,
        position,
        duration,
        pref: { group: online.source.group, label: online.source.label, encoder: online.source.encoder },
      });
    },
    [online],
  );
  useEffect(() => {
    if (!online || !snap.input || !snap.duration || snap.loading) return;
    if (Math.abs(snap.time - lastRecorded.current) >= 5) {
      lastRecorded.current = snap.time;
      recordNow(snap.time, snap.duration);
    }
  }, [snap.time, snap.input, snap.duration, snap.loading, online, recordNow]);
  useEffect(() => {
    if (snap.ended) recordNow(snap.duration, snap.duration);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.ended]);

  // Downloaded parts of online files, refreshed while playing.
  useEffect(() => {
    setCached([]);
    if (!ocean || !snap.info?.isUrl) return;
    const tick = () => {
      const id = player.session;
      if (id) ocean!.cachedRanges(id).then(setCached).catch(() => {});
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [snap.info, player]);

  // A-B repeat.
  useEffect(() => {
    if (ab.a !== undefined && ab.b !== undefined && snap.time >= ab.b) player.seek(ab.a);
  }, [snap.time, ab, player]);

  // ---------- subtitles ----------
  const loadSubtitleBytes = useCallback(
    (bytes: Uint8Array, label: string, slot: 'primary' | 'secondary' = 'primary') => {
      const cues = parseSubtitles(decodeSubtitle(bytes));
      if (!cues.length) {
        flash('No subtitle lines found in that file');
        return;
      }
      (slot === 'primary' ? setPrimary : setSecondary)({ label, cues });
      setSubsVisible(true);
      flash(`Subtitle: ${label}`);
    },
    [flash],
  );

  const loadSubtitlePath = useCallback(
    async (path: string, slot: 'primary' | 'secondary' = 'primary') => {
      if (!ocean) return;
      const label = path.split(/[\\/]/).pop() ?? 'Subtitle';
      try {
        if (/\.(srt|vtt|ass|ssa)$/i.test(path)) loadSubtitleBytes(await ocean.readFile(path), label, slot);
        else loadSubtitleBytes(new TextEncoder().encode(await ocean.convertSubtitle(path)), label, slot);
      } catch (e) {
        flash(`Couldn’t read subtitle: ${errMsg(e)}`);
      }
    },
    [loadSubtitleBytes, flash],
  );

  const chooseSubtitleFile = useCallback(
    async (slot: 'primary' | 'secondary' = 'primary') => {
      if (!ocean) return;
      const p = await ocean.openSubtitleDialog();
      if (p) loadSubtitlePath(p, slot);
    },
    [loadSubtitlePath],
  );

  const selectEmbedded = useCallback(
    async (index: number | null, slot: 'primary' | 'secondary' = 'primary') => {
      const set = slot === 'primary' ? setPrimary : setSecondary;
      if (index === null) {
        set(null);
        if (slot === 'primary') player.setBurnSubtitle(null);
        return;
      }
      const track = snap.info?.subtitles[index];
      if (!track) return;
      const label = [track.language?.toUpperCase(), track.title].filter(Boolean).join(' · ') || `Track ${index + 1}`;
      if (track.kind === 'image') {
        // PGS / VobSub are pictures: ffmpeg burns them into the video.
        set(null);
        player.setBurnSubtitle(index);
        flash(`Subtitle: ${label} (rendered into video)`);
        return;
      }
      if (slot === 'primary') player.setBurnSubtitle(null);
      if (snap.info?.isUrl) {
        // Online file: cues are extracted live alongside the video stream; no whole-file read.
        set({ label, cues: [], embedded: index, live: true });
        setSubsVisible(true);
        flash(`Subtitle: ${label}`);
        return;
      }
      flash('Loading subtitle…');
      try {
        const res = await player.extractSubtitle(index);
        if (!res) return;
        const cues = parseSubtitles(res.text);
        set({ label, cues, embedded: index });
        setSubsVisible(true);
        flash(`Subtitle: ${label}`);
      } catch (e) {
        flash(`Couldn’t load subtitle: ${errMsg(e)}`);
      }
    },
    [snap.info, player, flash],
  );

  // Auto-load: same-name file next to the video, else the preferred embedded text track.
  const autoLoadedFor = useRef<string | null>(null);
  useEffect(() => {
    const info = snap.info;
    if (!info || !snap.input || autoLoadedFor.current === snap.input || !settings.autoLoadSubtitles) return;
    autoLoadedFor.current = snap.input;
    (async () => {
      if (ocean && !info.isUrl) {
        const sidecar = await ocean.findSubtitle(info.input).catch(() => null);
        if (sidecar) return loadSubtitlePath(sidecar);
      }
      const text = info.subtitles.filter((s) => s.kind === 'text');
      const pick =
        text.find((s) => languageMatches(s.language, settings.preferredSubtitleLanguage)) ??
        text.find((s) => s.forced) ??
        text.find((s) => s.isDefault);
      if (pick) selectEmbedded(pick.index);
    })();
  }, [snap.info, snap.input, settings.autoLoadSubtitles, settings.preferredSubtitleLanguage, loadSubtitlePath, selectEmbedded]);

  const saveSubtitle = useCallback(async () => {
    if (!primary || !ocean) return;
    const base = (snap.title || 'subtitle').replace(/[\\/:*?"<>|]/g, '_');
    const cues = primary.live && primary.embedded !== undefined ? player.liveCuesFor(primary.embedded) : primary.cues;
    const path = await ocean.saveSubtitleDialog(`${base}.srt`, toSrt(cues, subDelay));
    if (path) flash('Subtitle saved');
  }, [primary, subDelay, snap.title, flash]);

  const subtitleOptions = useMemo(() => {
    const opts: { key: string; label: string; select: () => void; active: boolean }[] = [
      { key: 'off', label: 'Off', select: () => selectEmbedded(null), active: !primary && snap.burnSubtitle === null },
    ];
    snap.info?.subtitles.forEach((s) => {
      const label = [s.language?.toUpperCase(), s.title, s.kind === 'image' ? `(${s.codec.replace('hdmv_pgs_subtitle', 'PGS').replace('dvd_subtitle', 'VobSub')})` : '']
        .filter(Boolean)
        .join(' · ') || `Track ${s.index + 1}`;
      opts.push({
        key: `e${s.index}`,
        label,
        select: () => selectEmbedded(s.index),
        active: primary?.embedded === s.index || snap.burnSubtitle === s.index,
      });
    });
    if (primary && primary.embedded === undefined) opts.push({ key: 'ext', label: primary.label, select: () => {}, active: true });
    return opts;
  }, [snap.info, snap.burnSubtitle, primary, selectEmbedded]);

  /** Back to the first view: stops playback and clears the queue; the position is already saved for resume. */
  const goHome = useCallback(() => {
    if (snap.input) savePosition(snap.input, snap.time, snap.duration);
    if (online && !snap.ended) recordNow(snap.time, snap.duration);
    player.unload();
    resetPerFile();
    setOnline(null);
    setPlaylist([]);
    setPlIndex(-1);
    setPlaylistOpen(false);
    setPicker(null);
  }, [player, snap.input, snap.time, snap.duration, snap.ended, online, recordNow]);

  // ---------- window modes ----------
  const toggleFullscreen = useCallback(() => {
    if (mini) return;
    if (ocean) ocean.setFullscreen(!fullscreen);
    else if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  }, [fullscreen, mini]);

  const toggleMini = useCallback(() => {
    const next = !mini;
    setMini(next);
    const ar = snap.videoWidth && snap.videoHeight ? snap.videoWidth / snap.videoHeight : 16 / 9;
    ocean?.setMini(next, ar);
  }, [mini, snap.videoWidth, snap.videoHeight]);

  const toggleOnTop = useCallback(() => {
    const next = !onTop;
    setOnTop(next);
    ocean?.setAlwaysOnTop(next);
    flash(next ? 'Always on top' : 'Always on top: off');
  }, [onTop, flash]);

  const togglePip = useCallback(async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (snap.input) await player.video.requestPictureInPicture();
    } catch {
      flash('Picture in picture is not available for this video');
    }
  }, [player, snap.input, flash]);

  useEffect(() => {
    if (!ocean) return;
    ocean.takePendingFile().then((p) => {
      if (p) openFiles([p]);
    });
    const off1 = ocean.onOpenFile((p) => openFiles([p]));
    const off2 = ocean.onWindowState((s) => {
      if (s.maximized !== undefined) setMaximized(s.maximized);
      if (s.fullscreen !== undefined) setFullscreen(s.fullscreen);
    });
    return () => {
      off1();
      off2();
    };
  }, [openFiles]);

  // Auto-hide controls in fullscreen / mini mode.
  const idleTimer = useRef<number>();
  const poke = useCallback(() => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), 2500);
  }, []);

  // ---------- actions ----------
  const setVolume = useCallback(
    (v: number) => {
      const next = Math.max(0, Math.min(settings.maxVolume, Math.round(v * 100) / 100));
      player.setVolume(next);
      flash(`Volume ${Math.round(next * 100)}%`);
    },
    [player, settings.maxVolume, flash],
  );

  const setRate = useCallback(
    (r: number) => {
      player.setRate(r);
      flash(`Speed ${player.getSnapshot().rate}×`);
    },
    [player, flash],
  );

  const changeAudioDelay = useCallback(
    (d: number) => {
      player.setAudioDelay(d);
      flash(`Audio delay ${d > 0 ? '+' : ''}${d.toFixed(1)} s`);
    },
    [player, flash],
  );

  const changeSubDelay = useCallback(
    (d: number) => {
      const v = Math.round(d * 10) / 10;
      setSubDelay(v);
      flash(`Subtitle delay ${v > 0 ? '+' : ''}${v.toFixed(1)} s`);
    },
    [flash],
  );

  const takeScreenshot = useCallback(async () => {
    try {
      const p = await player.screenshot();
      if (p) flash('Screenshot saved to Pictures\\Ocean');
    } catch (e) {
      flash(`Screenshot failed: ${errMsg(e)}`);
    }
  }, [player, flash]);

  const toggleAb = useCallback(() => {
    if (ab.a === undefined) {
      setAb({ a: snap.time });
      flash(`A-B repeat: A = ${formatTime(snap.time)}`);
    } else if (ab.b === undefined && snap.time > ab.a) {
      setAb({ a: ab.a, b: snap.time });
      flash(`A-B repeat: ${formatTime(ab.a)} → ${formatTime(snap.time)}`);
    } else {
      setAb({});
      flash('A-B repeat off');
    }
  }, [ab, snap.time, flash]);

  const cycleAudio = useCallback(() => {
    const n = snap.info?.audio.length ?? 0;
    if (n < 2) return flash(n ? 'Only one audio track' : 'No audio');
    const next = (snap.audioIndex + 1) % n;
    player.setAudioTrack(next);
    const a = snap.info!.audio[next];
    flash(`Audio: ${[a.language?.toUpperCase(), a.title, a.codec.toUpperCase()].filter(Boolean).join(' · ')}`);
  }, [snap.info, snap.audioIndex, player, flash]);

  const cycleSubtitle = useCallback(() => {
    const i = subtitleOptions.findIndex((o) => o.active);
    const next = subtitleOptions[(i + 1) % subtitleOptions.length];
    next.select();
    if (next.key === 'off') flash('Subtitles off');
  }, [subtitleOptions, flash]);

  const run = useCallback(
    (id: ActionId) => {
      const has = !!snap.input;
      switch (id) {
        case 'open': return openDialog();
        case 'openUrl': return setDialog('openUrl');
        case 'loadSubtitle': return has && chooseSubtitleFile();
        case 'playPause': return has && player.toggle();
        case 'seekForward': return has && player.seekBy(settings.seekStep);
        case 'seekBackward': return has && player.seekBy(-settings.seekStep);
        case 'seekForwardLarge': return has && player.seekBy(settings.seekStepLarge);
        case 'seekBackwardLarge': return has && player.seekBy(-settings.seekStepLarge);
        case 'frameNext': return has && player.frameStep(1);
        case 'framePrev': return has && player.frameStep(-1);
        case 'speedUp': return setRate(SPEEDS.find((s) => s > snap.rate + 0.001) ?? 4);
        case 'speedDown': return setRate([...SPEEDS].reverse().find((s) => s < snap.rate - 0.001) ?? 0.25);
        case 'speedReset': return setRate(1);
        case 'abRepeat': return has && toggleAb();
        case 'next': return goNext();
        case 'prev': return goPrev();
        case 'volumeUp': return setVolume((snap.muted ? 0 : snap.volume) + 0.05);
        case 'volumeDown': return setVolume(snap.volume - 0.05);
        case 'mute':
          player.setMuted(!snap.muted);
          return flash(snap.muted ? `Volume ${Math.round(snap.volume * 100)}%` : 'Muted');
        case 'cycleAudio': return has && cycleAudio();
        case 'audioDelayPlus': return has && changeAudioDelay(snap.audioDelay + 0.1);
        case 'audioDelayMinus': return has && changeAudioDelay(snap.audioDelay - 0.1);
        case 'toggleSubtitles':
          setSubsVisible((v) => !v);
          return flash(subsVisible ? 'Subtitles hidden' : 'Subtitles shown');
        case 'cycleSubtitle': return has && cycleSubtitle();
        case 'subDelayPlus': return changeSubDelay(subDelay + 0.1);
        case 'subDelayMinus': return changeSubDelay(subDelay - 0.1);
        case 'fullscreen': return toggleFullscreen();
        case 'exitFullscreen':
          if (menu) return setMenu(null);
          if (playlistOpen) return setPlaylistOpen(false);
          if (mini) return toggleMini();
          if (fullscreen) return toggleFullscreen();
          return;
        case 'screenshot': return has && takeScreenshot();
        case 'alwaysOnTop': return toggleOnTop();
        case 'miniPlayer': return has && toggleMini();
        case 'pip': return togglePip();
        case 'playlist': return setPlaylistOpen((o) => !o);
        case 'cycleAspect': {
          const i = ASPECTS.findIndex((a) => a.id === aspect);
          const next = ASPECTS[(i + 1) % ASPECTS.length];
          setAspect(next.id);
          return flash(`Aspect ratio: ${next.label}`);
        }
        case 'zoomIn':
          setZoom((z) => Math.min(4, Math.round((z + 0.1) * 10) / 10));
          return flash(`Zoom ${Math.round(Math.min(4, zoom + 0.1) * 100)}%`);
        case 'zoomOut':
          setZoom((z) => Math.max(0.3, Math.round((z - 0.1) * 10) / 10));
          return flash(`Zoom ${Math.round(Math.max(0.3, zoom - 0.1) * 100)}%`);
        case 'zoomReset':
          setZoom(1);
          return flash('Zoom 100%');
        case 'rotate':
          setRotate((r) => (r + 90) % 360);
          return flash(`Rotate ${(rotate + 90) % 360}°`);
        case 'mediaInfo': return snap.info && setDialog('mediaInfo');
        case 'settings': return setDialog('settings');
        case 'shortcuts': return setDialog('shortcuts');
        case 'help': return setDialog('help');
      }
    },
    [
      snap, settings.seekStep, settings.seekStepLarge, player, openDialog, chooseSubtitleFile, setRate, toggleAb, goNext, goPrev,
      setVolume, flash, cycleAudio, changeAudioDelay, subsVisible, cycleSubtitle, changeSubDelay, subDelay, toggleFullscreen,
      menu, playlistOpen, mini, toggleMini, fullscreen, takeScreenshot, toggleOnTop, togglePip, aspect, zoom, rotate,
    ],
  );

  const keys = useMemo(() => keymap(settings.shortcuts), [settings.shortcuts]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, select, textarea, .menu')) return;
      if ((dialog || picker) && e.key !== 'Escape') return;
      const k = eventToKey(e);
      const id = k && keys.get(k);
      if (!id) return;
      e.preventDefault();
      run(id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keys, run, dialog, picker]);

  const hint = (id: ActionId) => {
    const k = keysFor(id, settings.shortcuts)[0];
    return k ? prettyKey(k) : undefined;
  };

  // ---------- menus ----------
  const recentMenu = (): MenuEntry[] => {
    const recent = getRecent();
    if (!recent.length) return [{ label: 'No recent files', disabled: true }];
    return [
      ...recent.map((r) => ({
        label: r.title,
        hint: r.position ? formatTime(r.position) : undefined,
        onSelect: () => (isUrl(r.input) ? openUrl(r.input) : openFiles([r.input])),
      })),
      { type: 'divider' as const },
      { label: 'Clear recent files', onSelect: clearRecent },
    ];
  };

  const audioMenu = (): MenuEntry[] => {
    const tracks = snap.info?.audio ?? [];
    return [
      ...(tracks.length
        ? tracks.map((a) => ({
            label: [a.language?.toUpperCase(), a.title, `${a.codec.toUpperCase()} ${a.channels}ch`].filter(Boolean).join(' · '),
            checked: a.index === snap.audioIndex,
            onSelect: () => player.setAudioTrack(a.index),
          }))
        : [{ label: 'No audio tracks', disabled: true }]),
      { type: 'divider' },
      { label: `Delay: ${snap.audioDelay > 0 ? '+' : ''}${snap.audioDelay.toFixed(1)} s`, disabled: true },
      { label: 'Delay +0.1 s', hint: hint('audioDelayPlus'), keepOpen: true, disabled: !snap.input, onSelect: () => changeAudioDelay(snap.audioDelay + 0.1) },
      { label: 'Delay −0.1 s', hint: hint('audioDelayMinus'), keepOpen: true, disabled: !snap.input, onSelect: () => changeAudioDelay(snap.audioDelay - 0.1) },
      { label: 'Reset delay', disabled: snap.audioDelay === 0, onSelect: () => changeAudioDelay(0) },
      { type: 'divider' },
      { label: 'Normalize volume', checked: settings.normalize, onSelect: () => updateSettings({ normalize: !settings.normalize }) },
      { label: 'Equalizer & effects…', onSelect: () => setDialog('audio') },
    ];
  };

  const subtitlesMenu = (): MenuEntry[] => [
    { label: 'Load Subtitle', hint: hint('loadSubtitle'), disabled: !snap.input, onSelect: () => chooseSubtitleFile() },
    { label: 'Save Subtitle', disabled: !primary, onSelect: saveSubtitle },
    { type: 'divider' },
    { label: 'Subtitle Settings', onSelect: () => setDialog('subtitleSettings') },
    { type: 'divider' },
    ...subtitleOptions.map((o) => ({ label: o.label, checked: o.active, onSelect: o.select })),
    {
      label: 'Secondary subtitle',
      disabled: !snap.input,
      submenu: (): MenuEntry[] => [
        { label: 'Off', checked: !secondary, onSelect: () => setSecondary(null) },
        ...(snap.info?.subtitles.filter((s) => s.kind === 'text') ?? []).map((s) => ({
          label: [s.language?.toUpperCase(), s.title].filter(Boolean).join(' · ') || `Track ${s.index + 1}`,
          checked: secondary?.embedded === s.index,
          onSelect: () => selectEmbedded(s.index, 'secondary'),
        })),
        { type: 'divider' },
        { label: 'Load file…', onSelect: () => chooseSubtitleFile('secondary') },
      ],
    },
    { type: 'divider' },
    { label: 'Search online…', disabled: !snap.input, onSelect: () => setDialog('subSearch') },
    { label: 'Show subtitles', hint: hint('toggleSubtitles'), checked: subsVisible, onSelect: () => setSubsVisible((v) => !v) },
  ];

  const playbackMenu = (): MenuEntry[] => [
    { label: snap.playing ? 'Pause' : 'Play', hint: hint('playPause'), disabled: !snap.input, onSelect: () => player.toggle() },
    {
      label: `Speed (${snap.rate}×)`,
      submenu: SPEEDS.map((s) => ({ label: s === 1 ? 'Normal' : `${s}×`, checked: Math.abs(s - snap.rate) < 0.001, onSelect: () => setRate(s) })),
    },
    { label: 'Next frame', hint: hint('frameNext'), disabled: !snap.input, onSelect: () => player.frameStep(1) },
    { label: 'Previous frame', hint: hint('framePrev'), disabled: !snap.input, onSelect: () => player.frameStep(-1) },
    {
      label: ab.a === undefined ? 'A-B repeat: set A' : ab.b === undefined ? 'A-B repeat: set B' : 'A-B repeat: off',
      hint: hint('abRepeat'),
      disabled: !snap.input,
      onSelect: toggleAb,
    },
    ...(snap.info?.chapters.length
      ? [{
          label: 'Chapters',
          submenu: snap.info.chapters.map((c) => ({
            label: c.title,
            hint: formatTime(c.start),
            checked: snap.time >= c.start && snap.time < c.end,
            onSelect: () => player.seek(c.start),
          })),
        }]
      : []),
    { type: 'divider' },
    { label: 'Next', hint: hint('next'), disabled: !navInfo.hasNext, onSelect: goNext },
    { label: 'Previous', hint: hint('prev'), disabled: !navInfo.hasPrev, onSelect: goPrev },
    {
      label: 'Repeat',
      submenu: (['off', 'all', 'one'] as RepeatMode[]).map((r) => ({
        label: r === 'off' ? 'Off' : r === 'all' ? 'Repeat all' : 'Repeat one',
        checked: repeat === r,
        onSelect: () => setRepeat(r),
      })),
    },
    { label: 'Shuffle', checked: shuffle, onSelect: () => setShuffle((s) => !s) },
    { label: 'Playlist', hint: hint('playlist'), checked: playlistOpen, onSelect: () => setPlaylistOpen((o) => !o) },
  ];

  const videoMenu = (): MenuEntry[] => [
    { label: 'Aspect ratio', submenu: ASPECTS.map((a) => ({ label: a.label, checked: aspect === a.id, onSelect: () => setAspect(a.id) })) },
    {
      label: 'Zoom',
      submenu: ZOOMS.map((z) => ({ label: `${z * 100}%`, checked: Math.abs(zoom - z) < 0.001, onSelect: () => setZoom(z) })),
    },
    {
      label: 'Rotate',
      submenu: [0, 90, 180, 270].map((r) => ({ label: r ? `${r}°` : 'None', checked: rotate === r, onSelect: () => setRotate(r) })),
    },
    { label: 'Flip horizontally', checked: flipH, onSelect: () => setFlipH((f) => !f) },
    { label: 'Flip vertically', checked: flipV, onSelect: () => setFlipV((f) => !f) },
    { label: 'Color adjustments…', onSelect: () => setDialog('videoAdjust') },
    { type: 'divider' },
    { label: 'Screenshot', hint: hint('screenshot'), disabled: !snap.input, onSelect: takeScreenshot },
    { label: 'Fullscreen', hint: hint('fullscreen'), checked: fullscreen, disabled: mini, onSelect: toggleFullscreen },
    { label: 'Mini player', hint: hint('miniPlayer'), checked: mini, disabled: !snap.input, onSelect: toggleMini },
    { label: 'Picture in picture', hint: hint('pip'), checked: pip, disabled: !snap.input, onSelect: togglePip },
    { label: 'Always on top', hint: hint('alwaysOnTop'), checked: onTop, onSelect: toggleOnTop },
    { type: 'divider' },
    { label: 'Media info', hint: hint('mediaInfo'), disabled: !snap.info, onSelect: () => setDialog('mediaInfo') },
  ];

  const rootMenu = (): MenuEntry[] => [
    { label: 'Open New File', primary: true, icon: <OpenFileSmallIcon />, onSelect: openDialog },
    { label: 'Recent Files', submenu: recentMenu },
    { type: 'divider' },
    { label: 'Playback', submenu: playbackMenu },
    { label: 'Video', submenu: videoMenu },
    { label: 'Audio', submenu: audioMenu },
    { label: 'Subtitles', submenu: subtitlesMenu },
    { type: 'divider' },
    { label: 'Open URL', hint: hint('openUrl'), onSelect: () => setDialog('openUrl') },
    { label: 'Settings', onSelect: () => setDialog('settings') },
    { label: 'Shortcuts', onSelect: () => setDialog('shortcuts') },
    { label: 'Help', onSelect: () => setDialog('help') },
  ];

  const onlineSources = useMemo(() => {
    if (!online) return [];
    const ep = online.details.episodes[online.episode];
    return [...(ep ? ep.sources : online.details.sources)].sort(compareSources);
  }, [online]);
  const sizeOf = useSizes(onlineSources.map((x) => x.url));

  // ---------- online controls (version / quality / season / episode) ----------
  const onlineExtra = (() => {
    if (!online) return undefined;
    const { details } = online;
    const ep = details.episodes[online.episode];
    const sources = onlineSources;
    const chevron = (
      <svg width="8" height="5" viewBox="0 0 8 5" fill="none">
        <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
    const anchor = (e: React.MouseEvent, items: MenuEntry[]) => {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setMenu({ x: r.left, y: r.top, items, above: true });
    };
    const seasons = [...new Set(details.episodes.map((x) => x.season))];
    const groups = [...new Set(sources.map((s) => s.group))];
    const qualityMenu: MenuEntry[] = groups.flatMap((g, gi) => [
      ...(gi ? [{ type: 'divider' as const }] : []),
      { type: 'header' as const, label: GROUP_LABEL[g] },
      ...sources
        .filter((s) => s.group === g)
        .map((s) => ({
          label: s.label,
          hint: sizeOf(s.url),
          checked: s.url === online.source.url,
          onSelect: () => switchSource(s),
        })),
    ]);
    const short = (s: OnlineSource) => {
      const h = s.height >= 2160 ? '4K' : s.height ? `${s.height}p` : s.label;
      return `${h}${/x265|10bit/i.test(s.label) ? ' x265' : ''}`;
    };
    return (
      <>
        {ep && (
          <button
            className="pill"
            onClick={(e) =>
              anchor(
                e,
                seasons.map((sn) => ({
                  label: `Season ${sn}`,
                  checked: sn === ep.season,
                  submenu: details.episodes
                    .map((x, i) => ({ x, i }))
                    .filter(({ x }) => x.season === sn)
                    .map(({ x, i }) => ({
                      label: `Episode ${x.episode}${x.title ? ` · ${x.title}` : ''}`,
                      checked: i === online.episode,
                      onSelect: () => playOnline(details, i, online.source),
                    })),
                })),
              )
            }
          >
            S{String(ep.season).padStart(2, '0')} · E{String(ep.episode).padStart(2, '0')} {chevron}
          </button>
        )}
        <button className="pill" onClick={(e) => anchor(e, qualityMenu)} title={`${online.source.groupTitle} — ${online.source.label}`}>
          <span className="pill__group">{GROUP_LABEL[online.source.group]}</span>
          {short(online.source)} {chevron}
        </button>
      </>
    );
  })();

  // ---------- render ----------
  const box = videoBox(stage.w, stage.h, snap.videoWidth, snap.videoHeight, aspect, zoom, rotate);
  const videoStyle: React.CSSProperties = {
    width: box.w,
    height: box.h,
    transform: `translate(-50%, -50%) rotate(${rotate}deg) scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})`,
    filter:
      adjust === DEFAULT_ADJUST
        ? undefined
        : `brightness(${adjust.brightness}%) contrast(${adjust.contrast}%) saturate(${adjust.saturation}%) hue-rotate(${adjust.hue}deg)`,
  };
  useEffect(() => {
    Object.assign(player.video.style, {
      width: `${videoStyle.width}px`,
      height: `${videoStyle.height}px`,
      transform: videoStyle.transform,
      filter: videoStyle.filter ?? '',
    });
  });

  const primaryList = useMemo(
    () => (primary?.live && primary.embedded !== undefined ? player.liveCuesFor(primary.embedded) : (primary?.cues ?? [])),
    [primary, player, snap.cueVersion],
  );
  const secondaryList = useMemo(
    () => (secondary?.live && secondary.embedded !== undefined ? player.liveCuesFor(secondary.embedded) : (secondary?.cues ?? [])),
    [secondary, player, snap.cueVersion],
  );
  const primaryCues = subsVisible && primary ? cuesAt(primaryList, snap.time, subDelay) : [];
  const secondaryCues = subsVisible && secondary ? cuesAt(secondaryList, snap.time, subDelay) : [];
  const isHome = !snap.input;
  const title = snap.title;

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const paths = files.map((f) => ocean?.pathForFile(f) || '').filter(Boolean);
    const subs = paths.filter((p) => SUB_RE.test(p));
    const media = paths.filter((p) => MEDIA_RE.test(p));
    if (media.length) {
      if (e.shiftKey || (playlistOpen && snap.input)) {
        setPlaylist((pl) => [...pl, ...media.map((p) => ({ input: p, title: titleFromInput(p) }))]);
        flash(`${media.length} added to playlist`);
      } else await openFiles(media);
    }
    if (subs.length && (snap.input || media.length)) loadSubtitlePath(subs[0]);
    if (!ocean && files[0]) play(URL.createObjectURL(files[0]), files[0].name);
  };

  return (
    <div
      className={`app ${isHome ? 'is-home' : ''} ${fullscreen ? 'is-fullscreen' : ''} ${mini ? 'is-mini' : ''} ${idle && snap.playing && !menu ? 'is-idle' : ''}`}
      onMouseMove={poke}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {!mini && (
        <TitleBar
          title={title}
          maximized={maximized}
          fullscreen={fullscreen}
          canGoHome={!isHome}
          menuOpen={!!menu && !menu.items}
          onMenuClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setMenu(menu && !menu.items ? null : { x: 16, y: r.bottom + 6 });
          }}
          onHome={goHome}
          onToggleFullscreen={toggleFullscreen}
        />
      )}

      {mini && (
        <div className="mini-bar">
          <button className="wc" style={{ height: 28, width: 32 }} aria-label="Exit mini player" onClick={toggleMini}>
            <RestoreIcon />
          </button>
          <button className="wc wc--close" style={{ height: 28, width: 32 }} aria-label="Close" onClick={() => ocean?.close()}>
            <CloseIcon />
          </button>
        </div>
      )}

      <main
        ref={stageRef}
        className={`stage ${isHome ? 'stage--home' : ''}`}
        onClick={() => {
          if (menu) return setMenu(null);
          if (!isHome) player.toggle();
        }}
        onDoubleClick={() => !isHome && toggleFullscreen()}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        onWheel={(e) => {
          if (isHome || (e.target as HTMLElement).closest('.playlist')) return;
          setVolume((snap.muted ? 0 : snap.volume) + (e.deltaY < 0 ? 0.05 : -0.05));
        }}
      >
        <div ref={videoHost} className="stage__host" hidden={isHome} />
        {isHome && <Home onPick={pickOnline} onResume={resumeOnline} onOpenFile={openDialog} onOpenSettings={() => setDialog('settings')} />}

        {!isHome && (
          <>
            <SubtitleOverlay cues={secondaryCues} style={settings.secondarySubtitleStyle} stageHeight={stage.h} secondary />
            <SubtitleOverlay cues={primaryCues} style={settings.subtitleStyle} stageHeight={stage.h} />
          </>
        )}
        {snap.loading && !isHome && !snap.error && <div className="stage__spinner" />}
        {snap.error && <div className="stage__error">{snap.error}</div>}
        {osd && <div className="osd">{osd}</div>}
        <UpdateToast u={updates} />

        {playlistOpen && (
          <Playlist
            items={playlist}
            index={plIndex}
            repeat={repeat}
            shuffle={shuffle}
            onPlay={playPlaylistIndex}
            onRemove={(i) => {
              setPlaylist((pl) => pl.filter((_, j) => j !== i));
              if (i < plIndex) setPlIndex(plIndex - 1);
            }}
            onRepeat={setRepeat}
            onShuffle={setShuffle}
            onAdd={async () => {
              const p = await ocean?.openVideoDialog();
              if (p) setPlaylist((pl) => [...pl, { input: p, title: titleFromInput(p) }]);
            }}
            onClear={() => {
              setPlaylist([]);
              setPlIndex(-1);
            }}
            onClose={() => setPlaylistOpen(false)}
          />
        )}
      </main>

      {!isHome && (
      <ControlBar
        disabled={isHome}
        playing={snap.playing}
        time={snap.time}
        duration={snap.duration}
        buffered={snap.bufferedEnd}
        chapters={snap.info?.chapters ?? []}
        abRepeat={ab}
        cached={cached}
        volume={snap.volume}
        maxVolume={settings.maxVolume}
        muted={snap.muted}
        captionsOn={subsVisible && (!!primary || snap.burnSubtitle !== null)}
        hasPrev={navInfo.hasPrev || (!!snap.input && snap.time > 5)}
        hasNext={navInfo.hasNext}
        extra={onlineExtra}
        thumbnail={snap.info?.video && !snap.info.isUrl ? (t) => player.thumbnail(t) : undefined}
        onTogglePlay={() => player.toggle()}
        onPrev={goPrev}
        onNext={goNext}
        onSeek={(t) => player.seek(t)}
        onScrubStart={() => {}}
        onScrubEnd={() => {}}
        onVolume={(v) => player.setVolume(v)}
        onToggleMute={() => player.setMuted(!snap.muted)}
        onCaptions={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setMenu({ x: r.left - 80, y: r.top, items: subtitlesMenu(), above: true });
        }}
      />
      )}

      {menu && <Menu items={menu.items ?? rootMenu()} x={menu.x} y={menu.y} above={menu.above} onClose={() => setMenu(null)} />}

      {picker && (
        <OnlinePickerDialog
          title={picker.title}
          details={picker.details}
          error={picker.error}
          initialEpisode={picker.initialEpisode}
          pref={online?.details.title.id === picker.title.id ? online.source : undefined}
          onPlay={(episode, source) => {
            const d = picker.details!;
            setPicker(null);
            playOnline(d, episode, source);
          }}
          onRetry={() => pickOnline(picker.title)}
          onClose={() => setPicker(null)}
        />
      )}
      {dialog === 'subtitleSettings' && (
        <SubtitleSettingsDialog
          style={settings.subtitleStyle}
          secondaryStyle={settings.secondarySubtitleStyle}
          delay={subDelay}
          hasSecondary={!!secondary}
          onStyle={(subtitleStyle) => updateSettings({ subtitleStyle })}
          onSecondaryStyle={(secondarySubtitleStyle) => updateSettings({ secondarySubtitleStyle })}
          onDelay={changeSubDelay}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'audio' && (
        <EqualizerDialog
          enabled={settings.eqEnabled}
          gains={settings.eqGains}
          preset={settings.eqPreset}
          normalize={settings.normalize}
          audioDelay={snap.audioDelay}
          onEnabled={(eqEnabled) => updateSettings({ eqEnabled })}
          onGains={(eqGains, eqPreset) => updateSettings({ eqGains, eqPreset, eqEnabled: true })}
          onNormalize={(normalize) => updateSettings({ normalize })}
          onAudioDelay={changeAudioDelay}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'videoAdjust' && <VideoAdjustDialog value={adjust} onChange={setAdjust} onClose={() => setDialog(null)} />}
      {dialog === 'mediaInfo' && snap.info && <MediaInfoDialog info={snap.info} plan={snap.plan} onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsDialog settings={settings} onChange={updateSettings} onClose={() => setDialog(null)} updates={updates} onWhatsNew={() => setDialog('whatsNew')} />}
      {dialog === 'whatsNew' && <WhatsNewDialog onClose={() => setDialog('settings')} />}
      {dialog === 'shortcuts' && (
        <ShortcutsDialog overrides={settings.shortcuts} onChange={(shortcuts) => updateSettings({ shortcuts })} onClose={() => setDialog(null)} />
      )}
      {dialog === 'help' && <HelpDialog onClose={() => setDialog(null)} onShortcuts={() => setDialog('shortcuts')} />}
      {dialog === 'openUrl' && (
        <OpenUrlDialog
          onOpen={(u) => {
            setDialog(null);
            openUrl(u);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'subSearch' && (
        <SubtitleSearchDialog
          initialQuery={title}
          filePath={snap.info && !snap.info.isUrl ? snap.info.input : undefined}
          apiKey={settings.openSubtitlesApiKey}
          languages={settings.subtitleLanguages}
          onLoaded={(bytes, label) => loadSubtitleBytes(bytes, label)}
          onOpenSettings={() => setDialog('settings')}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

