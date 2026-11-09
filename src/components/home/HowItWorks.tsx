import { useEffect, useRef } from "react";

import { StampSvg } from "./marks";
import { vars } from "./style";
import { clamp, useMotion } from "./motion";

/**
 * 03 How it works. On wide screens with motion on ("track" mode) the section
 * pins for an extra 120vh of scroll while invoice INV-2117 travels a rail
 * through four stations, each playing its vignette as the token arrives.
 * Otherwise the stations stack vertically and play as they come into view,
 * with a marker sliding down the rail.
 */
export function HowItWorks({ track }: { track: boolean }) {
  const { engine, armed } = useMotion();
  const secRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const tokRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLElement>(null);
  const reached = useRef([false, false, false, false]);

  useEffect(() => {
    const sec = secRef.current;
    if (!sec) return;

    /** Lights station `k` and plays its vignette (once). */
    const reach = (k: number) => {
      if (reached.current[k] || !engine) return;
      reached.current[k] = true;
      const stv = sec.querySelector(`[data-sid="${k}"]`);
      if (stv && !stv.hasAttribute("data-fired")) engine?.fire(stv);
      if (k === 0 && tokRef.current) engine?.fire(tokRef.current);
      sec.querySelectorAll(".stl")[k]?.setAttribute("data-r", "");
      sec.querySelectorAll(".stop")[k]?.setAttribute("data-r", "");
    };

    let raf = 0;
    const tick = () => {
      raf = 0;
      const r = sec.getBoundingClientRect(),
        vh = window.innerHeight;
      const rl = railRef.current;
      if (track) {
        const p = clamp(-r.top / Math.max(1, r.height - vh), 0, 1);
        if (r.top < vh * 0.35 && r.bottom > 0) reach(0);
        for (let k = 1; k < 4; k++) if (p >= k / 3 - 0.03) reach(k);
        if (rl) rl.style.transform = `scaleX(${p.toFixed(4)})`;
        if (tokRef.current && rl)
          tokRef.current.style.transform = `translateX(${(p * rl.offsetWidth).toFixed(1)}px)`;
      } else {
        const m = markRef.current;
        if (m?.parentElement) {
          const H = m.parentElement.offsetHeight - 12;
          const p = armed ? clamp((vh * 0.6 - r.top) / r.height, 0, 1) : 1;
          m.style.transform = `translateY(${(p * H).toFixed(1)}px)`;
        }
        if (rl) rl.style.transform = "";
        if (tokRef.current) tokRef.current.style.transform = "";
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    tick();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [track, armed, engine]);

  return (
    <section
      id="how"
      className="how dk"
      ref={secRef}
      data-mode={track ? "track" : "stack"}
      aria-labelledby="how-h"
      data-screen-label="03 How it works"
      style={{ scrollMarginTop: 0 }}
    >
      <div className="hpin">
        <div className="wrap">
          <h2
            id="how-h"
            className="dsp hs hwh k-in"
            data-t=""
            data-a="S1"
            style={vars({ "--fy": "16px" })}
          >
            From overdue to paid, without you chasing.
          </h2>
          <div className="stns">
            <div className="rail" aria-hidden="true">
              <i className="rl" />
              <i className="rf" ref={railRef} />
              {["12.5%", "37.5%", "62.5%", "87.5%"].map((left) => (
                <i key={left} className="stop" style={{ left }} />
              ))}
              <div className="tokw" ref={tokRef} data-t="" data-manual="">
                <div className="token ap">
                  <span
                    className="k-in"
                    data-a="W1"
                    style={vars({ "--fy": "-34px", "--dl": "0.7s", "--du": "0.4s" })}
                  >
                    <svg className="tk" viewBox="3 30 23 16" aria-hidden="true">
                      <path d="M6 37L10 43L23 33.5" />
                    </svg>
                    <span className="mono">INV-2117</span> · <span className="mono">₹48,000</span>
                  </span>
                </div>
              </div>
              <i className="mark" ref={markRef} />
            </div>

            <div className="st">
              <div
                className="stv"
                data-t=""
                data-manual=""
                data-sid="0"
                style={vars({ "--c": 1 })}
                aria-hidden="true"
              >
                <div className="ap acard w1">
                  <div className="ahd">
                    <span className="at">Tally</span>
                    <span className="apr">Sales register</span>
                  </div>
                  <div className="ath">
                    <span>Invoice</span>
                    <span className="r">Amount</span>
                  </div>
                  <div className="atr">
                    <span>
                      <span className="mono">INV-2096</span>
                    </span>
                    <span className="r">
                      <span className="mono">₹1,20,000</span>
                    </span>
                  </div>
                  <div
                    className="atr sel k-out"
                    data-a="W1"
                    style={vars({ "--oy": "64px", "--dl": "0.25s", "--du": "0.55s" })}
                  >
                    <span>
                      <span className="mono">INV-2117</span>
                    </span>
                    <span className="r">
                      <span className="mono">₹48,000</span>
                    </span>
                  </div>
                  <div className="atr">
                    <span>
                      <span className="mono">INV-2124</span>
                    </span>
                    <span className="r">
                      <span className="mono">₹62,000</span>
                    </span>
                  </div>
                </div>
              </div>
              <div className="stl" style={vars({ "--c": 1 })}>
                <span className="mono">01</span>
                <h3 className="dsp hi">Synced</h3>
                <p>Arrives from Tally or Zoho Books on its own.</p>
              </div>
            </div>

            <div className="st">
              <div
                className="stv"
                data-t=""
                data-manual=""
                data-sid="1"
                style={vars({ "--c": 2 })}
                aria-hidden="true"
              >
                <div className="ap w2">
                  <div
                    className="w2t k-move"
                    data-a="W2"
                    style={vars({ "--f": 0, "--t": 1, "--dl": "0.2s" })}
                  >
                    <span className="at">
                      <span className="mono">INV-2131</span>
                    </span>
                    <span className="pill pd-alt">Watch</span>
                  </div>
                  <div
                    className="w2t k-move"
                    data-a="W2"
                    style={vars({ "--f": 1, "--t": 2, "--dl": "0.2s" })}
                  >
                    <span className="at">
                      <span className="mono">INV-2096</span>
                    </span>
                    <span className="pill pd-warn">Chase now</span>
                  </div>
                  <div
                    className="w2t hl k-move"
                    data-a="W2"
                    style={vars({ "--f": 2, "--t": 0, "--dl": "0.2s" })}
                  >
                    <span className="at">
                      <span className="mono">INV-2117</span>
                    </span>
                    <span className="pill pd-dan">Escalate</span>
                  </div>
                </div>
              </div>
              <div className="stl" style={vars({ "--c": 2 })}>
                <span className="mono">02</span>
                <h3 className="dsp hi">Ranked</h3>
                <p>Goes to the top: oldest and largest first.</p>
              </div>
            </div>

            <div className="st">
              <div
                className="stv"
                data-t=""
                data-manual=""
                data-sid="2"
                style={vars({ "--c": 3 })}
                aria-hidden="true"
              >
                <div className="ap w3">
                  <div className="w3b">
                    <div
                      className="bub k-in"
                      data-a="W3"
                      style={vars({
                        top: 0,
                        transform: "rotate(-3deg)",
                        "--fx": "10px",
                        "--fy": "96px",
                        "--fs": 0.6,
                        "--dl": "0s",
                      })}
                    >
                      <p className="at">Email</p>
                      <p className="apr">
                        Sent <span className="mono">09:00</span>
                      </p>
                    </div>
                    <div
                      className="bub k-in"
                      data-a="W3"
                      style={vars({
                        top: "60px",
                        transform: "rotate(2deg) translateX(8px)",
                        "--fx": "4px",
                        "--fy": "40px",
                        "--fs": 0.6,
                        "--dl": "0.2s",
                      })}
                    >
                      <p className="at">WhatsApp</p>
                      <p className="apr">
                        Day <span className="mono">3</span>
                      </p>
                    </div>
                    <div
                      className="bub k-in"
                      data-a="W3"
                      style={vars({
                        top: "120px",
                        transform: "rotate(-1deg)",
                        "--fx": "0px",
                        "--fy": "0px",
                        "--fs": 0.6,
                        "--dl": "0.4s",
                      })}
                    >
                      <p className="at">SMS</p>
                      <p className="apr">
                        Day <span className="mono">5</span>
                      </p>
                    </div>
                  </div>
                  <div className="acard w3l">
                    <i className="rail2" />
                    <div className="rung at">Director</div>
                    <div className="rung at">Finance head</div>
                    <div className="rung at">Accounts</div>
                    <i
                      className="mk k-c1"
                      data-a="W3"
                      style={vars({ "--dl": "0.7s", "--du": "1.3s" })}
                    />
                  </div>
                </div>
              </div>
              <div className="stl" style={vars({ "--c": 3 })}>
                <span className="mono">03</span>
                <h3 className="dsp hi">Chased</h3>
                <p>Email, WhatsApp, SMS, up to the director.</p>
              </div>
            </div>

            <div className="st">
              <div
                className="stv"
                data-t=""
                data-manual=""
                data-sid="3"
                style={vars({ "--c": 4 })}
                aria-hidden="true"
              >
                <div className="ap w4">
                  <div
                    className="acard w4c k-in"
                    data-a="W4"
                    style={vars({ "--fx": "48px", "--fy": "0px", "--du": "0.45s" })}
                  >
                    <p className="amet">
                      <span className="mono">₹48,000</span> received
                    </p>
                    <p className="apr">
                      Bank alert · <span className="mono">22 Oct</span> · UTR{" "}
                      <span className="mono">••5203</span>
                    </p>
                    <div className="aprev w4m">
                      <p
                        className="ln k-in"
                        data-a="W4"
                        style={vars({ "--fy": "8px", "--dl": "0.5s", "--du": "0.3s" })}
                      >
                        <span>Received</span>
                        <b className="ab">
                          <span className="mono">₹48,000</span>
                        </b>
                      </p>
                      <p
                        className="ln k-in"
                        data-a="W4"
                        style={vars({ "--fy": "8px", "--dl": "0.75s", "--du": "0.3s" })}
                      >
                        <span>TDS</span>
                        <b className="ab">None</b>
                      </p>
                      <p
                        className="ln k-in"
                        data-a="W4"
                        style={vars({ "--fy": "8px", "--dl": "1s", "--du": "0.3s" })}
                      >
                        <span>
                          Matched to <span className="mono">INV-2117</span>
                        </span>
                        <b className="ab t-acc">
                          <span className="mono">₹48,000</span>
                        </b>
                      </p>
                    </div>
                  </div>
                  <span className="w4s stp" style={vars({ "--rot": "-7deg" })}>
                    <span
                      className="k-stamp"
                      data-a="W4"
                      style={vars({ "--dl": "1.35s", display: "block" })}
                    >
                      <StampSvg word="PAID" date="22 OCT 2026" filter="ssInk" />
                    </span>
                  </span>
                </div>
              </div>
              <div className="stl" style={vars({ "--c": 4 })}>
                <span className="mono">04</span>
                <h3 className="dsp hi">Paid</h3>
                <p>Bank alert matched, TDS handled. Chasing stops.</p>
              </div>
            </div>
          </div>
          <p className="sr">
            Invoice <span className="mono">INV-2117</span> from Northline Creative for{" "}
            <span className="mono">₹48,000</span> arrives from Tally, is ranked to the top, is
            chased by email, WhatsApp and SMS up to the director, and is marked paid when a{" "}
            <span className="mono">₹48,000</span> bank alert matches it in full, with no TDS.
          </p>
        </div>
      </div>
    </section>
  );
}
