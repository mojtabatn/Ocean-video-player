import { useEffect, useState } from 'react';
import type { AccountStatus } from '../../electron/online/http';
import { ocean } from './bridge';

/** Film2Media sign-in state, kept in sync with the main process. `null` while loading. */
export function useAccount() {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  useEffect(() => {
    if (!ocean) {
      setStatus({ signedIn: false });
      return;
    }
    ocean.accountStatus().then(setStatus);
    const off = ocean.onAccountChange(setStatus);
    return () => {
      off();
    };
  }, []);
  return status;
}
