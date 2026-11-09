import { useState } from "react";

import { BOOK_IS_EXTERNAL, LINKS } from "./content";
import { EarlyAccessForm } from "./EarlyAccess";
import { LogoMark, Wordmark } from "./marks";
import { useMotion } from "./motion";

type Col = { key: string; title: string; links: { label: string; href: string; book?: boolean }[] };

const COLS: Col[] = [
  {
    key: "product",
    title: "Product",
    links: [
      { label: "Features", href: LINKS.features },
      { label: "How it works", href: LINKS.how },
      { label: "Pricing", href: LINKS.pricing },
      { label: "Payment matching", href: LINKS.feature("payment-matching") },
      { label: "Late payment interest", href: LINKS.feature("interest") },
      { label: "Legal escalation", href: LINKS.feature("legal-escalation") },
      { label: "Monday digest", href: LINKS.feature("monday-digest") },
    ],
  },
  {
    key: "integrations",
    title: "Integrations",
    links: ["Tally", "Zoho Books", "Google Sheets", "Excel", "QuickBooks", "Any CSV"].map(
      (label) => ({
        label,
        href: LINKS.integrations,
      }),
    ),
  },
  {
    key: "company",
    title: "Company",
    links: [
      { label: "About", href: LINKS.about },
      { label: "Security", href: LINKS.security },
      { label: "Contact", href: LINKS.contact },
      { label: "Talk to the founders", href: LINKS.book, book: true },
    ],
  },
  {
    key: "legal",
    title: "Legal",
    links: [
      { label: "Privacy", href: LINKS.privacy },
      { label: "Terms", href: LINKS.terms },
    ],
  },
];

/**
 * The marketing site's footer: logo and compact early-access form, four link
 * columns (accordions below 768px), placeholder contact line, and the legal
 * disclaimer. Must sit under a WaitlistProvider.
 */
export function SiteFooter() {
  const { armed } = useMotion();
  const [openCol, setOpenCol] = useState("");

  return (
    <footer className="sf" data-armed={armed ? "true" : "false"} data-screen-label="Footer">
      <div className="wrap">
        <div className="sft">
          <a className="logo" href={LINKS.home} aria-label="Settle Swiftly, home">
            <LogoMark size={24} />
            <Wordmark />
          </a>
          <div className="sff dk">
            <EarlyAccessForm variant="footer" />
          </div>
        </div>
        <nav className="sfc" aria-label="Footer">
          {COLS.map((c) => {
            const open = openCol === c.key;
            return (
              <div className="sfcol" key={c.key} data-open={open ? "true" : "false"}>
                <h2 className="lbl sfh">{c.title}</h2>
                <button
                  className="sfhb lbl"
                  type="button"
                  aria-expanded={open}
                  aria-controls={`sfl-${c.key}`}
                  onClick={() => setOpenCol(open ? "" : c.key)}
                >
                  {c.title}
                  <span className="pmx" aria-hidden="true">
                    <i />
                    <i />
                  </span>
                </button>
                <ul className="sfl" id={`sfl-${c.key}`}>
                  {c.links.map((l) => {
                    const ext = l.book && BOOK_IS_EXTERNAL;
                    return (
                      <li key={l.label}>
                        <a
                          href={l.href}
                          target={ext ? "_blank" : undefined}
                          rel={ext ? "noopener" : undefined}
                        >
                          {l.label}
                          {l.book && (
                            <span className="ext" aria-hidden="true">
                              ↗
                            </span>
                          )}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
        {/* Placeholders from the design, to be filled in. */}
        <p className="sfx">
          <span>[contact email]</span>
          <span className="dot" aria-hidden="true">
            ·
          </span>
          <span>[City], India</span>
          <span className="dot" aria-hidden="true">
            ·
          </span>
          <span>[LinkedIn]</span>
        </p>
        <div className="sfb">
          <p className="copy">
            © <span className="mono">{new Date().getFullYear()}</span> Settle Swiftly
          </p>
          <p className="disc">
            Settle Swiftly is not a law firm and does not provide legal advice. Advocates on the
            platform are independent practitioners who bill you directly. Prices shown are
            indicative.
          </p>
        </div>
      </div>
    </footer>
  );
}
