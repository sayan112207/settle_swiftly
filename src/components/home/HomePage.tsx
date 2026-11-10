import { useEffect, useRef, useState } from "react";

import { WaitlistProvider } from "./EarlyAccess";
import { FeatureStage } from "./FeatureStage";
import { HomeHero } from "./HomeHero";
import { Approval, ClosingCta, Problem, Questions } from "./HomeSections";
import { HowItWorks } from "./HowItWorks";
import { InkFilter } from "./marks";
import { vars } from "./style";
import { MotionContext, MotionEngine, usePrefersMotion, useViewportWidth } from "./motion";
import { PricingPlans } from "./PricingPlans";
import { SiteFooter } from "./SiteFooter";
import { SiteNav } from "./SiteNav";

/** Session flag: the loader plays once per visit. Read early by the route's head script. */
export const LOADER_SEEN_KEY = "ss_v3_seen";

/** The hero's light: slow-drifting green blobs behind the hero, masked out below it. */
const BLOBS = [
  {
    left: "80%",
    top: "9%",
    s: "1150px",
    c: "rgba(8,122,82,0.5)",
    dx: "-5vw",
    dy: "6vh",
    du: "38s",
  },
  {
    left: "6%",
    top: "15%",
    s: "820px",
    c: "rgba(24,168,115,0.17)",
    dx: "6vw",
    dy: "-4vh",
    du: "44s",
  },
  {
    left: "34%",
    top: "27%",
    s: "1250px",
    c: "rgba(8,122,82,0.36)",
    dx: "8vw",
    dy: "3vh",
    du: "52s",
  },
  {
    left: "88%",
    top: "47%",
    s: "1150px",
    c: "rgba(8,122,82,0.45)",
    dx: "-7vw",
    dy: "-5vh",
    du: "46s",
  },
  {
    left: "12%",
    top: "64%",
    s: "950px",
    c: "rgba(24,168,115,0.15)",
    dx: "5vw",
    dy: "6vh",
    du: "40s",
  },
  {
    left: "62%",
    top: "86%",
    s: "1250px",
    c: "rgba(8,122,82,0.4)",
    dx: "-6vw",
    dy: "-3vh",
    du: "50s",
  },
];

/** The opening loader: the logo's ledger lines and tick draw in, then it fades. */
function Loader() {
  return (
    <div className="ldr" aria-hidden="true">
      <svg viewBox="0 0 48 48">
        <path className="l1" d="M6 6H38" strokeWidth="3" pathLength={1} />
        <path className="l2" d="M6 14H30" strokeWidth="3" pathLength={1} />
        <path className="l3" d="M6 22H36" strokeWidth="3" pathLength={1} />
        <path className="l4" d="M6 30H26" strokeWidth="3" pathLength={1} />
        <path
          className="lt"
          d="M6 37L10 43L23 33.5"
          strokeWidth="3.5"
          strokeLinejoin="miter"
          strokeMiterlimit="10"
          pathLength={1}
        />
      </svg>
    </div>
  );
}

/**
 * Home v6, the marketing home page, as designed in the Settle Loader Prototype.
 *
 * Sections: 01 hero, 02 problem, 03 how it works, 04 features, 05 approval,
 * 06 pricing, 07 people, 08 questions, 09 early access; with the site nav and
 * footer around them. Motion follows `prefers-reduced-motion`: with it set,
 * everything renders in its final state and nothing moves.
 */
export function HomePage() {
  const armed = usePrefersMotion();
  const w = useViewportWidth();
  const track = armed && w >= 1024;

  const rootRef = useRef<HTMLDivElement>(null);
  const dzRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const trackRef = useRef(track);
  trackRef.current = track;

  const [engine, setEngine] = useState<MotionEngine | null>(null);
  const [loaderGone, setLoaderGone] = useState(false);

  // One motion engine for the page. How it works fires its own steps when tracking.
  useEffect(() => {
    if (!rootRef.current) return;
    const e = new MotionEngine(rootRef.current, armed, () => !trackRef.current);
    setEngine(e);
    return () => e.stop();
  }, [armed]);

  // The loader is CSS-only (it fades itself); this unmounts it and marks it seen.
  useEffect(() => {
    let seen = false;
    try {
      seen = !!sessionStorage.getItem(LOADER_SEEN_KEY);
    } catch {
      // storage blocked: just play it
    }
    if (seen || !armed) {
      setLoaderGone(true);
      return;
    }
    const t = setTimeout(() => {
      setLoaderGone(true);
      try {
        sessionStorage.setItem(LOADER_SEEN_KEY, "1");
      } catch {
        // ignore
      }
    }, 1250);
    return () => clearTimeout(t);
  }, [armed]);

  // Keep the aura sized to the hero (and, when tracking, the pinned section's extra scroll).
  useEffect(() => {
    const dz = dzRef.current,
      hs = heroRef.current;
    if (!dz || !hs) return;
    const fit = () => {
      dz.style.setProperty("--hh", `${hs.offsetHeight}px`);
      dz.style.setProperty(
        "--auh",
        `${Math.round(dz.offsetHeight + (track ? 0.9 * window.innerHeight : 0))}px`,
      );
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(dz);
    ro.observe(hs);
    return () => ro.disconnect();
  }, [track]);

  return (
    <MotionContext.Provider value={{ engine, armed }}>
      <WaitlistProvider>
        <div className="ss" ref={rootRef} data-armed={armed ? "true" : "false"}>
          <InkFilter id="ssInk" />
          {!loaderGone && <Loader />}

          <SiteNav current="home" hero />

          <main id="top">
            <div className="dz" data-loop="" ref={dzRef}>
              <div className="hau" aria-hidden="true">
                <div className="aura">
                  {BLOBS.map((b) => (
                    <i
                      key={b.left + b.top}
                      className="blob dr"
                      data-a="AU"
                      data-in=""
                      style={vars({
                        left: b.left,
                        top: b.top,
                        "--s": b.s,
                        "--c": b.c,
                        "--dx": b.dx,
                        "--dy": b.dy,
                        "--du": b.du,
                      })}
                    />
                  ))}
                  <i className="weave" />
                </div>
              </div>

              <HomeHero ready={loaderGone} width={w} sectionRef={heroRef} />
              <Problem />
              <HowItWorks track={track} />
            </div>

            <section
              id="features"
              className="feat lt"
              aria-labelledby="feat-h"
              data-screen-label="04 Features"
              style={{ scrollMarginTop: 64 }}
            >
              <div className="wrap">
                <div className="fhd k-in" data-t="" data-a="S1" style={vars({ "--fy": "16px" })}>
                  <h2 id="feat-h" className="dsp hs">
                    What we&apos;re building.
                  </h2>
                  <p className="lead">
                    Thirteen features, all in development. Enterprise customers get them first.
                  </p>
                </div>
                <FeatureStage />
              </div>
            </section>

            <Approval />

            <section
              id="pricing"
              className="prc dk"
              aria-labelledby="prc-h"
              data-screen-label="06 Pricing"
              style={{ scrollMarginTop: 64 }}
            >
              <div className="wrap">
                <div className="prch k-in" data-t="" data-a="S1" style={vars({ "--fy": "16px" })}>
                  <h2 id="prc-h" className="dsp hs">
                    Pricing.
                  </h2>
                  <p className="lead">
                    Indicative prices while we build. Final pricing is set at launch.
                  </p>
                </div>
                {/* "Compare plans" links to the Pricing page; hidden until that page exists. */}
                <PricingPlans compare={false} />
              </div>
            </section>

            <Questions />
            <ClosingCta />
          </main>

          <SiteFooter />
        </div>
      </WaitlistProvider>
    </MotionContext.Provider>
  );
}
