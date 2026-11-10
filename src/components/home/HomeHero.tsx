import { useEffect, useRef, useState, type RefObject } from "react";

import { EarlyAccessForm } from "./EarlyAccess";
import { CursorArrow, StampSvg } from "./marks";
import { vars } from "./style";
import { useMotion } from "./motion";

/**
 * The hero scene's timeline. Each step sets: t (ms from start), d (days
 * overdue on the invoice), f (how many floating cards are in), c (Approve
 * clicked), l (channel bars lit), p (paid).
 */
const STEPS: { t: number; d: number; f: number; c?: boolean; l?: number; p?: boolean }[] = [
  { t: 0, d: 31, f: 0 },
  { t: 650, d: 31, f: 1 },
  { t: 1750, d: 31, f: 1, c: true },
  { t: 2250, d: 24, f: 2, c: true, l: 1 },
  { t: 3150, d: 17, f: 3, c: true, l: 2 },
  { t: 4050, d: 10, f: 4, c: true, l: 3 },
  { t: 4550, d: 3, f: 4, c: true, l: 3 },
  { t: 5050, d: 3, f: 5, c: true, l: 3 },
  { t: 5850, d: 0, f: 5, c: true, l: 3, p: true },
];
const FINAL = STEPS.length - 1;
/** The paid end state (also what reduced motion shows). */
const PAID_STEP = STEPS[FINAL] ?? { t: 5850, d: 0, f: 5, c: true, l: 3, p: true };
/** How long the paid state holds before the scene replays. */
const HOLD_MS = 3800;
/** The pause on the reset frame before the next run. */
const RESET_MS = 900;

/** A boolean as the "true"/"false" string data attributes expect. */
const b = (v: boolean) => (v ? "true" : "false");

/**
 * Plays the hero timeline while the scene is at least 40% visible and `ready`,
 * looping with a pause on the paid state. Returns the current step index.
 */
function useHeroTimeline(
  sceneRef: RefObject<HTMLDivElement | null>,
  ready: boolean,
  armed: boolean,
) {
  const [hs, setHs] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const vis = useRef(false);
  const phase = useRef<"idle" | "running" | "waiting">("idle");

  useEffect(() => {
    const clear = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    if (!armed) {
      clear();
      setHs(FINAL);
      return;
    }
    if (!ready) return;

    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    const go = () => {
      clear();
      phase.current = "running";
      setHs(0);
      STEPS.forEach((s, i) => i && at(s.t, () => setHs(i)));
      at(PAID_STEP.t + HOLD_MS, cycle);
    };
    // Replay from the top, or wait until the scene is back in view.
    const cycle = () => {
      if (!vis.current) {
        phase.current = "waiting";
        return;
      }
      phase.current = "running";
      setHs(0);
      at(RESET_MS, go);
    };

    const el = sceneRef.current;
    if (!el || !("IntersectionObserver" in window)) {
      vis.current = true;
      go();
      return clear;
    }
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting && e.intersectionRatio >= 0.4) {
            vis.current = true;
            if (phase.current === "idle") go();
            else if (phase.current === "waiting") cycle();
          } else if (!e.isIntersecting) vis.current = false;
        }),
      { threshold: [0, 0.4] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clear();
      phase.current = "idle";
    };
  }, [sceneRef, ready, armed]);

  return hs;
}

/**
 * 01 Hero: the headline, the early-access form and a live collections scene —
 * one overdue invoice approved, chased across channels, matched and stamped
 * paid. The scene lays out at 680×600 and scales to its column (`--k`); below
 * 640px it stacks to the invoice plus whichever card is current.
 */
export function HomeHero({
  ready,
  width,
  sectionRef,
}: {
  ready: boolean;
  width: number;
  sectionRef: RefObject<HTMLElement | null>;
}) {
  const { armed } = useMotion();
  const sceneRef = useRef<HTMLDivElement>(null);
  const scwRef = useRef<HTMLDivElement>(null);
  const hs = useHeroTimeline(sceneRef, ready, armed);
  const s = STEPS[hs] ?? PAID_STEP;
  const l = s.l ?? 0;
  const paid = !!s.p;

  // Scale the 680px scene to its column.
  useEffect(() => {
    const w = scwRef.current;
    if (!w) return;
    const fit = () => w.style.setProperty("--k", Math.min(1, w.clientWidth / 680).toFixed(4));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(w);
    return () => ro.disconnect();
  }, []);

  const card = (n: number) => ({
    "data-on": b(s.f >= n),
    "data-cur": b(n === 5 ? s.f >= 5 : s.f === n),
  });

  return (
    <section
      className="hero dk"
      ref={sectionRef}
      aria-labelledby="hero-h"
      data-screen-label="01 Hero"
    >
      <div className="wrap">
        <div className="g12 hg">
          <div className="htx">
            <h1 id="hero-h" className="dsp hh" data-t="" data-paid={b(paid)}>
              <span
                className="ln k-in"
                data-a="H2"
                style={vars({ "--fy": "0.45em", "--du": "0.6s" })}
              >
                Stop waiting
              </span>
              <span
                className="ln k-in"
                data-a="H2"
                style={vars({ "--fy": "0.45em", "--du": "0.6s", "--dl": "0.08s" })}
              >
                to get{" "}
                <span className="pw">
                  paid.
                  <span className="pwm" data-a="H1" data-in="" aria-hidden="true">
                    paid.
                  </span>
                </span>
              </span>
            </h1>
            <p className="lead">
              Settle Swiftly chases your overdue invoices and stops the moment the money lands. You
              approve every message.
            </p>
            <EarlyAccessForm variant="hero" />
            <p className="note">Being built now · Enterprise teams first</p>
          </div>

          <div className="scw" ref={scwRef}>
            <div
              className="scene ap"
              ref={sceneRef}
              aria-hidden="true"
              data-mode={width < 640 ? "stack" : "full"}
              data-paid={b(paid)}
            >
              <i className="sglow" data-a="H1" data-in="" />
              <div className="acard gh gh1">
                <span className="aey">Invoice</span>
                <p className="at" style={{ marginTop: 8 }}>
                  INV-2117 · Northline Creative
                </p>
                <p className="amet">₹48,000</p>
              </div>
              <div className="acard gh gh2">
                <span className="aey">Invoice</span>
                <p className="at" style={{ marginTop: 8 }}>
                  INV-2096 · Vertex Labs Pvt Ltd
                </p>
                <p className="amet">₹1,20,000</p>
              </div>

              <div className="acard hinv" data-paid={b(paid)}>
                <div className="invt">
                  <span className="aey">Invoice</span>
                  <span className="invs">
                    <span className="pill pd-dan ov" data-a="H1" data-in="">
                      {s.d} days overdue
                    </span>
                    <span className="pill pd-acc pdl" data-a="H1" data-in="">
                      Paid 10 Oct
                    </span>
                  </span>
                </div>
                <p className="at" style={{ marginTop: 12 }}>
                  INV-2088 · Patel &amp; Sons
                </p>
                <p className="amet">₹1,18,000</p>
                <p className="apr">Due 3 Sep · Net 30</p>
                <div className="tl3">
                  {(
                    [
                      ["Email", "09:00"],
                      ["WhatsApp", "Day 3"],
                      ["Finance head", "Day 7"],
                    ] as const
                  ).map(([ch, when], i) => (
                    <div key={ch} data-on={b(l >= i + 1)}>
                      <i data-a="H1" data-in="" />
                      <b>{ch}</b>
                      <span>{when}</span>
                    </div>
                  ))}
                </div>
                <i className="hring" data-a="H1" data-in="" />
                <i className="hring r2" data-a="H1" data-in="" />
                <div className="hst stp" style={vars({ "--rot": "-6deg" })}>
                  <span className="stin" data-a="H1" data-in="" style={{ display: "block" }}>
                    <StampSvg word="PAID" date="10 OCT 2026" filter="ssInk" />
                  </span>
                </div>
              </div>

              <div className="hf hf-ap" data-a="H1" data-in="" {...card(1)} data-c={b(!!s.c)}>
                <div
                  className="fl"
                  data-a="HF"
                  data-in=""
                  style={vars({ "--fd": "6.5s", "--fdl": "-1s" })}
                >
                  <div className="acard">
                    <div className="apf">
                      <div>
                        <p className="at">Reminder · Patel &amp; Sons</p>
                        <p className="apr">Email to Rohan, Accounts</p>
                      </div>
                      <span className="sw r">
                        <span className="pill pd-warn b1" data-a="H1" data-in="">
                          Draft
                        </span>
                        <span className="pill pd-acc b2" data-a="H1" data-in="">
                          Approved
                        </span>
                      </span>
                    </div>
                    <p className="aprev">
                      Hi Rohan, a quick nudge on INV-2088 for ₹1,18,000. The payment link is below.
                    </p>
                    <div className="apf">
                      <span className="apr">Gentle tone</span>
                      <span className="sw r">
                        <span className="abtn b1" data-a="H1" data-in="">
                          Approve
                        </span>
                        <span className="abtn sec b2" data-a="H1" data-in="">
                          Sent 09:00
                        </span>
                      </span>
                    </div>
                    <CursorArrow className="hcur" data-a="H1" data-in="" />
                  </div>
                </div>
              </div>

              <div className="hf hf-em" data-a="H1" data-in="" {...card(2)}>
                <div
                  className="fl"
                  data-a="HF"
                  data-in=""
                  style={vars({ "--fd": "5.5s", "--fdl": "-2s" })}
                >
                  <div className="acard">
                    <span className="ic">
                      <svg viewBox="0 0 16 16">
                        <path d="M2 4H14V12H2Z M2 4L8 8.5L14 4" />
                      </svg>
                    </span>
                    <div>
                      <p className="at">Email sent · 09:00</p>
                      <p className="apr">Reminder 1 to Rohan</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="hf hf-wa" data-a="H1" data-in="" {...card(3)}>
                <div
                  className="fl"
                  data-a="HF"
                  data-in=""
                  style={vars({ "--fd": "7s", "--fdl": "-3s" })}
                >
                  <div className="acard">
                    <div className="apf">
                      <p className="at">WhatsApp · Day 3</p>
                      <span className="pill pd-acc">Delivered</span>
                    </div>
                    <p className="bub">
                      Hi Rohan, INV-2088 for ₹1,18,000 is now 17 days overdue. You can pay here, or
                      reply with a date.
                    </p>
                    <p className="rd">Read 11:02</p>
                  </div>
                </div>
              </div>

              <div className="hf hf-lad" data-a="H1" data-in="" {...card(4)}>
                <div
                  className="fl"
                  data-a="HF"
                  data-in=""
                  style={vars({ "--fd": "6s", "--fdl": "-4s" })}
                >
                  <div className="acard">
                    <span className="avt">A</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="at">Anita</p>
                      <p className="apr">Finance head</p>
                    </div>
                    <span className="pill pd-warn">Day 7</span>
                  </div>
                </div>
              </div>

              <div className="hf hf-pay" data-a="H1" data-in="" {...card(5)}>
                <div
                  className="fl"
                  data-a="HF"
                  data-in=""
                  style={vars({ "--fd": "6.8s", "--fdl": "-2.5s" })}
                >
                  <div className="acard">
                    <div className="apf">
                      <p className="amet">₹1,16,000 received</p>
                      <span className="pill pd-acc">Matched</span>
                    </div>
                    <p className="apr">Bank alert · 15 Oct · UTR ••4417</p>
                    <div className="aprev">
                      <p className="ln">
                        <span>Received</span>
                        <b className="ab">₹1,16,000</b>
                      </p>
                      <p className="ln">
                        <span>TDS</span>
                        <b className="ab">+ ₹2,000</b>
                      </p>
                      <p className="ln">
                        <span>INV-2088</span>
                        <b className="ab t-acc">₹1,18,000</b>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p className="sr">
              Invoice INV-2088 from Patel and Sons for ₹1,18,000 is 31 days overdue. You approve a
              gentle email reminder, it goes out at 09:00, a WhatsApp follows on day 3, the finance
              head is contacted on day 7, and a ₹1,16,000 bank alert plus ₹2,000 TDS is matched. The
              invoice is marked paid on 10 October.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
