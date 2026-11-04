import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { AppButton } from "@/components/app/AppButton";
import {
  EXIT_TIMING,
  RETRY_MS,
  SLOW_MS,
  loaderAnnouncement,
  type LoaderStatus,
} from "@/lib/settle-loader";

type SettleLoaderProps = {
  status: LoaderStatus;
  size?: 48 | 24;
  /** Lower-case page name: "invoices" announces "Loading invoices" / "Invoices loaded". */
  label: string;
  /** Fires after the done animation has faded out; the parent unmounts the loader then. */
  onExited?: () => void;
  onRetry?: () => void;
};

const RULES = ["M6 6H38", "M6 14H30", "M6 22H36", "M6 30H26"];

/** Whether the user has asked the OS for reduced motion. False during SSR. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Page-level loading mark: four rules draw and clear while loading, then on
 * `done` they complete and a green tick draws. `error` and `offline` stop the
 * rules and grey them; they never draw a tick.
 *
 * The SVG is decorative. The status is announced through the `role="status"`
 * region, whose text comes from `loaderAnnouncement`. Use it for whole-page
 * waits only; in-page sections keep `AppSkeleton`.
 */
export function SettleLoader({ status, size = 48, label, onExited, onRetry }: SettleLoaderProps) {
  const rules = useRef<Array<SVGPathElement | null>>([]);
  const [state, setState] = useState<LoaderStatus>(status);
  const [leaving, setLeaving] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // The exit callback is read through a ref so a parent re-render with a new
  // function identity cannot restart the exit timers mid-animation.
  const onExitedRef = useRef(onExited);
  useEffect(() => {
    onExitedRef.current = onExited;
  }, [onExited]);

  // Slow-load clock, only while loading.
  useEffect(() => {
    if (status !== "loading") return;
    const start = performance.now();
    setElapsed(0);
    const id = window.setInterval(() => setElapsed(performance.now() - start), 500);
    return () => window.clearInterval(id);
  }, [status]);

  useLayoutEffect(() => {
    if (status !== "done") {
      setState(status);
      setLeaving(false);
      return;
    }
    const reduced = prefersReducedMotion();
    const timing = reduced ? EXIT_TIMING.reduced : EXIT_TIMING.motion;

    // Freeze each rule exactly where it is, then complete it from there in 80ms.
    for (const p of rules.current) {
      if (!p) continue;
      const offset = getComputedStyle(p).strokeDashoffset;
      p.style.animation = "none";
      p.style.strokeDashoffset = offset;
    }
    const raf = requestAnimationFrame(() => {
      for (const p of rules.current) {
        if (!p) continue;
        p.style.transition = reduced ? "none" : "stroke-dashoffset 80ms ease-out";
        p.style.strokeDashoffset = "0";
      }
      setState("done"); // the tick draws 80 → 300ms
    });

    const fade =
      timing.fadeAt === null ? undefined : window.setTimeout(() => setLeaving(true), timing.fadeAt);
    const exit = window.setTimeout(() => onExitedRef.current?.(), timing.exitAt);
    return () => {
      cancelAnimationFrame(raf);
      if (fade !== undefined) window.clearTimeout(fade);
      window.clearTimeout(exit);
    };
  }, [status]);

  // Inline styles set for the done animation must not leak into a later load.
  useEffect(() => {
    if (state === "done") return;
    for (const p of rules.current) {
      if (!p) continue;
      p.style.animation = "";
      p.style.strokeDashoffset = "";
      p.style.transition = "";
    }
  }, [state]);

  return (
    <div
      className="ss-loader"
      data-state={state}
      data-leaving={leaving ? "" : undefined}
      role="status"
      aria-live="polite"
    >
      <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" focusable="false">
        {RULES.map((d, i) => (
          <path
            key={d}
            ref={(el) => {
              rules.current[i] = el;
            }}
            className="rule"
            pathLength={1}
            d={d}
          />
        ))}
        <path className="tick" pathLength={1} d="M6 37L10 43L23 33.5" />
      </svg>
      <span className="sr-only">{loaderAnnouncement(state, label)}</span>

      {state === "error" && (
        <div className="ss-loader__msg">
          <p className="ss-loader__title">Couldn&apos;t load this page.</p>
          <p className="ss-loader__help">Check your connection and try again.</p>
          <AppButton variant="secondary" type="button" autoFocus className="mt-3" onClick={onRetry}>
            Retry
          </AppButton>
        </div>
      )}
      {state === "offline" && (
        <div className="ss-loader__msg">
          <p className="ss-loader__title">You&apos;re offline.</p>
          <p className="ss-loader__help">This will load when you reconnect.</p>
        </div>
      )}
      {state === "loading" && elapsed >= SLOW_MS && (
        <div className="ss-loader__msg ss-loader__slow">
          <p className="ss-loader__help">Still loading. This is taking longer than usual.</p>
          {elapsed >= RETRY_MS && onRetry && (
            <AppButton variant="text" type="button" onClick={onRetry}>
              Retry
            </AppButton>
          )}
        </div>
      )}
    </div>
  );
}
