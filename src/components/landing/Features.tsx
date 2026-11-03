const autoInvoices = [
  { id: "#0042", amount: "₹48,000", opacity: 1 },
  { id: "#0043", amount: "₹48,000", opacity: 0.6 },
  { id: "#0044", amount: "₹48,000", opacity: 0.35 },
];

const memoryNotes = [
  "Usually pays after 2 reminders",
  "Prefers WhatsApp",
  "Never pays on a Friday",
];
const cashHeights = [30, 55, 40, 70, 50, 85, 65];

/** Landing feature grid. `countsStarted` grows the cash-flow chart bars from flat to their real heights. */
export function Features({ countsStarted = false }: { countsStarted?: boolean }) {
  return (
    <section aria-labelledby="auto-heading" className="mx-auto max-w-[1160px] px-8 pt-15 pb-25">
      <h2 id="auto-heading" className="text-[40px] leading-[1.1] font-[650] tracking-[-0.02em]">
        Quietly doing
        <br />
        <span className="text-ink-soft">the boring part.</span>
      </h2>

      <div className="mt-12 grid grid-cols-2 gap-6 max-[760px]:grid-cols-1">
        <div className="rounded-2xl border border-line bg-surface p-7">
          <h3 className="text-lg font-[650]">Automatic invoicing</h3>
          <p className="mt-1.5 text-sm text-ink-muted">
            Recurring invoices generate and send themselves.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            {autoInvoices.map((invoice) => (
              <div
                key={invoice.id}
                className="flex justify-between rounded-[10px] border border-line-subtle bg-surface-alt px-3.5 py-2.5 text-[13px] transition-opacity duration-[400ms]"
                style={{ opacity: invoice.opacity }}
              >
                <span>{invoice.id}</span>
                <span>{invoice.amount}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-7">
          <h3 className="text-lg font-[650]">Auto-reconciliation</h3>
          <p className="mt-1.5 text-sm text-ink-muted">
            Payments match themselves to the right invoice.
          </p>
          <div className="mt-7 flex items-center justify-between">
            <span className="rounded-[10px] border border-line bg-surface px-4 py-2.5 text-[13px] font-semibold">
              ₹48,000
            </span>
            <span
              aria-hidden="true"
              className="mx-3 h-px flex-1"
              style={{
                background: "linear-gradient(90deg, var(--line), var(--brand), var(--line))",
              }}
            />
            <span className="rounded-[10px] border border-line bg-surface px-4 py-2.5 text-[13px] font-semibold">
              #0042
            </span>
          </div>
          <div className="mt-4 text-center text-[13px] font-semibold text-brand-deep">
            ✓ Matched
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-7">
          <h3 className="text-lg font-[650]">Client memory</h3>
          <p className="mt-1.5 text-sm text-ink-muted">
            Settle Swiftly remembers how each client behaves.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            {memoryNotes.map((note) => (
              <div
                key={note}
                className="rounded-[10px] border border-line-subtle bg-surface-alt px-3.5 py-2.5 text-[13px]"
              >
                {note}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-7">
          <h3 className="text-lg font-[650]">Cash flow</h3>
          <p className="mt-1.5 text-sm text-ink-muted">See what lands, and when.</p>
          <div className="mt-6 flex h-20 items-end gap-2">
            {cashHeights.map((height, i) => (
              <div
                key={i}
                className="flex-1 rounded-t"
                style={{
                  height: `${countsStarted ? height : 8}%`,
                  background: i === 5 ? "var(--brand)" : "var(--line)",
                  transition: "height .8s ease",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
