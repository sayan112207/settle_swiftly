import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { FEATURE_PAGES_LIVE, LINKS, STAGE_FEATURES } from "./content";
import { FeatureScene } from "./FeatureScene";
import { isMostlyVisible, restartAnimations, useMotion, useViewportWidth } from "./motion";

/** Shown if the active index is ever out of range. */
const FIRST = STAGE_FEATURES[0] ?? { slug: "chasing" as const, name: "", desc: "" };

/** How long each feature holds before the stage advances on its own. */
const HOLD_MS = 7000;

/**
 * The features stage: thirteen tabs down the left, one panel with that
 * feature's scene on the right. The scene plays once the stage scrolls into
 * view; it then advances every seven seconds until the visitor hovers or picks
 * a tab. Below 860px the tabs and panel stack as an accordion-like list.
 */
export function FeatureStage({ autoAdvance = true }: { autoAdvance?: boolean }) {
  const { armed } = useMotion();
  const w = useViewportWidth();
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [picked, setPicked] = useState(false);
  const [fired, setFired] = useState(false);
  const [visible, setVisible] = useState(false);

  const auto = armed && autoAdvance && !hovering && !picked && w >= 860;

  // Start the scene when the stage is 40% in view; track visibility for auto-advance.
  useEffect(() => {
    const el = rootRef.current;
    if (!armed || !el || !("IntersectionObserver" in window)) {
      setFired(true);
      return;
    }
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          setVisible(e.isIntersecting);
          if (isMostlyVisible(e)) setFired(true);
        }),
      { threshold: [0, 0.4] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [armed]);

  // Auto-advance, restarting the active tab's progress bar each time.
  useEffect(() => {
    if (!(auto && visible && fired)) return;
    const bar = rootRef.current?.querySelector('.ftab[aria-selected="true"] .fprog');
    if (bar) restartAnimations([bar]);
    const t = setTimeout(() => setActive((a) => (a + 1) % STAGE_FEATURES.length), HOLD_MS);
    return () => clearTimeout(t);
  }, [auto, visible, fired, active]);

  /** Arrow keys, Home and End move between tabs (vertical tablist). */
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = STAGE_FEATURES.length;
    const map: Record<string, number> = {
      ArrowDown: (i + 1) % n,
      ArrowRight: (i + 1) % n,
      ArrowUp: (i + n - 1) % n,
      ArrowLeft: (i + n - 1) % n,
      Home: 0,
      End: n - 1,
    };
    const j = map[e.key];
    if (j === undefined) return;
    e.preventDefault();
    setActive(j);
    setPicked(true);
    setTimeout(() => document.getElementById(`ft-${j}`)?.focus(), 0);
  };

  const cur = STAGE_FEATURES[active] ?? FIRST;

  return (
    <div className="fgs" data-armed={armed ? "true" : "false"}>
      <div
        className="fx"
        ref={rootRef}
        data-auto={auto ? "true" : "false"}
        onMouseLeave={() => setHovering(false)}
      >
        <div className="ftl" role="tablist" aria-label="Features" aria-orientation="vertical">
          {STAGE_FEATURES.map((f, i) => (
            <button
              key={f.slug}
              className="ftab"
              type="button"
              role="tab"
              id={`ft-${i}`}
              aria-selected={active === i}
              aria-controls="fpanel"
              tabIndex={active === i ? 0 : -1}
              onClick={() => {
                setActive(i);
                setPicked(true);
              }}
              onMouseMove={(e) => {
                if (w >= 860 && (e.movementX || e.movementY) && (active !== i || !hovering)) {
                  setActive(i);
                  setHovering(true);
                }
              }}
              onKeyDown={(e) => onKey(e, i)}
              style={{ "--o": i * 2 } as React.CSSProperties}
            >
              <span className="fnum mono">{String(i + 1).padStart(2, "0")}</span>
              <span className="fname">{f.name}</span>
              <i className="fprog" data-a="FA" data-in="" />
            </button>
          ))}
        </div>
        <p className="fall">All coming soon · Enterprise first.</p>
        <div className="fstage">
          <div
            className="fp"
            role="tabpanel"
            id="fpanel"
            aria-labelledby={`ft-${active}`}
            style={{ "--o": active * 2 + 1 } as React.CSSProperties}
          >
            <div className="fph">
              <h3 className="fpn">{cur.name}</h3>
              <p className="fpl">{cur.desc}</p>
              <p className="fst">
                <span className="lbl">Coming soon</span>
                <span className="ent">Enterprise</span>
              </p>
            </div>
            <div className="fsc" aria-hidden="true">
              <FeatureScene slug={cur.slug} mode="stage" run={fired} armed={armed} />
            </div>
            {FEATURE_PAGES_LIVE && (
              <a className="fmore" href={LINKS.feature(cur.slug)}>
                Read more<span className="sr"> about {cur.name}</span> →
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
