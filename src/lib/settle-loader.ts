/**
 * Non-visual logic behind the Settle Swiftly loader.
 *
 * Kept free of React and the DOM so the timing and state rules can be unit
 * tested directly: `SettleLoader`, `RouteLoader` and `usePageLoader` are thin
 * shells over these functions.
 */

/** What the loader is currently communicating. `done` is the only state that draws the tick. */
export type LoaderStatus = "loading" | "done" | "error" | "offline";

/** A route change must take longer than this before the loader appears at all. */
export const ROUTE_LOADER_DELAY_MS = 400;

/** After this long still loading, a reassuring "taking longer" line appears. */
export const SLOW_MS = 8000;

/** After this long still loading, a Retry button appears next to that line. */
export const RETRY_MS = 20000;

/**
 * Exit timings once data has arrived, in ms from the moment status becomes `done`.
 *
 * Normal motion: 80ms to finish the rules + 220ms of tick (+80ms delay) ends at
 * 300ms; the fade starts at 380ms and the loader is unmounted at 500ms.
 * Reduced motion: nothing animates, so it only lingers 200ms so the tick can be seen.
 */
export const EXIT_TIMING = {
  motion: { fadeAt: 380, exitAt: 500 },
  reduced: { fadeAt: null, exitAt: 200 },
} as const;

/**
 * Upper-cases the first character only, so "invoices" reads "Invoices" at the
 * start of a sentence without disturbing the rest of the label.
 */
export function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The text announced to screen readers for a given status. This is the only
 * channel that carries the status to assistive tech; the SVG is decorative.
 */
export function loaderAnnouncement(status: LoaderStatus, label: string): string {
  switch (status) {
    case "done":
      return `${sentenceCase(label)} loaded`;
    case "error":
      return "Couldn't load this page.";
    case "offline":
      return "You're offline. This will load when you reconnect.";
    case "loading":
      return `Loading ${label}`;
  }
}

/** The timer functions the scheduler needs; injectable so tests do not wait in real time. */
export type Timers = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

const DEFAULT_TIMERS: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Calls `show` after `delayMs`, unless the returned cancel function runs first.
 * This is the 400ms rule: a route change that settles sooner cancels the timer
 * and the loader never appears.
 */
export function scheduleRouteLoader(
  show: () => void,
  delayMs: number = ROUTE_LOADER_DELAY_MS,
  timers: Timers = DEFAULT_TIMERS,
): () => void {
  const handle = timers.set(show, delayMs);
  return () => timers.clear(handle);
}

/** Route-loader state: whether the overlay is mounted, and what it shows. */
export type RouteLoaderState = { visible: boolean; status: LoaderStatus };

/** Everything that can happen to the route loader. */
export type RouteLoaderEvent =
  | "pending" // the router started a navigation
  | "delay-elapsed" // 400ms passed and the navigation is still pending
  | "settled" // the router finished; the data is here
  | "exited" // the done animation finished and the overlay can unmount
  | "offline"
  | "online";

/** The state before any navigation has been slow enough to show the loader. */
export const ROUTE_LOADER_IDLE: RouteLoaderState = { visible: false, status: "loading" };

/**
 * The route loader's state machine.
 *
 * - `done` (and so the tick) is reachable only from a visible loader on
 *   `settled`: a fast navigation never draws a tick for data it never waited on.
 * - Going offline only matters while the loader is visible and still loading.
 * - Coming back online resumes `loading`; it never skips ahead to `done`.
 */
export function nextRouteLoaderState(
  state: RouteLoaderState,
  event: RouteLoaderEvent,
): RouteLoaderState {
  switch (event) {
    case "pending":
      return { visible: state.visible, status: "loading" };
    case "delay-elapsed":
      return { visible: true, status: state.status };
    case "settled":
      return state.visible ? { visible: true, status: "done" } : state;
    case "exited":
      // A late exit from a finished load must not hide the overlay once a new
      // navigation has already moved it back to loading.
      return state.status === "done" ? ROUTE_LOADER_IDLE : state;
    case "offline":
      return state.visible && state.status === "loading"
        ? { visible: true, status: "offline" }
        : state;
    case "online":
      return state.status === "offline" ? { ...state, status: "loading" } : state;
  }
}

/** The inputs that decide what a page-level loader shows. */
export type PageLoaderInput = {
  /** The whole page is waiting on data. */
  waiting: boolean;
  /** The page's data request failed. */
  failed: boolean;
  /** The loader has been on screen at least once for this load. */
  wasShown: boolean;
  /** The done animation has finished and the loader has unmounted itself. */
  exited: boolean;
  /**
   * Skip the done/tick hold. For pages where a partial failure should show its
   * own error straight away rather than behind a success mark.
   */
  skipDone?: boolean;
};

/**
 * What a page-level loader should render, or `null` for "show the page".
 *
 * Data already cached on first render never shows the loader (`wasShown` is
 * false), so there is no flash and no tick for data that did not arrive late.
 * Once shown, `done` holds until `exited` so the tick is not cut off.
 */
export function pageLoaderStatus(input: PageLoaderInput): LoaderStatus | null {
  if (input.waiting) return "loading";
  if (input.failed) return "error";
  if (input.wasShown && !input.exited && !input.skipDone) return "done";
  return null;
}
