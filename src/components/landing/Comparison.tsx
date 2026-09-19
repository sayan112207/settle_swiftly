import { useInView } from "@/hooks/use-in-view";

const withoutNodes = [0, 16.6, 33, 50, 66, 100];
const withNodes = [0, 33, 66, 100];

/** Landing section contrasting chasing by hand with letting Settle Swiftly chase. */
export function Comparison() {
  const { ref, inView } = useInView<HTMLElement>(0.35);

  return (
    <section
      ref={ref}
      aria-labelledby="problem-heading"
      className="mx-auto max-w-[1000px] px-8 py-[120px]"
    >
      <h2 id="problem-heading" className="text-[44px] leading-[1.1] font-[650] tracking-[-0.02em]">
        Getting paid shouldn't
        <br />
        <span className="text-ink-soft">require chasing.</span>
      </h2>

      <div className="mt-14">
        <div className="text-xs font-bold tracking-[0.08em] text-ink-faint">
          WITHOUT SETTLE SWIFTLY
        </div>
        <div className="relative mt-7 h-0.5 bg-line">
          <div
            className="absolute top-0 left-0 h-full bg-line-dim"
            style={{ width: inView ? "66%" : "0%", transition: "width 1.1s ease" }}
          />
          {withoutNodes.map((pct) => (
            <div
              key={pct}
              className="absolute -top-[5px] h-3 w-3 rounded-full border-2 border-line-dim bg-surface"
              style={{ left: `${pct}%` }}
            />
          ))}
        </div>
        <div className="mt-3.5 flex justify-between text-[13px] text-ink-faint">
          <span className="font-semibold text-ink-secondary">Invoice sent</span>
          <span>7 days</span>
          <span className="font-semibold text-ink-secondary">Reminder</span>
          <span>14 days</span>
          <span className="font-semibold text-ink-secondary">WhatsApp</span>
          <span>Still waiting</span>
        </div>
      </div>

      <div className="mt-9 rounded-[20px] border border-line bg-surface p-9">
        <div className="text-xs font-bold tracking-[0.08em] text-brand-deep">
          WITH SETTLE SWIFTLY
        </div>
        <div className="relative mt-7 h-[3px] rounded-full bg-line">
          <div
            className="absolute top-0 left-0 h-full rounded-full"
            style={{
              width: inView ? "100%" : "0%",
              background: "linear-gradient(90deg, var(--brand), var(--brand-deep))",
              transition: "width 1.4s cubic-bezier(.2,.7,.3,1)",
            }}
          />
          {withNodes.map((pct, i) => (
            <div
              key={pct}
              className="absolute -top-1.5 h-3.5 w-3.5 rounded-full"
              style={{
                left: `calc(${pct}% - 7px)`,
                background: inView ? "var(--brand)" : "var(--line)",
                transition: "background .3s ease, transform .3s ease",
                transitionDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
        <div className="mt-3.5 flex justify-between text-sm font-semibold text-ink">
          <span>Invoice sent</span>
          <span>Reminder</span>
          <span>WhatsApp</span>
          <span className="text-brand-deep">Paid ✓</span>
        </div>
        <p className="mt-5 text-[15px] text-ink-muted">
          Same invoice. No calendar reminders, no awkward messages, no spreadsheet.
        </p>
      </div>
    </section>
  );
}
