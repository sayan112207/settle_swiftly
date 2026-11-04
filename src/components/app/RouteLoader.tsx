import { useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useReducer } from "react";

import { SettleLoader } from "@/components/app/SettleLoader";
import { ROUTE_LOADER_IDLE, nextRouteLoaderState, scheduleRouteLoader } from "@/lib/settle-loader";

type RouteLoaderProps = {
  /** Reports whether the overlay is mounted, so the parent can set `aria-busy`. */
  onVisibleChange?: (visible: boolean) => void;
  /** Fires once the done animation has finished and the overlay is gone. */
  onSettled?: () => void;
};

/**
 * Full-area overlay for slow page changes.
 *
 * Mount it inside a `position: relative` container (the app's `<main>`); the
 * sidebar stays outside and clickable. Nothing renders unless the router has
 * been pending for more than 400ms, and the tick only draws once the router
 * has settled, i.e. after the data has arrived.
 */
export function RouteLoader({ onVisibleChange, onSettled }: RouteLoaderProps) {
  const router = useRouter();
  const pending = useRouterState({ select: (s) => s.status === "pending" });
  const [state, dispatch] = useReducer(nextRouteLoaderState, ROUTE_LOADER_IDLE);
  const { visible, status } = state;

  // Router status drives the machine. Cleanup cancels the 400ms timer, which is
  // what keeps fast navigations from ever showing the loader.
  useEffect(() => {
    if (pending) {
      dispatch("pending");
      return scheduleRouteLoader(() => dispatch("delay-elapsed"));
    }
    dispatch("settled");
    return undefined;
  }, [pending]);

  useEffect(() => {
    const goOffline = () => dispatch("offline");
    const goOnline = () => dispatch("online");
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  useEffect(() => {
    onVisibleChange?.(visible);
  }, [visible, onVisibleChange]);

  if (!visible) return null;
  return (
    <div className="ss-route-loader">
      <SettleLoader
        status={status}
        size={48}
        label="page"
        onExited={() => {
          dispatch("exited");
          onSettled?.();
        }}
        onRetry={() => void router.invalidate()}
      />
    </div>
  );
}
