import { Fragment, useState, type ReactNode } from "react";

import { BOOK_IS_EXTERNAL, LINKS, PLANS, type Money } from "./content";
import { Tick } from "./marks";
import { vars } from "./style";
import { inr } from "./motion";

/** Every glyph a price can show, in the order they stack in each rolling digit. */
const GLYPHS = "0123456789,₹$";
/** Fixed digit slots per price, so prices roll in place rather than reflow. */
const SLOTS = 8;

const NUM = /(?:[−+] ?)?[₹$]\d[\d,]*(?:\.\d+)?|(?<![\w₹$.,−-])\d(?:[\d,.]*\d)?%?(?![\w])/g;

/** Sets the figures in a line of copy in mono: "Up to 1,000" → "Up to <mono>1,000</mono>". */
function rich(s: string): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  NUM.lastIndex = 0;
  for (let m = NUM.exec(s); m; m = NUM.exec(s)) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(
      <span key={i++} className="mono">
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return <Fragment>{out}</Fragment>;
}

type Currency = "inr" | "usd";

/** Formats a plan price in the chosen currency. */
function money(m: Money, cur: Currency): string {
  return cur === "inr" ? `₹${inr(m.inr)}` : `$${m.usd}`;
}

/**
 * The three plan cards with monthly/annual and ₹/$ switches. Each price is a
 * row of rolling digits, so switching billing or currency rolls the numbers.
 * Prices are indicative while the product is built.
 */
export function PricingPlans({ compare = false }: { compare?: boolean }) {
  const [bill, setBill] = useState<"m" | "a">("m");
  const [cur, setCur] = useState<Currency>("inr");

  return (
    <div className="pp">
      <div className="ppc">
        <div className="sg" role="group" aria-label="Billing">
          <button type="button" aria-pressed={bill === "m"} onClick={() => setBill("m")}>
            Monthly
          </button>
          <button type="button" aria-pressed={bill === "a"} onClick={() => setBill("a")}>
            Annual{" "}
            <span className="sgx">
              (<span className="mono">2</span> months free)
            </span>
          </button>
        </div>
        <div className="sg" role="group" aria-label="Currency">
          <button type="button" aria-pressed={cur === "inr"} onClick={() => setCur("inr")}>
            ₹ INR
          </button>
          <button type="button" aria-pressed={cur === "usd"} onClick={() => setCur("usd")}>
            $ USD
          </button>
        </div>
      </div>

      <div className="ppg" data-t="">
        {PLANS.map((pl, i) => {
          const price = bill === "a" ? pl.annual : pl.monthly;
          const txt = price ? money(price, cur) : "";
          const per = bill === "a" ? "per year" : "per month";
          const chars = txt.split("");
          while (chars.length < SLOTS) chars.unshift("");
          const isBook = pl.href === LINKS.book;
          const external = isBook && BOOK_IS_EXTERNAL;
          return (
            <article
              key={pl.key}
              className="pcard k-in"
              data-a="PR2"
              data-hl={pl.highlight ? "true" : "false"}
              style={vars({ "--dl": `${(i * 0.08).toFixed(2)}s`, "--du": "0.5s", "--fy": "24px" })}
              aria-labelledby={`plan-${pl.key}`}
            >
              <p className="lbl pmost" data-on={pl.highlight ? "true" : "false"}>
                Most teams start here
              </p>
              <h3 className="pname" id={`plan-${pl.key}`}>
                {pl.name}
              </h3>
              <p className="pfor">{pl.for}</p>
              <div className="pprice">
                {!price ? (
                  <>
                    <p className="pcustom dsp">Custom</p>
                    <p className="pper">Priced to your volume</p>
                  </>
                ) : (
                  <>
                    <p className="pnum mono" aria-hidden="true">
                      {chars.map((c, j) => (
                        <span key={j} className="dg" data-b={c === "" ? "true" : "false"}>
                          <span
                            className="dgs"
                            data-a="PR1"
                            data-in=""
                            style={{
                              transform: `translateY(${c === "" ? "0em" : (-1.15 * GLYPHS.indexOf(c)).toFixed(2) + "em"})`,
                            }}
                          >
                            {GLYPHS.split("").map((g) => (
                              <i key={g}>{g}</i>
                            ))}
                          </span>
                        </span>
                      ))}
                    </p>
                    <p className="sr">{`${txt} ${per}`}</p>
                    <p className="pper">{per}</p>
                    <p
                      className="psave"
                      data-on={bill === "a" ? "true" : "false"}
                      data-a="PR1"
                      data-in=""
                    >
                      Save <span className="mono">{pl.save ? money(pl.save, cur) : ""}</span>
                    </p>
                  </>
                )}
              </div>
              <ul className="pinc">
                {pl.lead && <li className="plead">{pl.lead}</li>}
                {pl.items.map((it) => (
                  <li key={it}>
                    <Tick />
                    <span>{rich(it)}</span>
                  </li>
                ))}
              </ul>
              <dl className="pspec">
                <div>
                  <dt>Open invoices</dt>
                  <dd>{rich(pl.invoices)}</dd>
                </div>
                <div>
                  <dt>Users</dt>
                  <dd>{rich(pl.users)}</dd>
                </div>
              </dl>
              <a
                className={`btn ${pl.primary ? "btn-p" : "btn-s"} on-dk`}
                href={pl.href}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener" : undefined}
              >
                {pl.cta}
              </a>
            </article>
          );
        })}
      </div>
      <p className="ppn">
        Every plan is in development. Enterprise customers get access first; Starter and Growth open
        after launch.
      </p>
      {compare && (
        <a className="tl ppl" href={LINKS.pricing}>
          Compare plans →
        </a>
      )}
    </div>
  );
}
