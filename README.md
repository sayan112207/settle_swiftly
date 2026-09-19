# Collect Smart

Lovable Prompt — Settle Swiftly Landing Page

Paste everything below the line into Lovable as a single prompt. Swap Settle Swiftly for your final name with find-and-replace.

Build a marketing landing page for Settle Swiftly, a lightweight invoicing tool that automatically chases unpaid invoices so small businesses get paid faster.

Positioning

The core insight: small businesses don't have an invoicing problem, they have a getting-paid problem. Creating an invoice takes two minutes. Chasing it for six weeks is the actual pain. Every competitor (Zoho Invoice, Wave, FreshBooks, spreadsheets) treats invoicing as a document-creation task. Settle Swiftly treats it as a collections task.

The entire page must sell the chase engine, not the invoice builder. The invoice builder is table stakes and should be presented as such.

Audience

Solo founders, freelancers, agencies, and business owners with 1–20 employees and no finance staff. They are not accountants and don't want to become one. Two markets served from day one: India (GST, Razorpay, INR) and US/global (Stripe, PayPal, USD). The page must feel native to both — not an Indian product with a global afterthought, or vice versa.

Tone

Direct, confident, slightly irreverent. Short sentences. No corporate SaaS filler, no "empower," no "seamless," no "revolutionize." Write like a founder talking to another founder who's tired of sending "just following up on this!" emails. Occasional dry humor is welcome. Never cutesy.

Visual direction

Clean and minimal with real editorial confidence — think Linear, Ramp, Mercury. Specifics:

Off-white or very light warm-grey background (#FAFAF8-ish), near-black text. One single bold accent color used sparingly — a deep saffron/amber (#E8890C-ish) works with the Indian root of the name without being a flag reference. Avoid tricolour styling entirely.

Typography: a clean geometric or grotesque sans (Inter, Geist, or similar). Large, tight-tracked headlines. Generous line-height on body copy.

Generous whitespace. Wide max-width container (~1200px), lots of vertical padding between sections.

No gradient mesh backgrounds, no glassmorphism, no floating 3D blobs. Flat surfaces, hairline borders, one soft shadow layer maximum.

Subtle scroll-triggered fade-and-rise animations. Nothing bouncy.

Fully responsive, mobile-first. On mobile, the hero must be legible without zooming and the CTA must be reachable with a thumb.

Page structure

1. Navigation

Sticky, transparent-to-solid on scroll. Left: wordmark "Settle Swiftly". Right: How it works, Product, Pricing, FAQ, then a "Sign in" link to /login and a primary button "Get started" linking to /signup.

2. Hero

Eyebrow: Invoicing + collections for people who hate both

Headline: Stop chasing. Start collecting.

Subhead: Settle Swiftly sends the invoice, then follows up on it — over email, WhatsApp, and SMS — until the money lands. You do nothing.

Primary CTA: button "Get started" linking to /signup, beside a secondary "See how it works" link.

Micro-copy under the buttons: Free during beta. India and global. No card required.

Right side (or below on mobile): a product visual — a clean invoice card labelled "Invoice #0042 · ₹48,000 · 12 days overdue" with a vertical timeline beside it showing automated touchpoints: Day 1 Invoice sent → Day 7 Gentle reminder → Day 14 WhatsApp nudge → Day 21 Firm follow-up → PAID in the accent color. Build this in HTML/CSS, not an image.

3. Problem strip

Three stat cards on a subtle contrast band:

Small businesses spend 14+ hours a month chasing payments.

A typical invoice is paid 21 days late.

Most owners give up after the second reminder. Mark these as placeholders in a code comment so they can be swapped for cited figures later.

4. How it works — three steps

Send it. Create an invoice in under a minute. Templates, your logo, GST or sales tax handled automatically.

Forget it. Settle Swiftly takes over. Reminders go out on a schedule you set, in a tone you choose, across email, WhatsApp, and SMS.

Get paid. Client clicks, pays through Razorpay or Stripe, and the invoice reconciles itself. You get a notification, not a spreadsheet.

5. The chase engine — the hero feature section

Full-width section, visually the most prominent block on the page after the hero. Headline: Politeness that escalates. Body: Set the cadence once. Settle Swiftly starts friendly and gets firmer on a schedule you control — and stops the instant the invoice is paid. No awkward emails from you. No relationship damage. Include an interactive-looking (can be static) tone selector showing three modes: Gentle, Standard, Firm — each displaying a sample message preview. Clicking a mode swaps the preview text. Write real sample copy for all three.

6. Feature grid

Six cards, icon + title + one line each:

Invoices in a minute — Templates, logo, line items, done.

Auto-reconciliation — Payments match themselves to invoices.

Client memory — Every invoice, payment, and reminder per client in one view.

Cash flow at a glance — What's in, what's out, what's overdue.

Tax that behaves — GST for India, sales tax for the US. Correct by default.

Pay-now links — Razorpay, Stripe, PayPal. Client pays in two clicks.

7. Two markets, one product

Split section. Left column headed India: GST-compliant invoices, Razorpay and UPI, WhatsApp reminders, INR. Right column headed Global: Stripe and PayPal, sales tax and VAT handling, email and SMS reminders, multi-currency. Small payment-provider logo row beneath.

8. Comparison table

Columns: Settle Swiftly · Zoho Invoice · Wave · Spreadsheets. Rows: Automated escalating reminders, WhatsApp follow-ups, Auto-reconciliation, Setup time, Accountant required, Price. Settle Swiftly column highlighted in the accent color. Keep it honest — don't mark competitors down on things they genuinely do well.

9. Social proof

Three testimonial cards with name, role, and company. Clearly mark these as placeholder content in a code comment so they're easy to find and replace with real quotes post-launch.

10. Pricing

Three tiers with a working INR / USD toggle at the top that switches all displayed prices.

Free — ₹0 / $0. Up to 5 invoices a month, email reminders, one payment gateway.

Pro — ₹799 / $19 a month. Unlimited invoices, WhatsApp + SMS chasing, auto-reconciliation, all gateways. Marked "Most popular."

Business — ₹1,999 / $49 a month. Multi-user, multi-currency, custom reminder rules, priority support. All tiers: "Free during beta" badge.

11. FAQ

Accordion, six questions:

Do I need to know accounting to use this?

Will the reminders annoy my clients?

Does it handle GST?

Which payment gateways are supported?

Can I import invoices from Zoho or Excel?

What happens to my data if I leave? Write substantive two-to-three sentence answers for each — these need to be genuinely readable, not filler.

12. Final CTA

Full-width band in the accent color. Headline: Your money is sitting in someone else's account. Subhead: Let's go get it. Primary button "Create your account" linking to /signup, and a secondary "Sign in" linking to /login.

13. Footer

Wordmark, one-line description, link columns (Product / Company / Legal), and placeholder links for Privacy Policy, Terms, and Security. Copyright line.

Technical requirements

React with Tailwind CSS. Component-per-section, clean file structure.

Sign-up: every CTA routes to /signup (sign-in to /login). There is no waitlist or email-capture form; users create an account directly.

Currency toggle must actually work and drive the pricing display.

FAQ accordion and the tone selector in section 5 must be functional.

Fully responsive across mobile, tablet, and desktop. Test the hero at 375px width.

Accessible: semantic HTML5 landmarks, proper heading hierarchy (one h1), alt text, keyboard-navigable accordion and toggle, visible focus states, AA contrast minimum.

SEO and AI-search requirements

This matters as much as the design — the page needs to be citable by AI search engines, not just crawlable by Google.

Semantic HTML throughout: <header>, <nav>, <main>, <section>, <article>, <footer>. No div soup.

Title tag: Settle Swiftly — Invoicing that chases your unpaid invoices for you

Meta description under 155 characters, written to be quoted.

Open Graph and Twitter card tags with placeholder image paths.

JSON-LD structured data for Organization, SoftwareApplication (include offers with both currencies), and FAQPage mapped to the real FAQ content.

Every factual claim on the page should be stated as a self-contained sentence that reads correctly when extracted out of context — no "as mentioned above," no pronouns pointing at earlier sections.

Include a robots.txt and sitemap.xml.

Lazy-load below-the-fold imagery, preload the primary font, keep the initial bundle lean.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/047e873b-3c1b-400c-87c4-ce54dc278cf5).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Changes sync back into Lovable from whichever branch the project is connected to — point that at `develop` (Lovable project → GitHub settings) so editor changes land where the rest of the work is integrated. An editor change arrives as a push, so it runs the four push gates; `docstrings` runs on pull requests only.

## Development

Prefer working locally? You need [Bun](https://bun.sh). This repo installs, runs
and tests with Bun — `bun.lock` is the committed lockfile, so npm and yarn will
produce a tree CI does not check.

```sh
git clone https://github.com/sayan112207/settle_swiftly.git
cd settle_swiftly
bun install
cp .env.example .env   # fill in from your Supabase project dashboard
bun run dev
```

### Gates

```sh
bun run typecheck   # tsc --noEmit — type errors only
bun run lint        # eslint, incl. no-explicit-any as an error — see docs/project-conventions.md
bun test            # fixture invariants, e.g. aging buckets summing to total_outstanding
bun run build       # the only gate that exercises SSR bundling
bun run docstrings  # docstring coverage on the functions this change touches
```

CI does not run all five on every event. A **push** to `develop` or `main` runs
the first four. A **pull request** runs those four and `docstrings`, which needs
a base branch to diff against and so has nothing to measure on a bare push.

Run all five before opening a PR.

### Docstrings

`bun run docstrings` requires 80% docstring coverage across the functions a
change touches — not across the tree, which sits near 29% and would fail on
~168 pre-existing functions. Touching a function is when its documentation is
cheapest to write, and it is the only moment this gate asks for one.

It mirrors CodeRabbit's "Docstring Coverage" pre-merge check, so the number is
settled in a command you can run and debug rather than arriving as a review
comment after the PR is already open. `.coderabbit.yaml` pins the bot to the
same 80% as a non-blocking second opinion — two parsers occasionally disagree
on what counts as a function, and CI is the copy that decides.

A docstring is a `/** … */` block immediately above the declaration. A `//`
comment is a note to the next reader and does not count.

## Branching and releases

Two long-lived branches:

| Branch    | What it is                                                                 | What writes to it               |
| --------- | -------------------------------------------------------------------------- | ------------------------------- |
| `develop` | Default branch. Integration — every change lands and is tested here first. | Feature and fix PRs             |
| `main`    | Release branch. What has been tested together and shipped.                 | Nothing but a PR from `develop` |

GitHub has no native rule for a pull request's _source_ — branch protection
governs who may push and what must pass, not where a change came from — so the
`source branch` CI job fails any pull request into `main` that did not come from
`develop`.

**The job only blocks a merge once it is a required check.** A workflow reports;
branch protection is what enforces. On `main` that means, under Settings →
Branches:

- Require a pull request before merging, so nothing is pushed to `main` directly.
- Require the `source branch` and `typecheck · lint · test · build` checks to pass.
- Leave "require linear history" off — the release PR merges as a merge commit.
- Leave "require branches to be up to date" off, or every release will first
  demand a back-merge of `main` into `develop`.

A fork or a fresh clone has none of this until someone sets it. It is configured
on this repository.

### Day to day

Branch from `develop`, never from `main`:

```sh
git checkout develop && git pull
git checkout -b fix/some-thing

# work, then before opening the PR:
bun run typecheck && bun run lint && bun test && bun run build && bun run docstrings

git push -u origin fix/some-thing
gh pr create --base develop
```

`develop` is the default branch, so `gh pr create` and the GitHub UI target it
already. Feature PRs may be squash-merged — that rewrites nothing on `develop`,
it only appends.

### Shipping to main

When a batch on `develop` is ready:

```sh
gh pr create --base main --head develop --title "release: <what is in it>"
```

**Merge that PR with a merge commit — never squash, never rebase.** Squashing
rewrites the batch into a single new commit on `main`, so `main` and `develop`
stop sharing ancestry and every later release PR shows conflicts against changes
that are already in both branches. A merge commit keeps the two histories joined,
and it is also what keeps Lovable's project history intact.

### Rules that are not optional

- **Never rewrite published history.** No force-push, no rebase of anything
  already pushed. Lovable replays this repo's history into the editor and the
  project's history is lost when it is rewritten — see `AGENTS.md`.
- **Keep `develop` working.** Lovable syncs from the connected branch and opens
  the editor on whatever is there. A broken commit is a broken editor.
- **One branch per change.** `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- **Open a PR, do not merge locally.** `git merge` into `develop` from your
  machine skips the review, and skips `docstrings` with it. CI still runs — the
  workflow triggers on pushes to `develop` — but it reports after the fact,
  on a branch everyone has already pulled, rather than before the merge.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs typecheck, lint,
test and build on every PR into `develop` or `main`, and on every push to those
two branches. The push trigger is what lets a `develop` → `main` PR show a
status earned by the merge commit itself, rather than inferring it from the PRs
that fed into it.

Make the `verify` job a required status check on both branches (Settings →
Branches → Add rule) so a red run blocks the merge instead of merely reporting
it. Protection is free on public repositories.
