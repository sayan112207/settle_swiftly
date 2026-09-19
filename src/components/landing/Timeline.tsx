import { useEffect, useState } from "react";

const workingLabels = [
  "Invoice sent",
  "Reminder scheduled",
  "Email sent",
  "WhatsApp sent",
  "Payment link opened",
  "Payment received",
];

const TICK_MS = 1050;

/** Landing section walking through a chase, from invoice sent to paid. */
export function Timeline() {
  const [index, setIndex] = useState(-1);

  useEffect(() => {
    const timer = window.setInterval(
      () => setIndex((i) => (i >= workingLabels.length - 1 ? -1 : i + 1)),
      TICK_MS,
    );
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section aria-labelledby="working-heading" className="bg-slate px-8 py-[110px] text-white">
      <div className="mx-auto max-w-[920px] text-center">
        <h2
          id="working-heading"
          className="text-[40px] leading-[1.1] font-[650] tracking-[-0.02em]"
        >
          You send it.
          <br />
          <span className="text-ink-soft">Settle Swiftly takes it from here.</span>
        </h2>

        <div className="mx-auto mt-14 max-w-[460px] rounded-[20px] border border-slate-line bg-slate-raised p-10 text-left">
          <div className="flex items-center justify-between border-b border-slate-line pb-[18px]">
            <span className="text-sm font-semibold">Invoice #0042 · Northline Creative</span>
            <span className="text-sm font-[650]">₹48,000</span>
          </div>

          {workingLabels.map((label, i) => {
            const done = index >= i;
            return (
              <div
                key={label}
                className="flex items-center gap-3 py-3.5 transition-opacity duration-[400ms]"
                style={{ opacity: index === -1 ? 0.4 : 1 }}
              >
                <span
                  aria-hidden="true"
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] transition-all duration-300"
                  style={{
                    background: done ? "var(--brand)" : "var(--slate-line)",
                    color: done ? "var(--slate)" : "var(--on-slate-idle)",
                  }}
                >
                  ✓
                </span>
                <span
                  className="text-[15px] transition-colors duration-300"
                  style={{ color: done ? "var(--on-slate)" : "var(--on-slate-dim)" }}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
