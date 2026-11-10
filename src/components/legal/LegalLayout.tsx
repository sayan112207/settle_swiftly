import { WaitlistProvider } from "@/components/home/EarlyAccess";
import { MotionContext } from "@/components/home/motion";
import { SiteFooter } from "@/components/home/SiteFooter";
import { SiteNav } from "@/components/home/SiteNav";

import { COMPANY } from "./company";
import type { LegalDoc } from "./types";

/** The banner shown at the top of every legal page. Set to "" to remove it everywhere. */
export const DRAFT_BANNER: string = "Draft – pending legal review.";

/** Motion off: legal pages are plain reading pages, so everything renders in its final state. */
const STILL = { engine: null, armed: false };

/**
 * The shared frame for Terms, Privacy and Refund: the marketing nav and footer,
 * the draft banner, a readable column with a contents list, and a "Last updated" line.
 */
export function LegalLayout({ doc }: { doc: LegalDoc }) {
  return (
    <MotionContext.Provider value={STILL}>
      <WaitlistProvider>
        <div className="ss" data-armed="false">
          <SiteNav current="legal" />
          <main id="top" className="lg">
            <article className="lgw">
              {DRAFT_BANNER && (
                <p className="lgbn" role="note">
                  {DRAFT_BANNER}
                </p>
              )}
              <h1 className="dsp lgh">{doc.title}</h1>
              <p className="lglead">{doc.summary}</p>
              <p className="lgup">Last updated: {COMPANY.effectiveDate}</p>
              <nav className="lgtoc" aria-label="On this page">
                <ol>
                  {doc.sections.map((s) => (
                    <li key={s.id}>
                      <a href={`#${s.id}`}>{s.heading}</a>
                    </li>
                  ))}
                </ol>
              </nav>
              {doc.sections.map((s) => (
                <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="lgs">
                  <h2 id={`${s.id}-h`}>{s.heading}</h2>
                  {s.paragraphs?.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                  {s.items && (
                    <ul>
                      {s.items.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                  )}
                  {s.after?.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                </section>
              ))}
            </article>
          </main>
          <SiteFooter />
        </div>
      </WaitlistProvider>
    </MotionContext.Provider>
  );
}
