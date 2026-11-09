import { useState } from "react";

import { FAQS } from "./content";
import { EarlyAccessForm } from "./EarlyAccess";
import { CursorArrow } from "./marks";
import { vars } from "./style";

/** 02 Problem: the ₹8.1 lakh crore figure counts up, then a mint line draws to a tick. */
export function Problem() {
  return (
    <section className="prob dk" aria-labelledby="prob-h" data-screen-label="02 Problem">
      <div className="wrap k-in" data-t="" data-a="S1" style={vars({ "--fy": "16px" })}>
        <h2 id="prob-h" className="sr">
          The problem
        </h2>
        <p className="dsp giant" data-t="">
          <span
            className="k-fade"
            data-a="P1"
            style={vars({ "--du": "0.3s", display: "inline-block" })}
          >
            ₹
            <span data-a="P1" data-count="8.1" data-dec="1" data-du="1400">
              8.1
            </span>{" "}
            lakh crore
          </span>
        </p>
        <div className="pt">
          <p className="pt1">in late payments is owed to small businesses in India alone.</p>
          <p className="dsp pt2">Every late invoice is a loan you never agreed to make.</p>
          <p className="psrc">
            Source: Economic Survey of India <span className="mono">2025–26</span>
          </p>
        </div>
        <div className="mline" data-t="" aria-hidden="true">
          <i className="ml k-grow" data-a="P2" style={vars({ "--du": "1s" })} />
          <svg viewBox="3 30 23 16">
            <path
              className="k-draw"
              data-a="P2"
              style={vars({ "--dl": "0.95s", "--du": "0.25s" })}
              d="M6 37L10 43L23 33.5"
              pathLength={1}
            />
          </svg>
        </div>
      </div>
    </section>
  );
}

/** 05 Approval: a drafted email is approved and slides across the seam to "Sent". */
export function Approval() {
  return (
    <section
      className="appr lt"
      aria-labelledby="ap-h"
      data-screen-label="05 You approve everything"
    >
      <div className="wrap aph k-in" data-t="" data-a="S1" style={vars({ "--fy": "16px" })}>
        <h2 id="ap-h" className="dsp hs">
          Nothing leaves without you.
        </h2>
      </div>
      <div className="split" data-t="" aria-hidden="true">
        <div className="pane pa">
          <p className="ptl lbl">Drafted</p>
          <div
            className="ap acard acd k-move"
            data-a="A1"
            style={vars({ "--dl": "1.2s", "--du": "0.6s" })}
          >
            <div className="invt">
              <div>
                <p className="at">
                  Northline Creative · <span className="mono">INV-2117</span>
                </p>
                <p className="apr">Email to Priya, Accounts</p>
              </div>
              <span className="pill pd-warn">Draft</span>
            </div>
            <p className="aprev">
              Hi Priya, <span className="mono">INV-2117</span> for{" "}
              <span className="mono">₹48,000</span> was due on <span className="mono">4 Oct</span>.
              Could you tell us when it&apos;s scheduled? Thank you.
            </p>
            <p className="ft">
              <span className="apr">Gentle tone · 1st reminder</span>
              <span className="apr">
                <span className="mono">09:01</span>
              </span>
            </p>
          </div>
          <div className="seam ap">
            <span className="abtn k-press" data-a="A1" style={vars({ "--dl": "0.95s" })}>
              Approve
            </span>
          </div>
          <CursorArrow className="cursor" data-a="A1" />
        </div>
        <div className="pane pb dk">
          <p className="ptl lbl">Sent</p>
          <div
            className="aslot k-out"
            data-a="A1"
            style={vars({ "--dl": "1.25s", "--du": "0.4s" })}
          />
          <p className="asent">
            <svg viewBox="3 30 23 16">
              <path
                className="k-draw"
                data-a="A1"
                style={vars({ "--dl": "1.85s", "--du": "0.25s" })}
                d="M6 37L10 43L23 33.5"
                pathLength={1}
              />
            </svg>
            <span className="k-wipe" data-a="A1" style={vars({ "--dl": "1.95s", "--du": "0.4s" })}>
              Sent <span className="mono">09:02</span> · approved by you
            </span>
          </p>
        </div>
      </div>
      <p className="sr">
        A drafted email to Priya at Northline Creative about <span className="mono">INV-2117</span>{" "}
        for <span className="mono">₹48,000</span> waits on the Drafted side. You click Approve, and
        it moves to the Sent side, marked sent at <span className="mono">09:02</span>, approved by
        you.
      </p>
      <div className="wrap">
        <div className="facts k-in" data-t="" data-a="S1" style={vars({ "--fy": "16px" })}>
          {(
            [
              ["Messages", "only when you approve"],
              ["Interest", "off until you say"],
              ["Offers", "wait for sign-off"],
              ["Payments", "marked paid by you"],
              ["Books", "nothing written unasked"],
              ["Advocates", "only when you send"],
            ] as const
          ).map(([k, v]) => (
            <p key={k}>
              <b>{k}</b>
              {v}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * 07 The people behind it. The design leaves both cards as placeholders
 * (founder note, data handling) to be written; they render as dashed slots.
 */
export function People() {
  return (
    <section
      id="about"
      className="slots lt"
      aria-labelledby="who-h"
      data-screen-label="07 The people behind it"
    >
      <div className="wrap k-in" data-t="" data-a="S1" style={vars({ "--fy": "16px" })}>
        <h2 id="who-h" className="sr">
          The people behind it
        </h2>
        <div className="slg">
          <div className="slot">
            <p className="t">[Founder note: to be written]</p>
            <p>[Founder name] · [Role] · [LinkedIn →]</p>
            <p>Built in [City].</p>
          </div>
          <div className="slot">
            <p className="t">[How we handle your data: to be added]</p>
            <p>[Security summary]</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** 08 Questions: one-open-at-a-time accordion. */
export function Questions() {
  const [open, setOpen] = useState(-1);
  return (
    <section
      id="questions"
      className="faq lt"
      aria-labelledby="faq-h"
      data-screen-label="08 Questions"
      style={{ scrollMarginTop: 64 }}
    >
      <div className="wrap g12 faqg k-in" data-t="" data-a="S1" style={vars({ "--fy": "16px" })}>
        <h2 id="faq-h" className="dsp faqh">
          Questions.
        </h2>
        <div className="faql">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q} className="qr" data-open={isOpen ? "true" : "false"}>
                <h3 className="qh">
                  <button
                    className="qb"
                    type="button"
                    id={`qb${i}`}
                    aria-expanded={isOpen}
                    aria-controls={`qa${i}`}
                    onClick={() => setOpen(isOpen ? -1 : i)}
                  >
                    <span>{f.q}</span>
                    <span className="pmx" aria-hidden="true">
                      <i />
                      <i data-a="Q1" data-in="" />
                    </span>
                  </button>
                </h3>
                <div className="qa" id={`qa${i}`} role="region" aria-labelledby={`qb${i}`}>
                  <p
                    className="k-in"
                    data-a="Q1"
                    data-in=""
                    style={vars({ "--fy": "-6px", "--du": "0.25s" })}
                  >
                    {f.a}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** 09 Closing call to action: the headline again, and the full early-access form. */
export function ClosingCta() {
  return (
    <section
      id="access"
      className="cta dk"
      aria-labelledby="cta-h"
      data-screen-label="09 Early access"
      style={{ scrollMarginTop: 64 }}
    >
      <div className="wrap k-in" data-t="" data-a="S1" style={vars({ "--fy": "16px" })}>
        <h2 id="cta-h" className="dsp hh ctah">
          Stop waiting to get paid.
        </h2>
        <EarlyAccessForm variant="cta" />
        <p className="note">
          Every plan is in development. Enterprise customers get access first.{" "}
          <a className="tl" href="#pricing">
            See pricing
          </a>
        </p>
      </div>
    </section>
  );
}
