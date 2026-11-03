import { useCallback, useEffect, useState } from "react";

import { pageLoaderStatus, type LoaderStatus } from "@/lib/settle-loader";

/**
 * Drives a page-level `SettleLoader` from a page's own data state.
 *
 * Returns the status to render (or `null` to render the page) and the
 * `onExited` callback to hand the loader. After a loader that was actually
 * shown, `done` is held until the tick has finished, so the page swaps in on
 * the loader's exit rather than cutting the tick off. Data that was already
 * cached on first render never shows the loader at all.
 */
export function usePageLoader(waiting: boolean, failed: boolean) {
  const [wasShown, setWasShown] = useState(waiting || failed);
  const [exited, setExited] = useState(false);

  useEffect(() => {
    if (waiting || failed) {
      setWasShown(true);
      setExited(false);
    }
  }, [waiting, failed]);

  const onExited = useCallback(() => setExited(true), []);
  const status: LoaderStatus | null = pageLoaderStatus({ waiting, failed, wasShown, exited });
  return { status, onExited };
}
