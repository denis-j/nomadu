import { useEffect, useRef } from 'react';
import { onCloudChange } from '../lib/syncTrigger';

/**
 * Re-run `refresh` when a sync or the realtime listener changed local data,
 * on top of the focus refresh every data hook already does. The latest
 * `refresh` is always the one called, so callers need not memoise it.
 */
export function useCloudRefresh(refresh: () => unknown): void {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => onCloudChange(() => { latest.current(); }), []);
}
