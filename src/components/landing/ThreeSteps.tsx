import { useState } from "react";

const stepDefs = [
  { num: "01", title: "Send", desc: "Create your invoice." },
  { num: "02", title: "Chase", desc: "Settle Swiftly follows up automatically." },
  { num: "03", title: "Get paid", desc: "Everything stops the moment you get paid." },
];

const invoiceFields = [
  { label: "Client", value: "Northline Creative" },
  { label: "Amount", value: "₹48,000" },
  { label: "Due date", value: "14 March" },
];

const reminders = [
  { label: "Email reminder", day: "Day 7" },
  { label: "WhatsApp reminder", day: "Day 14" },
  { label: "SMS reminder", day: "Day 21" },
];

export function ThreeSteps() {
  const [active, setActive] = useState(0);

  return (
    <section id="how" aria-labelledby="steps-heading" className="mx-auto max-w-[1160px] px-8 py-25">
      <h2 id="steps-heading" className="text-[44px] leading-[1.1] font-[650] tracking-[-0.02em]">
        Three steps.
        <br />
        <span className="text-ink-soft">Then you're done.</span>
      </h2>

      <div className="mt-14 grid grid-cols-[280px_1fr] items-start gap-12 max-[760px]:grid-cols-1">
        <div className="flex flex-col gap-2.5">
          {stepDefs.map((step, i) => {
            const isActive = active === i;
            return (
              <button
                key={step.num}
                type="button"
                onClick={() => setActive(i)}
                className={`rounded-[14px] border px-5 py-[18px] text-left transition-all duration-[250ms] ${
                  isActive
                    ? "border-line bg-surface shadow-[0_8px_24px_rgba(17,17,17,0.06)]"
                    : "border-transparent bg-transparent shadow-none"
                }`}
              >
                <div
                  className={`text-xs font-bold tracking-[0.05em] ${isActive ? "text-brand" : "text-ink-ghost"}`}
                >
                  {step.num}
                </div>
                <div
                  className={`mt-1 text-[19px] font-[650] ${isActive ? "text-ink" : "text-ink-muted"}`}
                >
                  {step.title}
                </div>
                <div className={`mt-1 text-sm ${isActive ? "text-ink-muted" : "text-ink-ghost"}`}>
                  {step.desc}
                </div>
              </button>
            );
          })}
        </div>

        <div className="min-h-[320px] rounded-[20px] border border-line bg-surface p-10 shadow-[var(--shadow-card)]">
          {active === 0 && (
            <div className="max-w-[420px]">
              {invoiceFields.map((field) => (
                <div
                  key={field.label}
                  className="flex justify-between border-b border-line-subtle py-3.5 text-sm"
                >
                  <span className="text-ink-faint">{field.label}</span>
                  <span className="font-semibold">{field.value}</span>
                </div>
              ))}
              <button
                type="button"
                className="mt-5 w-full rounded-[10px] bg-ink p-3.5 text-[15px] font-semibold text-white"
              >
                Send invoice
              </button>
            </div>
          )}

          {active === 1 && (
            <div className="flex max-w-[420px] flex-col gap-3">
              {reminders.map((reminder) => (
                <div
                  key={reminder.label}
                  className="flex items-center justify-between rounded-xl border border-line-subtle bg-surface-alt px-4 py-3.5"
                >
                  <span className="text-sm font-semibold">
                    <span className="text-brand">●</span>&nbsp; {reminder.label}
                  </span>
                  <span className="text-[13px] text-ink-faint">{reminder.day}</span>
                </div>
              ))}
              <p className="mt-1 text-[13px] text-ink-faint">Tone and cadence are yours to set.</p>
            </div>
          )}

          {active === 2 && (
            <div className="max-w-[420px] rounded-[14px] border border-brand-line bg-brand-tint p-6">
              <div className="text-[11px] font-bold tracking-[0.08em] text-ink-faint">
                INVOICE #0042
              </div>
              <div className="mt-2.5 text-4xl font-[650] text-brand-deep">₹48,000</div>
              <div className="mt-3.5 flex items-center gap-2 text-sm font-semibold text-ink">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-xs text-white">
                  ✓
                </span>
                Paid · Reminders stopped
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
