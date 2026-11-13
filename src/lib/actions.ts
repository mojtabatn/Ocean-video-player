export type ActionId =
  | 'open' | 'openUrl' | 'loadSubtitle'
  | 'playPause' | 'seekForward' | 'seekBackward' | 'seekForwardLarge' | 'seekBackwardLarge'
  | 'frameNext' | 'framePrev' | 'speedUp' | 'speedDown' | 'speedReset' | 'abRepeat'
  | 'next' | 'prev' | 'volumeUp' | 'volumeDown' | 'mute'
  | 'cycleAudio' | 'audioDelayPlus' | 'audioDelayMinus'
  | 'toggleSubtitles' | 'cycleSubtitle' | 'subDelayPlus' | 'subDelayMinus'
  | 'fullscreen' | 'exitFullscreen' | 'screenshot' | 'alwaysOnTop' | 'miniPlayer' | 'pip'
  | 'playlist' | 'cycleAspect' | 'zoomIn' | 'zoomOut' | 'zoomReset' | 'rotate'
  | 'mediaInfo' | 'settings' | 'shortcuts' | 'help';

export type ActionDef = { id: ActionId; label: string; group: string; keys: string[] };

export const ACTIONS: ActionDef[] = [
  { id: 'open', label: 'Open file', group: 'File', keys: ['Ctrl+O'] },
  { id: 'openUrl', label: 'Open URL', group: 'File', keys: ['Ctrl+U'] },
  { id: 'loadSubtitle', label: 'Load subtitle', group: 'File', keys: ['Ctrl+Shift+O'] },

  { id: 'playPause', label: 'Play / Pause', group: 'Playback', keys: ['Space', 'K'] },
  { id: 'seekForward', label: 'Forward 5 s', group: 'Playback', keys: ['ArrowRight'] },
  { id: 'seekBackward', label: 'Back 5 s', group: 'Playback', keys: ['ArrowLeft'] },
  { id: 'seekForwardLarge', label: 'Forward 30 s', group: 'Playback', keys: ['Shift+ArrowRight'] },
  { id: 'seekBackwardLarge', label: 'Back 30 s', group: 'Playback', keys: ['Shift+ArrowLeft'] },
  { id: 'frameNext', label: 'Next frame', group: 'Playback', keys: ['.'] },
  { id: 'framePrev', label: 'Previous frame', group: 'Playback', keys: [','] },
  { id: 'speedUp', label: 'Faster', group: 'Playback', keys: [']'] },
  { id: 'speedDown', label: 'Slower', group: 'Playback', keys: ['['] },
  { id: 'speedReset', label: 'Normal speed', group: 'Playback', keys: ['\\'] },
  { id: 'abRepeat', label: 'A-B repeat', group: 'Playback', keys: ['R'] },
  { id: 'next', label: 'Next file', group: 'Playback', keys: ['PageDown'] },
  { id: 'prev', label: 'Previous file', group: 'Playback', keys: ['PageUp'] },

  { id: 'volumeUp', label: 'Volume up', group: 'Audio', keys: ['ArrowUp'] },
  { id: 'volumeDown', label: 'Volume down', group: 'Audio', keys: ['ArrowDown'] },
  { id: 'mute', label: 'Mute', group: 'Audio', keys: ['M'] },
  { id: 'cycleAudio', label: 'Next audio track', group: 'Audio', keys: ['A'] },
  { id: 'audioDelayPlus', label: 'Audio delay +0.1 s', group: 'Audio', keys: ['Ctrl+='] },
  { id: 'audioDelayMinus', label: 'Audio delay −0.1 s', group: 'Audio', keys: ['Ctrl+-'] },

  { id: 'toggleSubtitles', label: 'Show / hide subtitles', group: 'Subtitles', keys: ['C'] },
  { id: 'cycleSubtitle', label: 'Next subtitle track', group: 'Subtitles', keys: ['S'] },
  { id: 'subDelayPlus', label: 'Subtitle delay +0.1 s', group: 'Subtitles', keys: ['H'] },
  { id: 'subDelayMinus', label: 'Subtitle delay −0.1 s', group: 'Subtitles', keys: ['G'] },

  { id: 'fullscreen', label: 'Fullscreen', group: 'Video', keys: ['F', 'F11', 'Enter'] },
  { id: 'exitFullscreen', label: 'Exit fullscreen / close', group: 'Video', keys: ['Escape'] },
  { id: 'screenshot', label: 'Screenshot', group: 'Video', keys: ['Ctrl+E'] },
  { id: 'alwaysOnTop', label: 'Always on top', group: 'Video', keys: ['Ctrl+T'] },
  { id: 'miniPlayer', label: 'Mini player', group: 'Video', keys: ['Ctrl+M'] },
  { id: 'pip', label: 'Picture in picture', group: 'Video', keys: ['Ctrl+P'] },
  { id: 'cycleAspect', label: 'Aspect ratio', group: 'Video', keys: ['Ctrl+A'] },
  { id: 'zoomIn', label: 'Zoom in', group: 'Video', keys: ['Alt+ArrowUp'] },
  { id: 'zoomOut', label: 'Zoom out', group: 'Video', keys: ['Alt+ArrowDown'] },
  { id: 'zoomReset', label: 'Reset zoom', group: 'Video', keys: ['Alt+0'] },
  { id: 'rotate', label: 'Rotate 90°', group: 'Video', keys: ['Ctrl+R'] },

  { id: 'playlist', label: 'Playlist', group: 'Window', keys: ['Ctrl+L'] },
  { id: 'mediaInfo', label: 'Media info', group: 'Window', keys: ['Ctrl+I'] },
  { id: 'settings', label: 'Settings', group: 'Window', keys: ['Ctrl+,'] },
  { id: 'shortcuts', label: 'Keyboard shortcuts', group: 'Window', keys: ['Ctrl+/'] },
  { id: 'help', label: 'Help', group: 'Window', keys: ['F1'] },
];

const NAMED: Record<string, string> = { ' ': 'Space', '+': '=' };

/** "Ctrl+Shift+ArrowRight" style key string for a keyboard event. */
export function eventToKey(e: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
  let key = NAMED[e.key] ?? e.key;
  if (key.length === 1) key = key.toUpperCase();
  // Shifted symbols ("<", "{") would otherwise depend on keyboard layout; use the physical key.
  if (e.shiftKey && key.length === 1 && !/[A-Z0-9]/.test(key) && e.code.startsWith('Digit')) key = e.code.slice(5);
  const mods = [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : ''].filter(Boolean);
  return [...mods, key].join('+');
}

export function keymap(overrides: Record<string, string[]>) {
  const map = new Map<string, ActionId>();
  for (const a of ACTIONS) for (const k of overrides[a.id] ?? a.keys) map.set(k, a.id);
  return map;
}

export function keysFor(id: ActionId, overrides: Record<string, string[]>) {
  return overrides[id] ?? ACTIONS.find((a) => a.id === id)?.keys ?? [];
}

export function prettyKey(k: string) {
  return k.replace('Arrow', '').replace('Space', 'Space').replace('Escape', 'Esc');
}
