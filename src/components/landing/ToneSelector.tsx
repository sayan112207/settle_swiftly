import { useEffect, useRef, useState } from "react";

const toneDefs = {
  gentle: {
    label: "Gentle",
    text: "Hi Priya — just a quick reminder that invoice #0042 is due.",
    day: 0,
  },
  standard: {
    label: "Standard",
    text: "Hi Priya, invoice #0042 is now overdue. You can pay here.",
    day: 14,
  },
  firm: {
    label: "Firm",
    text: "Invoice #0042 is 14 days overdue. Please arrange payment today.",
    day: 21,
  },
} as const;

type Tone = keyof typeof toneDefs;
const tones = Object.keys(toneDefs) as Tone[];

/** Interactive demo that previews a reminder in each tone. */
export function ToneSelector() {
  const [tone, setTone] = useState<Tone>("gentle");
  const [typing, setTyping] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function selectTone(next: Tone) {
    setTone(next);
    setTyping(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTyping(false), 650);
  }

  const active = toneDefs[tone];

  return (
    <section
      aria-labelledby="chase-heading"
      className="mx-auto grid max-w-[1160px] grid-cols-2 items-center gap-16 px-8 py-25 max-[760px]:grid-cols-1"
    >
      <div>
        <h2 id="chase-heading" className="text-[40px] leading-[1.1] font-[650] tracking-[-0.02em]">
          Friendly first.
          <br />
          <span className="text-ink-soft">Firmer when needed.</span>
        </h2>
        <p className="mt-[18px] max-w-[400px] text-base leading-[1.6] text-ink-muted">
          Choose the tone. Settle Swiftly writes and sends every follow-up.
        </p>

        <div
          role="tablist"
          aria-label="Reminder tone"
          className="mt-7 inline-flex rounded-full bg-surface-muted p-1"
        >
          {tones.map((key) => {
            const selected = tone === key;
            return (
              <button
                key={key}
                role="tab"
                type="button"
                aria-selected={selected}
                onClick={() => selectTone(key)}
                className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-[250ms] ${
                  selected ? "bg-ink text-white" : "bg-transparent text-ink-secondary"
                }`}
              >
                {toneDefs[key].label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-[20px] border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-3 border-b border-line-subtle px-[22px] py-[18px]">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-muted text-[13px] font-bold text-ink-secondary">
            P
          </span>
          <div>
            <div className="text-sm font-semibold">Priya · Northline Creative</div>
            <div className="text-xs text-ink-faint">WhatsApp Business</div>
          </div>
        </div>

        <div className="flex min-h-[220px] flex-col gap-3.5 p-6">
          <div className="max-w-[280px] rounded-xl bg-page px-4 py-3.5 text-[13px] text-ink-muted">
            Invoice #0042 · ₹48,000 · due 14 March
            <div className="mt-1.5 text-[11px] text-ink-ghost">Day 0 · 11:15</div>
          </div>

          {typing && (
            <div className="flex gap-1 self-end rounded-xl border border-line bg-surface px-4 py-3">
              {[0, 0.15, 0.3].map((delay) => (
                <span
                  key={delay}
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-ink-faint"
                  style={{ animation: `pulseGlow 1s infinite ${delay}s` }}
                />
              ))}
            </div>
          )}

          {!typing && (
            <div className="max-w-[320px] self-end" style={{ animation: "spinIn .3s ease" }}>
              <div
                className={`rounded-xl px-4 py-3.5 text-sm leading-[1.5] ${
                  tone === "firm"
                    ? "bg-ink text-white"
                    : tone === "standard"
                      ? "bg-brand-subtle text-ink"
                      : "bg-page text-ink"
                }`}
              >
                {active.text}
              </div>
              <div className="mt-1.5 text-right text-[11px] text-ink-ghost">
                Day {active.day} · 09:00 ✓✓
              </div>
            </div>
          )}

          <div className="self-end rounded-full border border-line px-3.5 py-1.5 text-xs text-ink-faint">
            Pay link attached · UPI, card, bank transfer
          </div>
        </div>
      </div>
    </section>
  );
}
