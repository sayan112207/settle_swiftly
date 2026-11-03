const omniDefs = [
  { icon: "✉", name: "Email", status: "Reminder sent ✓" },
  { icon: "💬", name: "WhatsApp", status: "Delivered ✓" },
  { icon: "📱", name: "SMS", status: "Sent ✓" },
];

/** Landing section showing the channels reminders go out on: email, WhatsApp and SMS. */
export function Channels() {
  return (
    <section
      id="product"
      aria-labelledby="omni-heading"
      className="mx-auto max-w-[1000px] px-8 py-25 text-center"
    >
      <h2 id="omni-heading" className="text-[40px] leading-[1.1] font-[650] tracking-[-0.02em]">
        One invoice.
        <br />
        <span className="text-ink-soft">Every channel.</span>
      </h2>

      <div className="relative mt-20 flex flex-col items-center">
        <div className="rounded-full border border-line bg-surface px-7 py-3.5 text-[15px] font-semibold shadow-[0_10px_30px_rgba(17,17,17,0.06)]">
          Settle Swiftly
        </div>

        <svg
          width="640"
          height="90"
          viewBox="0 0 640 90"
          aria-hidden="true"
          className="-mt-px max-w-full"
        >
          <path d="M320 0 L100 90" stroke="var(--brand-line)" strokeWidth="2" fill="none" />
          <path d="M320 0 L320 90" stroke="var(--brand-line)" strokeWidth="2" fill="none" />
          <path d="M320 0 L540 90" stroke="var(--brand-line)" strokeWidth="2" fill="none" />
        </svg>

        <div className="-mt-0.5 grid w-full grid-cols-3 gap-6 max-[900px]:grid-cols-2 max-[760px]:grid-cols-1">
          {omniDefs.map((channel, i) => (
            <div
              key={channel.name}
              className="flex flex-col items-start gap-2 rounded-2xl border border-line bg-surface p-5 text-left"
            >
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-surface-muted text-sm"
                  style={{ animation: `pulseGlow 2.4s ease-in-out infinite ${i * 0.4}s` }}
                >
                  {channel.icon}
                </span>
                <span className="text-[15px] font-semibold">{channel.name}</span>
              </div>
              <div className="text-[13px] font-semibold text-brand-deep">{channel.status}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
