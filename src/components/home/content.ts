/**
 * Copy and links for the Home v6 marketing site, in one place.
 *
 * Mirrors the Settle Loader Prototype (Claude Design). The prototype links to
 * pages that are not built in the app yet (Features, Feature, Integrations,
 * Pricing, About, Security, Contact, Privacy, Terms). Until they are, links to
 * them land on the home section that covers the same ground, and the rest point
 * at their planned routes. Swap each entry here as its page ships.
 */

export const LINKS = {
  home: "/",
  how: "/#how",
  features: "/#features",
  /** One feature's page; the home features stage until feature pages exist. */
  feature: (_slug: string) => "/#features",
  integrations: "/#questions",
  pricing: "/#pricing",
  earlyAccess: "/#access",
  signIn: "/login",
  terms: "/terms",
  privacy: "/privacy",
  refund: "/refund",
  /** "Talk to the founders": a booking link once there is one, else the early-access form. */
  book: "/#access",
} as const;

/** Flip on when feature pages ship: the stage then shows "Read more" per feature. */
export const FEATURE_PAGES_LIVE = false;

/** Whether `LINKS.book` leaves the site (and so opens in a new tab). */
export const BOOK_IS_EXTERNAL = /^https?:\/\//.test(LINKS.book);

export type FeatureSlug =
  | "books-sync"
  | "priority-queue"
  | "chasing"
  | "contact-ladder"
  | "payment-matching"
  | "interest"
  | "discounts"
  | "payment-plans"
  | "credit-debit-notes"
  | "credit-limits"
  | "payer-grades"
  | "monday-digest"
  | "legal-escalation"
  | "matter-record";

/** The features menu in the nav: four groups, each with a one-line pitch. */
export const NAV_FEATURE_GROUPS: {
  label: string;
  items: { slug: FeatureSlug; name: string; short: string }[];
}[] = [
  {
    label: "Collect",
    items: [
      {
        slug: "books-sync",
        name: "Tally and Zoho Books sync",
        short: "Invoices in, receipts back.",
      },
      { slug: "priority-queue", name: "Priority queue", short: "Oldest and largest first." },
      {
        slug: "chasing",
        name: "Chasing on every channel",
        short: "Email, WhatsApp and SMS, in your tone.",
      },
      { slug: "contact-ladder", name: "Contact ladder", short: "Finance head, then the director." },
      {
        slug: "payment-matching",
        name: "Payment matching",
        short: "Bank alerts matched, TDS included.",
      },
    ],
  },
  {
    label: "Leverage",
    items: [
      { slug: "interest", name: "Late payment interest", short: "Off until you switch it on." },
      {
        slug: "discounts",
        name: "Early payment discounts",
        short: "What a discount really costs.",
      },
      {
        slug: "payment-plans",
        name: "Payment plans and settlements",
        short: "Split it, or settle it for less.",
      },
      {
        slug: "credit-debit-notes",
        name: "Credit and debit notes",
        short: "Every change, back to your books.",
      },
      {
        slug: "credit-limits",
        name: "Credit limits and holds",
        short: "Hold orders over the limit.",
      },
    ],
  },
  {
    label: "See",
    items: [
      { slug: "payer-grades", name: "Payer grades", short: "A to D, from how they pay." },
      { slug: "monday-digest", name: "Monday digest", short: "One email a week." },
    ],
  },
  {
    label: "Escalate · India",
    items: [
      {
        slug: "legal-escalation",
        name: "Legal escalation",
        short: "Statutory notices, then an advocate.",
      },
      { slug: "matter-record", name: "Matter record", short: "Every document in one place." },
    ],
  },
];

/** The thirteen features on the home stage, in tab order. */
export const STAGE_FEATURES: { slug: FeatureSlug; name: string; desc: string }[] = [
  {
    slug: "books-sync",
    name: "Tally and Zoho Books sync",
    desc: "Invoices and payments flow in. Approved receipts and notes flow back.",
  },
  {
    slug: "priority-queue",
    name: "Priority queue",
    desc: "Every invoice scored by how late it is and what it’s worth.",
  },
  {
    slug: "chasing",
    name: "Chasing on every channel",
    desc: "Email, WhatsApp and SMS, in your tone.",
  },
  {
    slug: "contact-ladder",
    name: "Contact ladder",
    desc: "No reply? It goes to the finance head, then the director.",
  },
  {
    slug: "payment-matching",
    name: "Payment matching · India",
    desc: "From bank alerts and your books, with TDS and part-payments.",
  },
  {
    slug: "payer-grades",
    name: "Payer grades",
    desc: "A to D, from how each customer actually pays.",
  },
  {
    slug: "interest",
    name: "Late payment interest",
    desc: "Off by default. On per customer, waived to get paid now.",
  },
  {
    slug: "discounts",
    name: "Early payment discounts",
    desc: "See what a discount costs before you offer it.",
  },
  {
    slug: "payment-plans",
    name: "Payment plans and settlements",
    desc: "Split a large invoice, or close an old one for less.",
  },
  {
    slug: "credit-debit-notes",
    name: "Credit and debit notes",
    desc: "Every change to what’s owed leaves as a note for your books.",
  },
  {
    slug: "credit-limits",
    name: "Credit limits and holds",
    desc: "Know a customer is over their limit before you ship again.",
  },
  {
    slug: "legal-escalation",
    name: "Legal escalation · India",
    desc: "Free statutory notices first, then an independent advocate.",
  },
  {
    slug: "monday-digest",
    name: "Monday digest",
    desc: "One email a week: what came in, what’s promised, what needs you.",
  },
];

export type Money = { inr: number; usd: number };

export type Plan = {
  key: string;
  name: string;
  for: string;
  monthly?: Money;
  annual?: Money;
  save?: Money;
  invoices: string;
  users: string;
  lead: string;
  items: string[];
  cta: string;
  href: string;
  primary?: boolean;
  highlight?: boolean;
};

/** Indicative prices while the product is built; final pricing is set at launch. */
export const PLANS: Plan[] = [
  {
    key: "starter",
    name: "Starter",
    for: "Small teams getting off spreadsheets",
    monthly: { inr: 2499, usd: 29 },
    annual: { inr: 24990, usd: 290 },
    save: { inr: 4998, usd: 58 },
    invoices: "Up to 100",
    users: "1",
    lead: "",
    items: [
      "Tally or Zoho Books sync",
      "Priority queue",
      "Email and WhatsApp reminders",
      "You approve every message",
      "Monday digest",
    ],
    cta: "Join the waitlist",
    href: LINKS.earlyAccess,
  },
  {
    key: "growth",
    name: "Growth",
    for: "Finance teams chasing every week",
    monthly: { inr: 7999, usd: 99 },
    annual: { inr: 79990, usd: 990 },
    save: { inr: 15998, usd: 198 },
    invoices: "Up to 1,000",
    users: "5",
    lead: "Everything in Starter, plus",
    items: ["SMS", "Contact ladder", "Payment matching from bank alerts, with TDS", "Payer grades"],
    cta: "Join the waitlist",
    href: LINKS.earlyAccess,
    primary: true,
    highlight: true,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    for: "Businesses with volume, terms and legal exposure",
    invoices: "Unlimited",
    users: "Unlimited, with approval roles",
    lead: "Everything in Growth, plus",
    items: [
      "Late payment interest and early payment discounts",
      "Payment plans and settlements",
      "Credit and debit notes back to your books",
      "Credit limits and holds",
      "Legal escalation, India: ₹999 per matter; advocates bill you directly",
      "Dedicated onboarding",
    ],
    cta: "Talk to us",
    href: LINKS.book,
  },
];

/** Home page questions; also emitted as FAQPage structured data. */
export const FAQS: { q: string; a: string }[] = [
  {
    q: "When can I use it?",
    a: "It’s being built now. Enterprise teams get access first. Leave your email and we’ll write when your place opens.",
  },
  {
    q: "Do I have to leave Tally or Zoho Books?",
    a: "No. It’s built to connect to them. Your books stay where they are.",
  },
  {
    q: "Will my clients feel chased?",
    a: "You set the tone for each one, and nothing goes out until you approve it.",
  },
  {
    q: "Is late payment interest on by default?",
    a: "No. It’s off until you switch it on, customer by customer.",
  },
  {
    q: "Do you send legal notices?",
    a: "No. Independent advocates do, on their own letterhead, when you ask.",
  },
];
