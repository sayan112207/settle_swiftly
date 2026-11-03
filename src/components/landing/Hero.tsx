import { useEffect, useState, type MouseEvent } from "react";
import { Link } from "@tanstack/react-router";

const heroStates = [
  { badge: "Awaiting payment", badgeGreen: false, step: -1 },
  { badge: "Invoice sent", badgeGreen: false, step: 0 },
  { badge: "Reminder scheduled", badgeGreen: false, step: 1 },
  { badge: "Email sent", badgeGreen: false, step: 1 },
  { badge: "WhatsApp sent", badgeGreen: false, step: 2 },
  { badge: "Payment received", badgeGreen: true, step: 3 },
  { badge: "Paid ✓", badgeGreen: true, step: 3, paid: true },
];

const timelineLabels = ["Invoice sent", "Reminder", "WhatsApp", "Paid"];
const progressByStep = [6, 30, 60, 100];
const CYCLE_MS = 2100;

/** Landing hero: headline, the "Get started" call to action, and the animated invoice preview. */
export function Hero() {
  const [phase, setPhase] = useState(0);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const timer = window.setInterval(() => setPhase((p) => (p + 1) % heroStates.length), CYCLE_MS);
    return () => window.clearInterval(timer);
  }, []);

  const hero = heroStates[phase]!;
  const step = hero.step;
  const paid = hero.paid ?? false;
  const progressPct = progressByStep[Math.max(step, 0)] || 6;
  const remindersSent = Math.min(7, Math.max(1, step + 1));

  function onMove(e: MouseEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setTilt({
      x: ((e.clientX - r.left) / r.width - 0.5) * 2,
      y: ((e.clientY - r.top) / r.height - 0.5) * 2,
    });
  }

  const chip = (depth: number) => ({
    transform: `translate(${tilt.x * depth}px, ${tilt.y * depth}px)`,
    transition: "transform .18s ease-out",
  });

  return (
    <section
      aria-labelledby="hero-heading"
      onMouseMove={onMove}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      className="relative mx-auto max-w-[1280px] px-8 pt-[88px] pb-[60px]"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-35"
        style={{
          backgroundImage:
            "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 20%, black 40%, transparent 100%)",
        }}
      />

      <div className="relative mx-auto max-w-[760px] text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-subtle px-3.5 py-1.5 text-xs font-semibold tracking-[0.08em] text-brand-deep">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          AUTOMATED COLLECTIONS FOR MODERN BUSINESSES
        </div>

        <h1
          id="hero-heading"
          className="mt-6 text-[clamp(38px,8vw,68px)] leading-[1.04] font-[650] tracking-[-0.03em] text-ink"
        >
          Send the invoice.
          <br />
          <span className="text-ink-soft">We chase the payment.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-[560px] text-[19px] leading-[1.6] text-ink-muted">
          Settle Swiftly sends the invoice, follows up automatically, and stops the moment you get
          paid.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3.5">
          <Link
            to="/signup"
            className="rounded-xl bg-brand px-[26px] py-3.5 text-[15px] font-semibold text-white transition-transform duration-150 hover:scale-[1.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deep"
          >
            Get started
          </Link>
          <a
            href="#how"
            className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-[22px] py-3.5 text-[15px] font-semibold text-ink"
          >
            See how it works <span aria-hidden="true">↓</span>
          </a>
        </div>
      </div>

      <div className="relative mx-auto mt-16 max-w-[920px]">
        <div
          aria-hidden="true"
          className="absolute -top-[22px] left-6 z-[5] rounded-xl border border-line bg-surface px-4 py-3 shadow-[var(--shadow-chip)]"
          style={chip(8)}
        >
          <div className="text-xs text-ink-faint">This week</div>
          <div className="mt-0.5 text-[13px] font-semibold text-ink">
            {remindersSent} {remindersSent === 1 ? "reminder sent" : "reminders sent"}
          </div>
        </div>

        <div
          aria-hidden="true"
          className="absolute -bottom-[22px] right-6 z-[5] flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-[13px] font-semibold text-brand-deep shadow-[var(--shadow-chip)] transition-opacity duration-500"
          style={{ ...chip(-8), opacity: phase >= 5 ? 1 : 0 }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-brand" /> ₹48,000 received · UPI
        </div>

        <article
          aria-label="Live invoice demonstration"
          className="relative z-[1] grid grid-cols-[1.15fr_1fr] overflow-hidden rounded-[20px] border border-line bg-surface shadow-[var(--shadow-raised)] max-[760px]:grid-cols-1"
          style={{
            transform: `perspective(1400px) rotateY(${tilt.x * -2}deg) rotateX(${tilt.y * 2}deg) translateY(${tilt.y * -4}px)`,
          }}
        >
          <div className="border-r border-line p-9 max-[760px]:border-r-0 max-[760px]:border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-surface-muted text-[13px] font-bold text-ink-secondary">
                  NC
                </span>
                <div>
                  <div className="text-[15px] font-semibold text-ink">Northline Creative</div>
                  <div className="text-[13px] text-ink-faint">Invoice #0042</div>
                </div>
              </div>
              <span
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-500 ${
                  hero.badgeGreen
                    ? "bg-brand-subtle text-brand-deep"
                    : "bg-surface-muted text-ink-muted"
                }`}
              >
                {hero.badge}
              </span>
            </div>

            <div
              className={`mt-7 text-[48px] font-[650] tracking-[-0.02em] transition-colors duration-500 ${
                paid ? "text-brand-deep" : "text-ink"
              }`}
            >
              {paid ? "PAID" : "₹48,000"}
            </div>
            <div className="mt-1.5 text-sm text-ink-faint">Due 14 March · Design retainer</div>

            <div className="mt-[26px] h-1.5 overflow-hidden rounded-full bg-surface-subtle">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${progressPct}%`,
                  background: paid ? "var(--brand)" : "var(--line-dim)",
                  transition: "width .6s ease, background .5s ease",
                }}
              />
            </div>
          </div>

          <div className="bg-surface-alt p-9">
            <div className="mb-[18px] text-[11px] font-bold tracking-[0.08em] text-ink-faint">
              COLLECTION TIMELINE
            </div>
            {timelineLabels.map((label, i) => (
              <div
                key={label}
                className="flex items-center justify-between border-b border-line-subtle py-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 rounded-full transition-colors duration-[400ms]"
                    style={{ background: step >= i ? "var(--brand)" : "var(--line)" }}
                  />
                  <span
                    className="text-[13px] transition-colors duration-[400ms]"
                    style={{
                      color: step >= i ? "var(--ink)" : "var(--ink-faint)",
                      fontWeight: step >= i ? 600 : 400,
                    }}
                  >
                    {label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
