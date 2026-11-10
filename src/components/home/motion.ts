import { createContext, useContext, useEffect, useState } from "react";

/**
 * The marketing site's motion engine, ported from the Home v6 prototype.
 *
 * Animations are plain CSS (`.k-in`, `.k-draw`, … in home.css) marked with
 * `data-a`. They sit paused on their first frame until the engine adds
 * `data-in`. A `data-t` element is a trigger: once 40% of it is in view, every
 * `data-a` inside it (and not inside a nearer trigger) starts. A `data-a` with
 * no trigger above it is its own trigger.
 *
 * Triggers marked `data-manual` are left to their section — How it works fires
 * its steps from scroll position rather than visibility.
 *
 * Counters: `data-count` (with optional `data-from`, `data-dec`,
 * `data-fmt="inr"`, `data-dl`, `data-du`) or `data-steps="a,b,c"`. The final
 * value always sits in the markup, so no-JS and reduced motion read correctly.
 */

/** Formats a number with Indian digit grouping: 1,18,000. */
export function inr(n: number): string {
  const s = String(Math.round(Math.abs(n)));
  if (s.length <= 3) return s;
  let rest = s.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return parts.join(",") + "," + s.slice(-3);
}

/** Clamps `v` into `[a, b]`. */
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

type Counted = HTMLElement & { __run?: number };

/**
 * Runs one counter element from its start value to the value in its markup.
 * Timers it schedules are pushed onto `timers` so the caller can cancel them.
 */
export function runCount(el: HTMLElement, timers: ReturnType<typeof setTimeout>[]): void {
  const a = el as Counted;
  const dec = Number(a.getAttribute("data-dec")) || 0;
  const fmt = (v: number) => (a.getAttribute("data-fmt") === "inr" ? inr(v) : v.toFixed(dec));
  const dl = Number(a.getAttribute("data-dl")) || 0;
  const du = Number(a.getAttribute("data-du")) || 1200;
  const run = (a.__run = (a.__run ?? 0) + 1);
  const steps = a.getAttribute("data-steps");
  if (steps) {
    const vs = steps.split(",").map(Number);
    a.textContent = fmt(vs[0] ?? 0);
    vs.slice(1).forEach((v, i) =>
      timers.push(
        setTimeout(
          () => {
            if (a.__run === run) a.textContent = fmt(v);
          },
          dl + ((i + 1) * du) / (vs.length - 1),
        ),
      ),
    );
    return;
  }
  const from = Number(a.getAttribute("data-from")) || 0;
  const to = Number(a.getAttribute("data-count"));
  a.textContent = fmt(from);
  const t0 = performance.now() + dl;
  const step = (now: number) => {
    if (a.__run !== run) return;
    const k = clamp((now - t0) / du, 0, 1);
    a.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Restarts every CSS animation on `els` from its first frame. */
export function restartAnimations(els: Iterable<Element>): void {
  for (const el of els) {
    const h = el as HTMLElement;
    h.style.animation = "none";
    void h.offsetWidth;
    h.style.animation = "";
  }
}

/** True when the trigger is at least 40% visible (or fills 40% of the viewport). */
export function isMostlyVisible(e: IntersectionObserverEntry): boolean {
  return (
    e.isIntersecting &&
    (e.intersectionRatio >= 0.4 || e.intersectionRect.height >= window.innerHeight * 0.4)
  );
}

/**
 * Watches one DOM subtree and starts its animations as they scroll into view.
 *
 * One engine serves the whole page; nested components don't need their own.
 * It re-scans whenever the subtree changes, so content React mounts later
 * (a form's success state, a pricing card) is picked up without wiring.
 */
export class MotionEngine {
  private io?: IntersectionObserver;
  private vio?: IntersectionObserver;
  private mo?: MutationObserver;
  private seen = new WeakSet<Element>();
  private vseen = new WeakSet<Element>();
  private timers: ReturnType<typeof setTimeout>[] = [];

  /**
   * @param root The subtree to animate.
   * @param armed False under reduced motion: everything shows in its final state.
   * @param fireManual Asked when a `data-manual` trigger comes into view; return
   *   true to fire it as an ordinary trigger (How it works does, when stacked).
   */
  constructor(
    private root: HTMLElement,
    private armed: boolean,
    private fireManual: (t: Element) => boolean = () => false,
  ) {
    if (armed && "IntersectionObserver" in window) {
      this.io = new IntersectionObserver(
        (es) =>
          es.forEach((e) => {
            if (!isMostlyVisible(e)) return;
            const t = e.target;
            if (t.hasAttribute("data-manual") && !this.fireManual(t)) return;
            this.io?.unobserve(t);
            this.fire(t);
          }),
        { threshold: [0, 0.4] },
      );
      this.vio = new IntersectionObserver((es) =>
        es.forEach((e) => {
          if (e.isIntersecting) e.target.setAttribute("data-vis", "");
          else e.target.removeAttribute("data-vis");
        }),
      );
    }
    this.scan();
    this.mo = new MutationObserver(() => this.scan());
    this.mo.observe(root, { childList: true, subtree: true });
  }

  /** Finds new triggers and loose animations, and observes them. */
  scan(): void {
    const r = this.root;
    if (!this.io) {
      r.querySelectorAll("[data-a]:not([data-in])").forEach((a) => a.setAttribute("data-in", ""));
      return;
    }
    r.querySelectorAll("[data-t]").forEach((t) => {
      if (!this.seen.has(t)) {
        this.seen.add(t);
        this.io?.observe(t);
      }
    });
    r.querySelectorAll("[data-a]:not([data-in])").forEach((a) => {
      const t = a.closest("[data-t]");
      if (!t) {
        if (!this.seen.has(a)) {
          this.seen.add(a);
          a.setAttribute("data-t", "");
          this.io?.observe(a);
        }
      } else if (t.hasAttribute("data-fired") && !t.hasAttribute("data-manual")) {
        a.setAttribute("data-in", "");
      }
    });
    r.querySelectorAll("[data-loop]").forEach((el) => {
      if (!this.vseen.has(el)) {
        this.vseen.add(el);
        this.vio?.observe(el);
      }
    });
  }

  /** Starts every animation and counter that belongs to trigger `t`. */
  fire(t: Element): void {
    t.setAttribute("data-fired", "");
    const list = [t, ...Array.from(t.querySelectorAll("[data-a]"))];
    for (const a of list) {
      if (!a.hasAttribute("data-a") || a.closest("[data-t]") !== t) continue;
      a.setAttribute("data-in", "");
      if (
        this.armed &&
        (a.hasAttribute("data-count") || a.hasAttribute("data-steps")) &&
        !a.closest("[hidden]")
      ) {
        runCount(a as HTMLElement, this.timers);
      }
    }
  }

  /** Disconnects every observer and cancels pending counter steps. */
  stop(): void {
    this.io?.disconnect();
    this.vio?.disconnect();
    this.mo?.disconnect();
    this.timers.forEach(clearTimeout);
  }
}

/** Lets a section fire its own manual triggers through the page's engine. */
export const MotionContext = createContext<{ engine: MotionEngine | null; armed: boolean }>({
  engine: null,
  armed: true,
});

/** The page's motion engine and whether motion is on. */
export function useMotion() {
  return useContext(MotionContext);
}

/**
 * Whether the visitor allows motion. Starts true so the server render matches
 * the common case, then follows `prefers-reduced-motion` once mounted.
 */
export function usePrefersMotion(): boolean {
  const [ok, setOk] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setOk(!mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return ok;
}

/** Viewport width, debounced; `fallback` is used for the server render. */
export function useViewportWidth(fallback = 1280): number {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const update = () => setW(window.innerWidth);
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(update, 120);
    };
    update();
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  return w;
}
