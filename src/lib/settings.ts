import { useCallback, useState } from 'react';
import { load, save } from './storage';

export type SubtitleStyle = {
  /** Font id from lib/fonts.ts. */
  font: string;
  /** Colour for parts the subtitle file coloured (translator credits, site address): the file's own or ours. */
  secondaryColorMode: 'file' | 'custom';
  secondaryColor: string;
  size: number; // px at 1080p; scaled to the stage height
  color: string;
  outline: number; // px
  outlineColor: string;
  background: 'none' | 'box';
  bold: boolean;
  /** Distance from the bottom, % of stage height. */
  position: number;
};

export type Settings = {
  resumePlayback: boolean;
  autoPlayNext: boolean;
  rememberVolume: boolean;
  volume: number;
  maxVolume: 1 | 1.5 | 2;
  seekStep: number;
  seekStepLarge: number;
  autoLoadSubtitles: boolean;
  subtitleStyle: SubtitleStyle;
  secondarySubtitleStyle: SubtitleStyle;
  preferredAudioLanguage: string;
  preferredSubtitleLanguage: string;
  openSubtitlesApiKey: string;
  subtitleLanguages: string;
  shortcuts: Record<string, string[]>;
  eqEnabled: boolean;
  eqGains: number[];
  eqPreset: string;
  normalize: boolean;
  /** Disk cache for online playback, in GB. */
  cacheLimitGb: number;
  /** Still play from download servers whose security certificate has expired (download servers only, no cookies). */
  allowExpiredCerts: boolean;
  /** Look for new Ocean versions on GitHub and show a message when one is ready. */
  autoUpdateCheck: boolean;
};

export const DEFAULT_SUB_STYLE: SubtitleStyle = {
  font: 'vazirmatn',
  secondaryColorMode: 'file',
  secondaryColor: '#ffd54f',
  size: 44,
  color: '#ffffff',
  outline: 2,
  outlineColor: '#000000',
  background: 'none',
  bold: true,
  position: 7,
};

export const DEFAULT_SETTINGS: Settings = {
  resumePlayback: true,
  autoPlayNext: true,
  rememberVolume: true,
  volume: 1,
  maxVolume: 2,
  seekStep: 5,
  seekStepLarge: 30,
  autoLoadSubtitles: true,
  subtitleStyle: DEFAULT_SUB_STYLE,
  secondarySubtitleStyle: { ...DEFAULT_SUB_STYLE, size: 34, color: '#ffe680', position: 88 },
  preferredAudioLanguage: '',
  preferredSubtitleLanguage: 'fa',
  openSubtitlesApiKey: '',
  subtitleLanguages: 'fa,en',
  shortcuts: {},
  eqEnabled: false,
  eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  eqPreset: 'Flat',
  normalize: false,
  cacheLimitGb: 3,
  allowExpiredCerts: true,
  autoUpdateCheck: true,
};

const KEY = 'ocean.settings';

export function useSettings() {
  const [settings, setState] = useState<Settings>(() => {
    const s = load(KEY, DEFAULT_SETTINGS);
    return {
      ...s,
      subtitleStyle: { ...DEFAULT_SUB_STYLE, ...s.subtitleStyle },
      secondarySubtitleStyle: { ...DEFAULT_SETTINGS.secondarySubtitleStyle, ...s.secondarySubtitleStyle },
    };
  });
  const update = useCallback((patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) => {
    setState((prev) => {
      const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
      save(KEY, next);
      return next;
    });
  }, []);
  return [settings, update] as const;
}
