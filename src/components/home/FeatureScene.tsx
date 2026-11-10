import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

import type { FeatureSlug } from "./content";
import { StampSvg, Tick } from "./marks";
import { vars } from "./style";
import { restartAnimations, runCount } from "./motion";

/** Server-safe layout effect: measuring only matters in the browser. */
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Shorthand for `<span class="mono">`: figures, dates and IDs set in mono. */
const M = ({ children }: { children: ReactNode }) => <span className="mono">{children}</span>;

/** The three tones the "chasing" scene types through: gentle, standard, firm. */
const TONES: [string, boolean?][][] = [
  [
    ["Hi Kavita, a quick nudge on "],
    ["INV-2131", true],
    [" for "],
    ["₹72,000", true],
    [". Here’s the payment link whenever you’re ready."],
  ],
  [
    ["Hi Kavita, "],
    ["INV-2131", true],
    [" for "],
    ["₹72,000", true],
    [" is now "],
    ["24", true],
    [" days overdue. You can pay here, or reply with a date that works."],
  ],
  [
    ["Kavita, "],
    ["INV-2131", true],
    [" for "],
    ["₹72,000", true],
    [" is "],
    ["24", true],
    [" days overdue. Please pay by Friday, or tell us what’s holding it up."],
  ],
];

/** One tone's message, in segments; out-of-range falls back to the firm tone. */
const tone = (k: number) => TONES[k] ?? TONES[TONES.length - 1] ?? [];

/** Writes the first `n` characters of a tone into `el`, keeping figures in mono. */
function paint(el: HTMLElement, segs: [string, boolean?][], n: number) {
  el.textContent = "";
  let left = n;
  for (const [text, mono] of segs) {
    if (left <= 0) break;
    const s = text.slice(0, left);
    left -= s.length;
    if (mono) {
      const m = document.createElement("span");
      m.className = "mono";
      m.textContent = s;
      el.appendChild(m);
    } else el.appendChild(document.createTextNode(s));
  }
}

/** The page renders this ink filter once (see HomePage); stamps here reference it. */
const FILTER = "ssInk";

/** The PAID stamp a scene lands at the end, dated `date`. */
function PaidStamp({
  className,
  rot,
  dl,
  date,
}: {
  className: string;
  rot: string;
  dl: string;
  date: string;
}) {
  return (
    <span className={`${className} stp`} style={vars({ "--rot": rot })}>
      <span
        className="k-stamp"
        data-a="F5"
        data-in=""
        style={vars({ "--dl": dl, display: "block" })}
      >
        <StampSvg word="PAID" date={date} filter={FILTER} />
      </span>
    </span>
  );
}

/** Each feature's animated vignette. Every `data-a` here starts with `data-in`: the scene plays on mount. */
function Scene({
  slug,
  refs,
}: {
  slug: FeatureSlug;
  refs: {
    seg: React.RefObject<HTMLElement | null>;
    fin: React.RefObject<HTMLSpanElement | null>;
    typ: React.RefObject<HTMLSpanElement | null>;
  };
}) {
  switch (slug) {
    case "books-sync":
      return (
        <div className="ap f1">
          <div className="acard">
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
                <M>INV-2117</M>
              </span>
              <span className="r">
                <M>₹48,000</M>
              </span>
            </div>
            <div className="atr">
              <span>
                <M>INV-2131</M>
              </span>
              <span className="r">
                <M>₹72,000</M>
              </span>
            </div>
            <div className="atr">
              <span>
                <M>INV-2096</M>
              </span>
              <span className="r">
                <M>₹1,20,000</M>
              </span>
            </div>
            <div
              className="atr sel k-in"
              data-a="F1"
              data-in=""
              style={vars({
                "--fx": "calc(100% + 48px)",
                "--fy": "0px",
                "--dl": "2.1s",
                "--du": "0.8s",
              })}
            >
              <span className="t-acc">
                <M>RCPT-0192</M>
              </span>
              <span className="r t-acc">
                <M>₹48,000</M>
              </span>
            </div>
          </div>
          <div className="acard">
            <div className="ahd">
              <span className="at">Settle Swiftly</span>
              <span className="pill pd-acc">
                Synced <M>09:00</M>
              </span>
            </div>
            <div className="ath">
              <span>Account</span>
              <span className="r">Amount</span>
            </div>
            {[
              ["Northline", " Creative", "₹48,000", "0.2s"] as const,
              ["Meridian", " Traders", "₹72,000", "0.55s"] as const,
              ["Vertex Labs", " Pvt Ltd", "₹1,20,000", "0.9s"] as const,
            ].map(([a, b, amt, dl]) => (
              <div
                key={a}
                className="atr k-in"
                data-a="F1"
                data-in=""
                style={vars({
                  "--fx": "calc(-100% - 48px)",
                  "--fy": "0px",
                  "--dl": dl,
                  "--du": "0.7s",
                })}
              >
                <span className="nm">
                  {a}
                  <span className="nm2">{b}</span>
                </span>
                <span className="r">
                  <M>{amt}</M>
                </span>
              </div>
            ))}
            <div className="atr k-fade" data-a="F1" data-in="" style={vars({ "--dl": "1.8s" })}>
              <span className="t-soft">Receipt approved</span>
              <span className="r t-soft">
                <M>₹48,000</M>
              </span>
            </div>
          </div>
        </div>
      );
    case "priority-queue":
      return (
        <div className="ap acard f2">
          <div className="ath">
            <span>Account</span>
            <span className="r">Overdue</span>
            <span className="r">Amount</span>
            <span className="r">Score</span>
          </div>
          <div className="f2b">
            {(
              [
                ["Northline Creative", "9", false, "₹48,000", "pd-alt", 18, 0, 4],
                ["Meridian Traders", "31", true, "₹72,000", "pd-warn", 64, 1, 2],
                ["Vertex Labs Pvt Ltd", "14", false, "₹1,20,000", "pd-alt", 41, 2, 3],
                ["Kaveri & Sons", "96", true, "₹1,80,000", "pd-dan", 88, 3, 1],
                ["Saraswat Textiles Pvt Ltd", "48", true, "₹4,80,000", "pd-dan", 91, 4, 0],
              ] as const
            ).map(([name, days, late, amt, pill, score, f, t]) => (
              <div
                key={name}
                className={`atr f2r k-move${f === 4 ? " sel" : ""}`}
                data-a="F2"
                data-in=""
                style={vars({ "--f": f, "--t": t, "--dl": "1.5s" })}
              >
                <span className="nm">{name}</span>
                <span className={`r ${late ? "t-dan" : "t-soft"}`}>
                  <M>{days}</M> days
                </span>
                <span className="r">
                  <M>{amt}</M>
                </span>
                <span className="sc">
                  <span
                    className={`pill ${pill} mono`}
                    data-a="F2"
                    data-in=""
                    data-count={score}
                    data-du="1200"
                  >
                    {score}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    case "chasing":
      return (
        <div className="ap acard f3">
          <div className="f3top">
            <div>
              <p className="at">
                Meridian Traders · <M>INV-2131</M>
              </p>
              <p className="apr">To Kavita, Accounts</p>
            </div>
            <div className="chs">
              <span className="pill pd-alt">Email</span>
              <span className="pill pd-acc">WhatsApp</span>
              <span className="pill pd-alt">SMS</span>
            </div>
          </div>
          <div className="seg">
            <i
              className="segi"
              ref={refs.seg as React.RefObject<HTMLElement>}
              data-a="F3"
              data-in=""
            />
            <span>Gentle</span>
            <span>Standard</span>
            <span>Firm</span>
          </div>
          <p className="aprev f3m">
            <span className="fin" ref={refs.fin}>
              Kavita, <M>INV-2131</M> for <M>₹72,000</M> is <M>24</M> days overdue. Please pay by
              Friday, or tell us what&apos;s holding it up.
            </span>
            <span className="typ" ref={refs.typ} />
          </p>
          <div className="f3f">
            <span className="pill pd-warn">Waiting for your approval</span>
            <span className="abtn">Approve and send</span>
          </div>
        </div>
      );
    case "contact-ladder":
      return (
        <div className="ap f4">
          <i className="f4rail" />
          {(
            [
              [
                "M",
                "Mahesh",
                "Director",
                "pd-acc",
                <>
                  WhatsApp · Day <M>14</M>
                </>,
                "2.6s",
              ],
              [
                "A",
                "Anita",
                "Finance head",
                "pd-warn",
                <>
                  No reply · Day <M>7</M>
                </>,
                "1.6s",
              ],
              [
                "R",
                "Rohan",
                "Accounts",
                "pd-warn",
                <>
                  No reply · Day <M>3</M>
                </>,
                "0.5s",
              ],
            ] as const
          ).map(([init, name, role, pill, label, dl]) => (
            <div key={name} className="acard f4c">
              <span className="avt">{init}</span>
              <div className="who">
                <p className="at">{name}</p>
                <p className="apr">{role}</p>
              </div>
              <span
                className={`pill ${pill} k-in`}
                data-a="F4"
                data-in=""
                style={vars({ "--fx": "12px", "--fy": "0px", "--dl": dl })}
              >
                {label}
              </span>
            </div>
          ))}
          <i
            className="f4m k-climb"
            data-a="F4"
            data-in=""
            style={vars({ "--du": "3s", "--dl": "0.2s" })}
          />
        </div>
      );
    case "payment-matching":
      return (
        <div className="ap f5">
          <div
            className="acard f5a k-in"
            data-a="F5"
            data-in=""
            style={vars({ "--fx": "-24px", "--fy": "0px" })}
          >
            <p className="amet">
              <M>₹1,17,966</M> received
            </p>
            <p className="apr" style={{ marginTop: 4 }}>
              Bank alert · <M>15 Oct</M> · UTR <M>••4417</M> · VERTEX LABS PVT LTD
            </p>
            <div className="aprev" style={{ marginTop: 12 }}>
              Matched to{" "}
              <b className="ab">
                <M>INV-2096</M>
              </b>{" "}
              ·{" "}
              <b className="ab">
                <M>₹1,20,000</M>
              </b>
            </div>
            <div className="callw" style={{ marginTop: 10 }}>
              <M>₹2,034</M> short: TDS at <M>2%</M> on <M>₹1,01,695</M> taxable
            </div>
          </div>
          <div className="acard f5b">
            <div
              className="atr k-in"
              data-a="F5"
              data-in=""
              style={vars({ "--fy": "8px", "--dl": "0.5s", "--du": "0.3s" })}
            >
              <span className="t-soft">Invoice</span>
              <span className="r">
                <M>₹1,20,000</M>
              </span>
            </div>
            <div
              className="atr k-in"
              data-a="F5"
              data-in=""
              style={vars({ "--fy": "8px", "--dl": "0.8s", "--du": "0.3s" })}
            >
              <span className="t-soft">
                TDS at <M>2%</M> on <M>₹1,01,695</M>
              </span>
              <span className="r">
                <M>−₹2,034</M>
              </span>
            </div>
            <div
              className="atr tot k-in"
              data-a="F5"
              data-in=""
              style={vars({ "--fy": "8px", "--dl": "1.1s", "--du": "0.3s" })}
            >
              <span className="t-soft">Expected</span>
              <span className="r">
                <M>₹1,17,966</M>
              </span>
            </div>
            <div
              className="atr k-in"
              data-a="F5"
              data-in=""
              style={vars({ "--fy": "8px", "--dl": "1.4s", "--du": "0.3s" })}
            >
              <span className="t-soft">Received</span>
              <span className="r t-acc">
                <M>₹1,17,966</M>
              </span>
            </div>
            <PaidStamp className="f5s" rot="-6deg" dl="1.9s" date="15 OCT 2026" />
          </div>
        </div>
      );
    case "payer-grades":
      return (
        <div className="ap acard f6">
          <div className="ath" style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
            <span>Account</span>
            <span className="r">Grade</span>
          </div>
          {(
            [
              [
                "Northline Creative",
                <>
                  Pays on time, <M>9</M> of <M>10</M> invoices
                </>,
                "A",
                "pd-acc",
                "0.2s",
              ],
              [
                "Patel & Sons",
                <>
                  <M>12</M> days late on average
                </>,
                "B",
                "pd-alt",
                "0.45s",
              ],
              [
                "Vertex Labs Pvt Ltd",
                <>
                  <M>38</M> days late, kept <M>2</M> of <M>5</M> promises
                </>,
                "C",
                "pd-warn",
                "0.7s",
              ],
              [
                "Kaveri & Sons",
                <>
                  <M>96</M> days late, no reply
                </>,
                "D",
                "pd-dan",
                "0.95s",
              ],
            ] as const
          ).map(([name, note, g, pill, dl]) => (
            <div key={name} className="f6r">
              <div>
                <p className="at">{name}</p>
                <p className="apr">{note}</p>
              </div>
              <span
                className={`f6g ${pill} k-in`}
                data-a="F6"
                data-in=""
                style={vars({ "--fx": "40px", "--fy": "0px", "--dl": dl })}
              >
                {g}
              </span>
            </div>
          ))}
        </div>
      );
    case "interest":
      return (
        <div className="ap f7">
          <div className="acard">
            <div className="ahd">
              <span className="at">
                Saraswat Textiles Pvt Ltd · <M>INV-2104</M>
              </span>
              <span className="at">
                <M>₹4,80,000</M>
              </span>
            </div>
            <div className="f7b">
              <div className="invt">
                <span className="aey">Interest accrued</span>
                <span className="pill pd-alt">
                  Day{" "}
                  <span
                    className="mono"
                    data-a="F7"
                    data-in=""
                    data-steps="45,46,47,48"
                    data-du="1500"
                  >
                    48
                  </span>
                </span>
              </div>
              <p className="amet">
                <M>
                  ₹
                  <span
                    data-a="F7"
                    data-in=""
                    data-steps="10652,10889,11125,11362"
                    data-fmt="inr"
                    data-du="1500"
                  >
                    11,362
                  </span>
                </M>
              </p>
              <p className="apr">Switched on for this customer</p>
            </div>
          </div>
          <div
            className="acard f7o k-in"
            data-a="F7"
            data-in=""
            style={vars({ "--fy": "48px", "--dl": "1.9s", "--du": "0.55s" })}
          >
            <p className="at">Waive if paid by Fri</p>
            <p className="apr">
              Drop <M>₹11,362</M> if <M>₹4,80,000</M> lands by <M>17 Oct</M>.
            </p>
            <span className="abtn">Send offer</span>
          </div>
        </div>
      );
    case "discounts":
      return (
        <div className="ap acard f8">
          <div className="ahd">
            <span className="at">
              Saraswat Textiles · <M>₹4,80,000</M>
            </span>
            <span className="apr">
              Paid <M>30</M> days early
            </span>
          </div>
          <div className="f8in">
            <div className="f8s">
              <span className="aey">Discount</span>
              <div className="trk">
                <div
                  className="thw k-move"
                  data-a="F8"
                  data-in=""
                  style={vars({ "--dl": "0.3s", "--du": "1s" })}
                >
                  <span className="thumb" />
                </div>
              </div>
              <span className="amet">
                <M>
                  <span
                    data-a="F8"
                    data-in=""
                    data-from="1"
                    data-count="2"
                    data-dec="1"
                    data-dl="300"
                    data-du="1000"
                  >
                    2.0
                  </span>
                  %
                </M>
              </span>
            </div>
            <div>
              <div className="f8row">
                <span className="apr">Your cost of borrowing</span>
                <span className="at">
                  <M>14.0%</M> a year
                </span>
              </div>
              <div className="f8bar">
                <i className="bb" />
              </div>
            </div>
            <div>
              <div className="f8row">
                <span className="apr">What this discount costs</span>
                <span className="at">
                  <M>
                    <span
                      data-a="F8"
                      data-in=""
                      data-from="12.3"
                      data-count="24.8"
                      data-dec="1"
                      data-dl="300"
                      data-du="1000"
                    >
                      24.8
                    </span>
                    %
                  </M>{" "}
                  a year
                </span>
              </div>
              <div className="f8bar">
                <i
                  className="bi k-grow"
                  data-a="F8"
                  data-in=""
                  style={vars({ "--sx0": 0.496, "--dl": "0.3s", "--du": "1s" })}
                />
              </div>
            </div>
            <p className="f8v">
              <span
                className="pill pd-acc k-out"
                data-a="F8"
                data-in=""
                style={vars({ "--dl": "0.55s", "--du": "0.2s" })}
              >
                Cheaper than borrowing
              </span>
              <span
                className="pill pd-dan k-in"
                data-a="F8"
                data-in=""
                style={vars({ "--fy": "8px", "--dl": "0.7s", "--du": "0.3s" })}
              >
                Costs more than borrowing
              </span>
            </p>
          </div>
        </div>
      );
    case "payment-plans":
      return (
        <div className="ap acard f9">
          <div className="f9h">
            <div>
              <p className="at">Saraswat Textiles Pvt Ltd</p>
              <p className="apr">
                <M>INV-2104</M> · <M>4</M> instalments
              </p>
            </div>
            <p className="amet">
              <M>₹4,80,000</M>
            </p>
          </div>
          <div className="f9bar">
            <i
              className="f9f k-grow"
              data-a="F9"
              data-in=""
              style={vars({ "--dl": "1s", "--du": "0.6s" })}
            />
            {["25%", "50%", "75%"].map((left, i) => (
              <i
                key={left}
                className="f9sep k-growy"
                data-a="F9"
                data-in=""
                style={vars({ left, "--dl": `${0.2 + i * 0.15}s` })}
              />
            ))}
          </div>
          <div className="f9l">
            <div>
              <span className="aey">
                <M>15 Oct</M>
              </span>
              <span className="at">
                <M>₹1,20,000</M>
              </span>
              <span
                className="pill pd-acc k-fade"
                data-a="F9"
                data-in=""
                style={vars({ "--dl": "1.5s" })}
              >
                <Tick />
                Paid
              </span>
            </div>
            {["15 Nov", "15 Dec", "15 Jan"].map((d, i) => (
              <div
                key={d}
                className="k-fade"
                data-a="F9"
                data-in=""
                style={vars({ "--dl": `${0.35 + i * 0.15}s` })}
              >
                <span className="aey">
                  <M>{d}</M>
                </span>
                <span className="at">
                  <M>₹1,20,000</M>
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    case "credit-debit-notes":
      return (
        <div className="ap f10">
          <div>
            <div className="slotbar" />
            <div
              className="f10mv k-move"
              data-a="F10"
              data-in=""
              style={vars({ "--dl": "1.9s", "--du": "0.8s" })}
            >
              <div
                className="acard f10n k-print"
                data-a="F10"
                data-in=""
                style={vars({ "--dl": "0.2s", "--du": "1.3s" })}
              >
                <span className="aey">Credit note</span>
                <p className="at">
                  <M>CN-0041</M>
                </p>
                <p className="apr">
                  Against <M>INV-2104</M>
                  <br />
                  Early payment discount
                </p>
                <p className="amet">
                  <M>−₹12,000</M>
                </p>
                <p className="apr">
                  <M>15 Oct 2026</M>
                </p>
              </div>
            </div>
          </div>
          <div className="f10bk">
            <span className="aey">Your books · Tally</span>
          </div>
        </div>
      );
    case "credit-limits":
      return (
        <div className="ap acard f11">
          <div className="ahd">
            <span className="at">Saraswat Textiles Pvt Ltd</span>
            <span className="apr">
              Limit <M>₹5,00,000</M>
            </span>
          </div>
          <div className="f11in">
            <div className="f11row">
              <span className="aey">Owed now</span>
              <span className="amet">
                <M>
                  ₹
                  <span data-a="F11" data-in="" data-count="560000" data-fmt="inr" data-du="1100">
                    5,60,000
                  </span>
                </M>
              </span>
            </div>
            <div className="f11t">
              <i className="u1 k-grow" data-a="F11" data-in="" style={vars({ "--du": "0.85s" })} />
              <i
                className="u2 k-grow"
                data-a="F11"
                data-in=""
                style={vars({ "--dl": "0.85s", "--du": "0.25s" })}
              />
              <i className="lim" />
            </div>
            <p className="f11ll apr">Limit</p>
            <div
              className="callw k-in"
              data-a="F11"
              data-in=""
              style={vars({ "--fy": "-16px", "--dl": "1.25s", "--du": "0.4s" })}
            >
              Hold · New orders wait until <M>₹60,000</M> is cleared.
            </div>
          </div>
        </div>
      );
    case "legal-escalation":
    case "matter-record": {
      const record = slug === "matter-record";
      const steps = [
        ["1", "Section 43B(h) notice", "Free", false],
        ["2", "MSE Facilitation Council", "Free to file", false],
        ["3", "Advocate's notice", "Flat fee", true],
      ] as const;
      // The matter record opens on the advocate step; legal escalation lights each step in turn.
      const base = record ? 0 : 1.7;
      return (
        <div className={`ap f12${record ? " f14" : ""}`}>
          <div>
            {steps.map(([n, name, fee, on], i) =>
              record ? (
                <div
                  key={n}
                  className={`acard f12i${on ? " on" : ""}`}
                  style={on ? undefined : { opacity: 0.62 }}
                >
                  <span className="n">
                    <M>{n}</M>
                  </span>
                  <span className="at">{name}</span>
                  <span className={`pill ${on ? "pd-acc" : "pd-alt"} c`}>{fee}</span>
                </div>
              ) : (
                <div
                  key={n}
                  className={`acard f12i k-light${on ? " on" : ""}`}
                  data-a="F12"
                  data-in=""
                  style={vars({ "--dl": `${i * 0.45}s`, ...(on ? { "--end": 1 } : {}) })}
                >
                  <span className="n">
                    <M>{n}</M>
                  </span>
                  <span className="at">{name}</span>
                  <span className={`pill ${on ? "pd-acc" : "pd-alt"} c`}>{fee}</span>
                </div>
              ),
            )}
            <div className="acard f12i" style={{ opacity: 0.62 }}>
              <span className="n">
                <M>4</M>
              </span>
              <span className="at">Summary suit</span>
              <span className="pill pd-alt c">Court fees</span>
            </div>
          </div>
          <div className="f12m">
            <p className="aey k-fade" data-a="F12" data-in="" style={vars({ "--dl": `${base}s` })}>
              Matter · Kaveri &amp; Sons · <M>INV-2091</M>
            </p>
            <div
              className="acard msg k-in"
              data-a="F12"
              data-in=""
              style={vars({ "--fy": "10px", "--dl": `${base + 0.2}s` })}
            >
              <p className="at">
                You · <M>03 Oct</M>
              </p>
              <p className="apr">Ledger statement and delivery challans attached.</p>
            </div>
            <div
              className="acard msg k-in"
              data-a="F12"
              data-in=""
              style={vars({ "--fy": "10px", "--dl": `${base + 0.6}s` })}
            >
              <p className="at">
                Advocate · <M>04 Oct</M>
              </p>
              <p className="apr">Received. The notice goes out today on my letterhead.</p>
            </div>
            <div
              className="pdf k-in"
              data-a="F12"
              data-in=""
              style={vars({ "--fy": "-10px", "--dl": `${base + 1.1}s` })}
            >
              <i>PDF</i>
              <span className="at">Legal notice · Kaveri &amp; Sons</span>
            </div>
          </div>
        </div>
      );
    }
    case "monday-digest":
      return (
        <div
          className="ap acard f13 k-print"
          data-a="F13"
          data-in=""
          style={vars({ "--du": "0.6s" })}
        >
          <div className="f13h">
            <span className="aey">Monday digest</span>
            <p className="amet" style={{ fontSize: 22, marginTop: 4 }}>
              Your week
            </p>
            <p className="apr">
              From Settle Swiftly · Mon <M>13 Oct</M>, <M>08:00</M>
            </p>
          </div>
          <div
            className="atr k-in"
            data-a="F13"
            data-in=""
            style={vars({ "--fy": "8px", "--dl": "0.5s", "--du": "0.3s" })}
          >
            <span className="t-soft">Came in</span>
            <span className="r v t-acc">
              <M>
                ₹
                <span
                  data-a="F13"
                  data-in=""
                  data-count="286000"
                  data-fmt="inr"
                  data-dl="500"
                  data-du="900"
                >
                  2,86,000
                </span>
              </M>
            </span>
          </div>
          <div
            className="atr k-in"
            data-a="F13"
            data-in=""
            style={vars({ "--fy": "8px", "--dl": "0.7s", "--du": "0.3s" })}
          >
            <span className="t-soft">
              Promised by <M>30 Oct</M>
            </span>
            <span className="r v">
              <M>
                ₹
                <span
                  data-a="F13"
                  data-in=""
                  data-count="480000"
                  data-fmt="inr"
                  data-dl="700"
                  data-du="900"
                >
                  4,80,000
                </span>
              </M>
            </span>
          </div>
          <div
            className="atr k-in"
            data-a="F13"
            data-in=""
            style={vars({ "--fy": "8px", "--dl": "0.9s", "--du": "0.3s" })}
          >
            <span className="t-soft">Needs you</span>
            <span className="r">
              <span className="pill pd-warn">
                <span
                  className="mono"
                  data-a="F13"
                  data-in=""
                  data-count="2"
                  data-dl="900"
                  data-du="500"
                >
                  2
                </span>
                &nbsp;drafts
              </span>
            </span>
          </div>
          <div
            className="atr k-in"
            data-a="F13"
            data-in=""
            style={vars({ "--fy": "8px", "--dl": "1.1s", "--du": "0.3s" })}
          >
            <span className="t-soft">Still out</span>
            <span className="r v">
              <M>
                ₹
                <span
                  data-a="F13"
                  data-in=""
                  data-count="660000"
                  data-fmt="inr"
                  data-dl="1100"
                  data-du="900"
                >
                  6,60,000
                </span>
              </M>
            </span>
          </div>
        </div>
      );
  }
}

/**
 * One feature's animated vignette, as on the home features stage, the nav's
 * Product preview (`mini`, scaled to fit) and, later, each feature page.
 *
 * Plays while `run` is true; switching to a new feature or flipping `run` back
 * on replays it from the start. Under reduced motion it shows the final frame.
 */
export function FeatureScene({
  slug,
  mode = "stage",
  run = true,
  armed = true,
}: {
  slug: FeatureSlug;
  mode?: "stage" | "mini" | "page";
  run?: boolean;
  armed?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const seg = useRef<HTMLElement>(null);
  const fin = useRef<HTMLSpanElement>(null);
  const typ = useRef<HTMLSpanElement>(null);
  const played = useRef(false);

  // Play: restart the CSS (when replaying), run counters, type the chasing message.
  useEffect(() => {
    const root = rootRef.current;
    if (!run || !root) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (played.current) restartAnimations(root.querySelectorAll("[data-a]"));
    played.current = true;
    if (armed) {
      root
        .querySelectorAll<HTMLElement>("[data-count],[data-steps]")
        .forEach((a) => runCount(a, timers));
      if (slug === "chasing") typeChasing(timers);
    }
    return () => {
      timers.forEach(clearTimeout);
      resetChasing();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, run, armed]);

  /** Resets the chasing scene's typing to its static final message. */
  function resetChasing() {
    if (typ.current) {
      typ.current.textContent = "";
      typ.current.style.opacity = "";
    }
    if (fin.current) fin.current.style.display = "";
    if (seg.current) seg.current.style.transform = "";
  }

  /** The message types itself, then the tone switches gentle → standard → firm. */
  function typeChasing(timers: ReturnType<typeof setTimeout>[]) {
    const f = fin.current,
      t = typ.current,
      s = seg.current;
    if (!f || !t) return;
    const T = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const total = tone(0).reduce((a, x) => a + x[0].length, 0);
    f.style.display = "none";
    if (s) s.style.transform = "translateX(0%)";
    for (let n = 0; n <= total; n += 3) {
      const k = n;
      T((k * 1300) / total, () => paint(t, tone(0), k));
    }
    T(1300, () => paint(t, tone(0), total));
    const swap = (k: number, at: number) => {
      T(at, () => {
        if (s) s.style.transform = `translateX(${k * 100}%)`;
        t.style.opacity = "0";
      });
      T(at + 160, () => {
        paint(t, tone(k), 1e9);
        t.style.opacity = "1";
      });
    };
    swap(1, 2000);
    swap(2, 3300);
    T(3800, resetChasing);
  }

  // Mini mode: lay the scene out at 680px and scale it down to the box.
  useIsoLayoutEffect(() => {
    const w = wrapRef.current,
      i = innerRef.current;
    if (!w || !i) return;
    const fit = () => {
      if (mode !== "mini") {
        i.style.transform = "";
        w.style.height = "";
        return;
      }
      const k = Math.min(1, w.clientWidth / 680);
      i.style.transform = `scale(${k.toFixed(4)})`;
      w.style.height = `${Math.ceil(i.offsetHeight * k)}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(w);
    ro.observe(i);
    return () => ro.disconnect();
  }, [mode, slug]);

  return (
    <div
      className="fsx"
      ref={rootRef}
      data-armed={armed ? "true" : "false"}
      data-mode={mode}
      data-run={run ? "true" : "false"}
    >
      <div className="fsw" ref={wrapRef}>
        <div className="fsi" ref={innerRef}>
          <Scene key={slug} slug={slug} refs={{ seg, fin, typ }} />
        </div>
      </div>
    </div>
  );
}
