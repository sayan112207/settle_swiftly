import { Link } from "@tanstack/react-router";

const FEATURED_PLAN = "Pro";

const pricingDefs = [
  {
    name: "Free",
    price: "₹0",
    desc: "For your first few invoices.",
    features: ["3 invoices / month", "Email reminders"],
  },
  {
    name: "Pro",
    price: "₹799",
    desc: "For freelancers and consultants.",
    features: ["Unlimited invoices", "Email, WhatsApp & SMS", "Client payment scores"],
  },
  {
    name: "Business",
    price: "₹1,999",
    desc: "For agencies and teams.",
    features: ["Everything in Pro", "5 team members", "Recurring invoices"],
  },
];

/** Pricing plans, each with a "Get started" link to sign-up. */
export function Pricing() {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="mx-auto max-w-[1160px] px-8 pt-15 pb-[110px]"
    >
      <h2 id="pricing-heading" className="text-[40px] leading-[1.1] font-[650] tracking-[-0.02em]">
        Simple pricing.
        <br />
        <span className="text-ink-soft">Less chasing.</span>
      </h2>

      <div className="mt-12 grid grid-cols-3 gap-6 max-[900px]:grid-cols-2 max-[760px]:grid-cols-1">
        {pricingDefs.map((plan) => (
          <div
            key={plan.name}
            className="relative rounded-[20px] border border-line bg-surface p-8"
          >
            {plan.name === FEATURED_PLAN && (
              <span className="absolute top-7 right-7 rounded-full bg-brand-subtle px-2.5 py-1 text-[11px] font-bold text-brand-deep">
                Most popular
              </span>
            )}

            <div className="text-[15px] font-semibold text-ink-muted">{plan.name}</div>

            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-[34px] font-[650] text-ink">{plan.price}</span>
              <span className="text-sm text-ink-muted">/ month</span>
            </div>

            <p className="mt-2.5 text-sm text-ink-muted">{plan.desc}</p>

            <ul className="mt-5 flex list-none flex-col gap-2.5">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2 text-sm text-ink">
                  <span className="text-brand">•</span>
                  {feature}
                </li>
              ))}
            </ul>

            <Link
              to="/signup"
              className="mt-6 block w-full rounded-[10px] border border-line bg-surface p-[13px] text-center text-sm font-semibold text-ink"
            >
              Get started
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
