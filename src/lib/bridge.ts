import type { OceanApi } from '../../electron/preload';

declare global {
  interface Window {
    ocean?: OceanApi;
  }
}

/** Electron bridge; undefined when the UI runs in a plain browser (design previews). */
export const ocean = window.ocean;
