# Project conventions

Consolidated from `.cursor/rules/*.mdc`, which is no longer tracked in git.
These are the project's actual specifications — the domain rules in particular
are what the database schema enforces — so they live here rather than in an
editor-specific directory.

---

## Settle Swiftly

A B2B collections tool. Small businesses import their unpaid invoices and the
product chases the customers who owe them money. It sits on top of Tally and
Zoho rather than replacing them.

Users are small agencies and freelancers, 1-20 people, no finance staff. They
use this for ten minutes on a Monday morning. Speed and keyboard efficiency
matter more than discoverability.

---

## Stack

TanStack Start 1.168 on Vite 8 (file-based routing in `src/routes/`, mutations
via `createServerFn`), React 19, TypeScript strict, Tailwind v4 (CSS-first — the
theme lives in `@theme inline` in `src/styles.css`, there is no
`tailwind.config.js`), shadcn/ui (new-york), TanStack Query, TanStack Table,
Lucide icons, Zod 3.

Postgres via Supabase, accessed with `@supabase/supabase-js` and
`@supabase/ssr`. No ORM: the schema lives in SQL migrations under
`supabase/migrations/`, and types are generated into
`src/lib/supabase/types.gen.ts` by `bun run db:types`.

Build: Nitro, Cloudflare target. Package manager: bun (`bun.lock` is
authoritative).

**This is NOT a Next.js project** — no `src/pages/`, no `app/layout.tsx`, no
Server Actions, no `server-only` package. See `src/routes/README.md`.

---

## Domain rules

_Business rules that must not be violated. Each is enforced in the database —
see the migration noted alongside._

- Invoice numbers normalize by trim, collapse whitespace, uppercase, strip edge
  punctuation. **DO NOT strip leading zeros** — `INV-0042` and `INV-42` may be
  different documents.
  → `app.normalize_invoice_number()`, foundation migration
- Account names normalize by stripping Pvt Ltd, Private Limited, LLP, Inc,
  &/and, punctuation, then case-folding.
  → `app.normalize_account_name()`, foundation migration
- Unique constraint: `(orgId, accountId, invoiceNumberNormalized)`.
  → `invoices_org_account_number_uniq`
- An account needs exactly one P0 contact before it can be chased. P1 and P2
  are optional.
  → at-most-one via the `contacts_one_active_p0_per_account` partial unique
  index; at-least-one is gated in `public.schedule_reminder()`
- Escalation is cumulative, not a handoff — P0 stays in the thread when P1
  joins.
  → `reminder_recipients` fan-out in `schedule_reminder()`
- Outstanding and overdue are always shown as separate numbers. Never merge.
  → separate columns in `public.v_account_balances`, grouped per currency
- Aging never resets on partial payment.
  → `days_overdue` in `v_invoice_aging` derives from `due_date` alone

---

## Engineering rules

- Every mutation goes through a typed `createServerFn` service function in
  `src/lib/services/`, never inline in a component, and never a raw Supabase
  call from the browser.
- Tenancy is enforced by RLS in Postgres, not by application-level `where
org_id` filters. Never use the service-role key to satisfy a user-facing read.
- Invariants spanning two tables belong in a `public.*` RPC, not two chained
  supabase-js calls: PostgREST gives each call its own transaction.
- No `any`. No TypeScript errors.
- Amounts are `numeric(15,2)`, never float.
- Dates are `date`, never timestamp. Due dates have no time component and
  timezone conversion silently shifts them by a day.
- Every mutation writes an auditLog row — enforced by the `app.tg_audit()`
  database trigger, not by hand in service code.
- Never assume single user, single entity, or single currency.

---

## Design system

Light, minimal, editorial. Reference points: Linear, Ramp, Mercury. A financial
tool — precise and quiet, never playful.

### Tokens

CSS variables in `src/styles.css`, mapped via `@theme inline`.

```
Surfaces  --page #F7F7F3   --surface #FFFFFF   --surface-alt #FCFCFA
          --surface-muted #F1F1EC   --surface-subtle #EFEFE9
Borders   --line #E6E6E0   --line-subtle #EFEFE9   --line-dim #C9C9C0
Text      --ink #111111    --ink-secondary #3A3A36  --ink-muted #686863
          --ink-soft #8B8B83   --ink-faint #9A9A92   --ink-ghost #B3B3AA
Brand     --brand #18A873  --brand-deep #087A52
          --brand-subtle #E8F6EF  --brand-line #DCEEE5  --brand-tint #F7FBF9
Semantic  --danger #B4433A  --danger-subtle #FBEAEA  --warn #B08900
Dark band --slate #111111  --slate-raised #1A1A1A  --slate-line #2C2C2C
          --on-slate #FFFFFF  --on-slate-muted #A0A09A
```

**NEVER use raw hex in components.** Use the Tailwind utilities generated from
these tokens (`bg-surface`, `text-ink-muted`, `border-line`, `bg-brand`).

### Rules

- One accent only — the green. Overdue and destructive states use `--danger`,
  never the brand green. Brand is for actions and success.
- The second half of every headline is `--ink-soft`, set on its own line.
- System font stack via `--font-sans`. Weights 400, 600, 650 only.
- Section heading 40/650/-0.02em. Hero clamp(38px, 8vw, 68px)/650/-0.03em.
  Body 14-16/400. Label 11-12/700/uppercase/0.08em/`--ink-faint`. Metric 32/650.
- Currency: `Intl.NumberFormat('en-IN')` for INR — lakh grouping (₹4,82,000),
  not thousands. Never abbreviate in tables.
- Cards: 16-20px radius, 1px `--line` border, one soft shadow
  (`--shadow-card` / `--shadow-raised`). Pills and tabs are fully rounded.
- Content max-width 1000-1280px depending on section, 32px horizontal padding.
- Motion: 150ms on hover/scale, 250-300ms on state swaps, 600ms-1.4s on
  scroll-triggered fills. Honour `prefers-reduced-motion`.
- Breakpoints are max-width arbitrary variants matching the approved design:
  `max-[760px]` (stack grids, hide nav links), `max-[900px]` (3-col to 2-col),
  `max-[820px]` (hide cursor glow), `max-[520px]` / `max-[420px]` (tight grids).

### Never use

Gradient mesh backgrounds. Glassmorphism beyond the nav's blur. Colored glows
other than the cursor halo. Emoji as UI icons outside the channel cards. More
than one accent color. Decorative dividers. Animated borders. Anything that
exists purely to fill space.

> Test: if a screen could be a page in a well-designed annual report, it's
> right. If it looks like a SaaS template, strip it back.

---

## UI patterns

- All tables use TanStack Table.
- Every list: priority order is the default sort. Show active filters as
  removable chips, and always display the filtered count and summed amount
  (e.g. "47 invoices · ₹18,40,000").
- Bulk action buttons state the count: "Snooze 47 invoices", never "Snooze all".
- No dead clicks. Every button either works, opens an explanatory popover, or is
  disabled with a tooltip.
- Full keyboard navigation with visible focus rings everywhere.
- Empty states are written properly, never a blank panel.
