import { useCallback, useEffect, useRef, useState } from 'react';
import type { UpdateInfo, UpdateProgress } from '../../shared/app';
import { ocean } from './bridge';

const DISMISSED = 'ocean.update.dismissed';
const SIX_HOURS = 6 * 3600_000;

export type UpdateState = {
  info: UpdateInfo | null;
  checking: boolean;
  progress: UpdateProgress | null;
  /** The toast for this version was closed by the user. */
  dismissed: boolean;
  check: () => Promise<UpdateInfo | null>;
  install: () => void;
  dismiss: () => void;
};

/** Checks GitHub on start and every 6 hours (when enabled), plus on demand from Settings. */
export function useUpdates(auto: boolean): UpdateState {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() => {
    try {
      return localStorage.getItem(DISMISSED);
    } catch {
      return null;
    }
  });
  const busy = useRef(false);

  const check = useCallback(async () => {
    if (!ocean || busy.current) return null;
    busy.current = true;
    setChecking(true);
    try {
      const r = await ocean.checkForUpdate();
      setInfo(r);
      return r;
    } finally {
      busy.current = false;
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!auto) return;
    const first = window.setTimeout(check, 4000);
    const every = window.setInterval(check, SIX_HOURS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, [auto, check]);

  useEffect(() => {
    const off = ocean?.onUpdateProgress(setProgress);
    return () => {
      off?.();
    };
  }, []);

  return {
    info,
    checking,
    progress,
    dismissed: !!info?.latest && dismissedVersion === info.latest,
    check,
    install: () => {
      setProgress({ received: 0, total: 0 });
      ocean?.installUpdate();
    },
    dismiss: () => {
      if (!info?.latest) return;
      setDismissedVersion(info.latest);
      try {
        localStorage.setItem(DISMISSED, info.latest);
      } catch {
        /* ignore */
      }
    },
  };
}
