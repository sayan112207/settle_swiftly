import { describe, expect, test } from "bun:test";

import {
  EXIT_TIMING,
  ROUTE_LOADER_DELAY_MS,
  ROUTE_LOADER_IDLE,
  loaderAnnouncement,
  nextRouteLoaderState,
  pageLoaderStatus,
  scheduleRouteLoader,
  sentenceCase,
  type RouteLoaderEvent,
  type RouteLoaderState,
  type Timers,
} from "./settle-loader";

/** A fake clock: timers fire only when `advance` passes their due time. */
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { due: number; fn: () => void }>();
  const timers: Timers = {
    set: (fn, ms) => {
      const id = nextId++;
      pending.set(id, { due: now + ms, fn });
      return id;
    },
    clear: (handle) => {
      pending.delete(handle as number);
    },
  };
  function advance(ms: number) {
    now += ms;
    for (const [id, t] of [...pending]) {
      if (t.due <= now) {
        pending.delete(id);
        t.fn();
      }
    }
  }
  return { timers, advance };
}

function run(events: RouteLoaderEvent[], from: RouteLoaderState = ROUTE_LOADER_IDLE) {
  return events.reduce(nextRouteLoaderState, from);
}

describe("sentenceCase", () => {
  test("upper-cases the first letter and leaves the rest alone", () => {
    expect(sentenceCase("invoices")).toBe("Invoices");
    expect(sentenceCase("chase queue")).toBe("Chase queue");
    expect(sentenceCase("iPhone")).toBe("IPhone");
  });

  test("handles empty and already-capitalised labels", () => {
    expect(sentenceCase("")).toBe("");
    expect(sentenceCase("Dashboard")).toBe("Dashboard");
  });
});

describe("loaderAnnouncement", () => {
  test("loading uses the label as given, done sentence-cases it", () => {
    expect(loaderAnnouncement("loading", "invoices")).toBe("Loading invoices");
    expect(loaderAnnouncement("done", "invoices")).toBe("Invoices loaded");
  });

  test("error and offline do not depend on the label", () => {
    expect(loaderAnnouncement("error", "invoices")).toBe("Couldn't load this page.");
    expect(loaderAnnouncement("offline", "invoices")).toBe(
      "You're offline. This will load when you reconnect.",
    );
  });
});

describe("scheduleRouteLoader (400ms delay)", () => {
  test("the delay is 400ms", () => {
    expect(ROUTE_LOADER_DELAY_MS).toBe(400);
  });

  test("does not show before 400ms", () => {
    const { timers, advance } = fakeClock();
    let shown = false;
    scheduleRouteLoader(() => (shown = true), ROUTE_LOADER_DELAY_MS, timers);
    advance(399);
    expect(shown).toBe(false);
  });

  test("shows once 400ms have passed", () => {
    const { timers, advance } = fakeClock();
    let shown = false;
    scheduleRouteLoader(() => (shown = true), ROUTE_LOADER_DELAY_MS, timers);
    advance(400);
    expect(shown).toBe(true);
  });

  test("never shows if cancelled by a fast navigation", () => {
    const { timers, advance } = fakeClock();
    let shown = false;
    const cancel = scheduleRouteLoader(() => (shown = true), ROUTE_LOADER_DELAY_MS, timers);
    advance(150);
    cancel();
    advance(1000);
    expect(shown).toBe(false);
  });
});

describe("nextRouteLoaderState", () => {
  test("a fast navigation (settles before the delay) never becomes visible or done", () => {
    const state = run(["pending", "settled"]);
    expect(state).toEqual({ visible: false, status: "loading" });
  });

  test("a slow navigation shows loading, then done only after it settles", () => {
    const shown = run(["pending", "delay-elapsed"]);
    expect(shown).toEqual({ visible: true, status: "loading" });
    expect(nextRouteLoaderState(shown, "settled")).toEqual({ visible: true, status: "done" });
  });

  test("exit returns to the idle state", () => {
    expect(run(["pending", "delay-elapsed", "settled", "exited"])).toEqual(ROUTE_LOADER_IDLE);
  });

  test("a new navigation during done goes back to loading and stays visible", () => {
    const state = run(["pending", "delay-elapsed", "settled", "pending"]);
    expect(state).toEqual({ visible: true, status: "loading" });
  });

  test("offline only applies to a visible, loading loader", () => {
    expect(run(["offline"])).toEqual(ROUTE_LOADER_IDLE);
    expect(run(["pending", "delay-elapsed", "offline"])).toEqual({
      visible: true,
      status: "offline",
    });
    expect(run(["pending", "delay-elapsed", "settled", "offline"]).status).toBe("done");
  });

  test("coming back online resumes loading, never done", () => {
    const state = run(["pending", "delay-elapsed", "offline", "online"]);
    expect(state).toEqual({ visible: true, status: "loading" });
  });

  test("a stale exit after a new navigation started does not hide the overlay", () => {
    const state = run(["pending", "delay-elapsed", "settled", "pending", "exited"]);
    expect(state).toEqual({ visible: true, status: "loading" });
  });

  test("online with nothing offline is a no-op", () => {
    expect(run(["online"])).toEqual(ROUTE_LOADER_IDLE);
  });
});

describe("pageLoaderStatus", () => {
  const base = { waiting: false, failed: false, wasShown: false, exited: false };

  test("cached data on first render shows no loader and no tick", () => {
    expect(pageLoaderStatus(base)).toBeNull();
  });

  test("waiting shows loading", () => {
    expect(pageLoaderStatus({ ...base, waiting: true, wasShown: true })).toBe("loading");
  });

  test("data arriving after a shown loader holds done until it exits", () => {
    expect(pageLoaderStatus({ ...base, wasShown: true })).toBe("done");
    expect(pageLoaderStatus({ ...base, wasShown: true, exited: true })).toBeNull();
  });

  test("skipDone drops the tick hold when part of the page failed", () => {
    expect(pageLoaderStatus({ ...base, wasShown: true, skipDone: true })).toBeNull();
    expect(pageLoaderStatus({ ...base, waiting: true, wasShown: true, skipDone: true })).toBe(
      "loading",
    );
  });

  test("failure shows error, never done", () => {
    expect(pageLoaderStatus({ ...base, failed: true, wasShown: true })).toBe("error");
  });
});

describe("EXIT_TIMING", () => {
  test("reduced motion skips the fade and exits within 200ms", () => {
    expect(EXIT_TIMING.reduced.fadeAt).toBeNull();
    expect(EXIT_TIMING.reduced.exitAt <= 200).toBe(true);
  });

  test("normal motion fades only after the tick has finished drawing (300ms)", () => {
    expect(EXIT_TIMING.motion.fadeAt >= 300).toBe(true);
    expect(EXIT_TIMING.motion.exitAt > EXIT_TIMING.motion.fadeAt).toBe(true);
  });
});
