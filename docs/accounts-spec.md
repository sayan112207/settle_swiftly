# Accounts Section — Build Spec

Covers the Accounts list and Account Detail with its five tabs. Every figure here is authoritative and reconciles across all screens including the Dashboard.

---

## 0. Fixture correction — do this first

The Dashboard's book totals contradict its own invoice amounts. Per-invoice figures appear on six screens; book totals appear on three. So the totals move, not the invoices.

**Replace these values in `src/lib/services/dashboard.mocks.ts`:**

| Field               | Was              | Now                   |
| ------------------- | ---------------- | --------------------- |
| `total_outstanding` | 18,40,000        | **50,00,000**         |
| `overdue`           | 9,20,000         | **28,00,000**         |
| `overdue_share_pct` | 50.0             | **56.0**              |
| Not yet due         | 9,20,000 (50.0%) | **22,00,000 (44.0%)** |
| 1–30                | 2,60,000 (14.1%) | **6,00,000 (12.0%)**  |
| 31–60               | 2,40,000 (13.0%) | **14,00,000 (28.0%)** |
| 61–90               | 1,80,000 (9.8%)  | **5,00,000 (10.0%)**  |
| 90+                 | 2,40,000 (13.0%) | **3,00,000 (6.0%)**   |

Everything else on the Dashboard is unchanged: 63 open invoices, 2 missing contacts, the six chase rows, the attention strip. The empty-state copy that reads "All ₹18,40,000.00 is current" becomes "All ₹50,00,000.00 is current".

31–60 being the largest bucket looks odd but is what the invoice data demands — three of the four largest overdue invoices sit in that band. Leave it.

**Org-level constants, true everywhere:**

```
47 accounts · 44 with an outstanding balance · 63 open invoices
₹50,00,000.00 outstanding · ₹28,00,000.00 overdue
Reference date: 17 August 2026
```

---

## 1. Accounts list — `/app/accounts`

### Header

`<h1>` reads `Accounts`. Primary button top right: `Add entries`.

Metric strip beneath the title, `--fs-prose`: `47 accounts · ₹50,00,000.00 outstanding · ₹28,00,000.00 overdue`. The overdue figure is `text-danger`.

### Filter bar

Pill buttons, real `<button aria-pressed>`: `All · Has overdue · Missing contacts · Paused`.

Active filters render as removable chips with an `×`, plus a `Clear all` text button. **Unselected options stay as outlined pills and are never duplicated as chips** — this pattern is inherited and must not be redesigned.

Right-aligned, live: `12 accounts · ₹36,37,000.00`. Updates with the filter.

### Table

Eight columns. Every column header is a real `<button>` inside its `<th scope="col">`, with `aria-sort` reflecting state. Default sort: outstanding descending.

| Column         | Align                                             |
| -------------- | ------------------------------------------------- |
| ACCOUNT        | left — a real link to `/app/accounts/$id`         |
| OUTSTANDING    | right                                             |
| OVERDUE        | right — `text-danger`, `₹0.00` in `text-fg-muted` |
| OPEN INVOICES  | right                                             |
| OLDEST OVERDUE | right — `94 days`, or `—` when nothing is overdue |
| AVG DAYS LATE  | right                                             |
| CONTACTS       | left — three pips                                 |
| STATUS         | left                                              |

### The twelve rows

| Account                     | Outstanding  | Overdue      | Open | Oldest  | Avg late | Contacts  | Status          |
| --------------------------- | ------------ | ------------ | ---- | ------- | -------- | --------- | --------------- |
| Meridian Industries Pvt Ltd | ₹6,20,000.00 | ₹4,60,000.00 | 3    | 38 days | 29       | P0 P1     | Active          |
| Sharma Traders Pvt Ltd      | ₹4,82,000.00 | ₹3,10,000.00 | 9    | 94 days | 34       | P0⚠ P1 P2 | **Can't chase** |
| Nimbus Creative LLP         | ₹4,15,000.00 | ₹2,80,000.00 | 2    | 40 days | 41       | P0 P1     | Active          |
| Shakti Engineering Pvt Ltd  | ₹3,90,000.00 | ₹2,40,000.00 | 3    | 52 days | 47       | P0 P1 P2  | Active          |
| Bhavani Traders             | ₹3,45,000.00 | ₹0.00        | 2    | —       | 12       | P0        | Active          |
| Kaveri & Sons               | ₹2,95,000.00 | ₹1,80,000.00 | 2    | 67 days | 52       | ✕ P1 P2   | **Can't chase** |
| Vertex Labs Pvt Ltd         | ₹2,60,000.00 | ₹1,40,000.00 | 2    | 38 days | 22       | P0 P1     | Active          |
| Sundaram Industries Pvt Ltd | ₹2,20,000.00 | ₹1,65,000.00 | 2    | 71 days | 58       | ✕ P1      | **Can't chase** |
| Raghav & Co Traders         | ₹1,85,000.00 | ₹62,000.00   | 2    | 15 days | 18       | P0        | Active          |
| Anand & Sons Traders        | ₹1,60,000.00 | ₹95,000.00   | 2    | 12 days | 21       | P0 P1     | Active          |
| Coral Bay Creative          | ₹1,40,000.00 | ₹0.00        | 1    | —       | 8        | P0        | Paused          |
| Pinnacle Industries LLP     | ₹1,25,000.00 | ₹62,000.00   | 1    | 9 days  | 14       | P0        | Active          |

Visible totals: ₹36,37,000.00 outstanding, ₹19,94,000.00 overdue, 31 open invoices. The other 35 accounts carry ₹13,63,000.00, ₹8,06,000.00, and 32 invoices — three of them fully settled.

### Contacts pips

Three pips labelled P0, P1, P2. Filled `bg-fg` when a contact exists, hollow `border-stroke` when not.

**Three distinct states, and they are not the same problem:**

| State       | Pip                                          | Status column | Meaning                           |
| ----------- | -------------------------------------------- | ------------- | --------------------------------- |
| Healthy     | filled                                       | `Active`      | chaseable                         |
| No P0       | `✕` in `bg-danger` + warning icon on the row | `Can't chase` | nobody to send to                 |
| P0 bouncing | filled `bg-danger` with a small `⚠`          | `Can't chase` | somebody, but mail isn't arriving |

Every pip carries an accessible name — `"P0 contact present"`, `"No P0 contact"`, `"P0 contact email bouncing"`. Never colour alone.

**Sharma Traders is the bouncing case, and it explains why the largest overdue account after Meridian is absent from the Dashboard chase queue.** That link is deliberate. Do not "fix" it.

### States

- **Loading** — twelve row skeletons plus a metric-strip skeleton.
- **Empty, first run** — `Nothing here yet.` / `Import an export from Tally, Zoho, or a spreadsheet — or type a few invoices in by hand.` Primary `Upload a file`, secondary `Add entries manually`, text link `How do I export from Tally?`
- **Empty, filtered** — `No accounts match those filters.` with the chips still visible and a `Clear all filters` text button.
- **Error** — `Couldn't load your accounts.` + Retry.
- **Overflow** — a 60-character account name ellipsises with `title`. Below 1100px the table scrolls horizontally.

---

## 2. Account Detail — `/app/accounts/$accountId`

Built against **Sharma Traders Pvt Ltd**.

### Header card

```
Sharma Traders Pvt Ltd                    [ Pause chasing ]  [ Edit ]
Chasing paused — email bouncing · Data synced 2 days ago

₹4,82,000.00 outstanding
of which ₹3,10,000.00 is overdue

9 open invoices · oldest 94 days · pays 34 days late on average
```

- Name in `<h1>`, `text-title`.
- Outstanding at `text-metric`, `text-fg`. The overdue line beneath at `text-section` in `text-danger`. **This split is deliberate** — ₹4.82L total with ₹40k overdue is a completely different situation from ₹4.5L overdue. Do not merge them.
- Metadata line at `text-prose`, `text-fg-muted`.
- `Pause chasing` is a secondary button; `Edit` is a text button.

**Avg days late is the most quotable number in the product** — nobody in this segment has ever seen it about their own customers. Keep it prominent.

### Stale-data state

When the synced date is 7+ days old, the sync line reads `Chasing paused — data is 9 days old` in `text-warn` at 12.5/600, with a `Re-import` text button beside it.

### Aging bar

Same component as the Dashboard. Five segments, each labelled with its amount:

| Bucket      | Amount       |
| ----------- | ------------ |
| Not yet due | ₹1,72,000.00 |
| 1–30        | ₹94,000.00   |
| 31–60       | ₹1,16,000.00 |
| 61–90       | ₹52,000.00   |
| 90+         | ₹48,000.00   |

Sums to ₹4,82,000.00. Overdue = total − not yet due = ₹3,10,000.00. Both invariants get a test.

### Tabs

`Invoices · Contacts · Payments · Activity · Settings`

Real tab semantics: `role="tablist"`, `role="tab"` with `aria-selected`, `role="tabpanel"`. **Arrow keys move between tabs**, Tab moves into the panel. Active tab is `text-fg` with a 2px `accent-line` underline; inactive `text-fg-soft`.

The active tab lives in the URL (`?tab=contacts`) so it survives a refresh and can be linked to.

---

## 3. Invoices tab

Semantic table grouped by aging bucket, each group with a subtotal in its header row: `31–60 DAYS OVERDUE ⟶ ₹1,16,000.00`. `Not yet due` group comes first.

Columns: `INVOICE #` · `INVOICE DATE` · `DUE DATE` · `DAYS OVERDUE` (right) · `AMOUNT` (right) · `STATUS`.

Days overdue: `text-danger` above 30, `text-warn` for 1–30, `text-fg-muted` and reading `Not yet due` at zero.

### The nine invoices

| Group       | Invoice  | Invoice date | Due date    | Days        | Amount       | Status         |
| ----------- | -------- | ------------ | ----------- | ----------- | ------------ | -------------- |
| Not yet due | INV-2301 | 6 Aug 2026   | 5 Sep 2026  | Not yet due | ₹1,00,000.00 | Not yet due    |
| Not yet due | INV-2288 | 31 Jul 2026  | 30 Aug 2026 | Not yet due | ₹72,000.00   | Not yet due    |
| 1–30        | INV-2240 | 3 Jul 2026   | 2 Aug 2026  | 15 days     | ₹54,000.00   | Promised       |
| 1–30        | INV-2231 | 26 Jun 2026  | 26 Jul 2026 | 22 days     | ₹40,000.00   | Partially paid |
| 31–60       | INV-2180 | 5 Jun 2026   | 5 Jul 2026  | 43 days     | ₹68,000.00   | Open           |
| 31–60       | INV-2166 | 29 May 2026  | 28 Jun 2026 | 50 days     | ₹48,000.00   | Open           |
| 61–90       | INV-2104 | 7 May 2026   | 6 Jun 2026  | 72 days     | ₹52,000.00   | Open           |
| 90+         | INV-2015 | 21 Apr 2026  | 21 May 2026 | 94 days     | ₹30,000.00   | Open           |
| 90+         | INV-2008 | 24 Apr 2026  | 24 May 2026 | 91 days     | ₹18,000.00   | Open           |

Every row exposes `Chase` / `Mark paid` / `Snooze` on hover **and focus**, using the `row-action` class.

**Chase is disabled on every row here**, because the account's P0 is bouncing. Disabled with a tooltip reading `Can't chase — Rajat Mehta's email is bouncing`. A disabled button with no explanation is worse than no button.

### States

- **Loading** — header skeleton, aging-bar skeleton, six row skeletons.
- **Empty** — `Nothing outstanding from Bhavani Traders.` + `Add an invoice` secondary.
- **Error** — `Couldn't load this account.` + Retry.
- **Overflow** — 40 invoices in one aging group scroll within the page, not the table. Group headers stay in document order.

---

## 4. Contacts tab — the escalation ladder

The most conceptually unusual screen in the product.

### Bounce warning — top of the P0 group

Full-width `bg-danger-tint` strip with `border-danger-edge`:

> **Rajat Mehta's email is bouncing.** Nothing has reached this account since 9 days ago.
> `[ Replace contact ]`

A bounced P0 is the most common silent failure in the product. It must not read as a small badge.

### The three tiers

Each an `<h2>` with a one-line description:

| Tier | Heading                 | Description                           |
| ---- | ----------------------- | ------------------------------------- |
| P0   | `P0 — PRIMARY`          | Receives every reminder from day one  |
| P1   | `P1 — ESCALATION`       | Joins the thread when an invoice ages |
| P2   | `P2 — FINAL ESCALATION` | Last step before formal action        |

| Tier | Contact       | Designation        | Email                     | Phone           |
| ---- | ------------- | ------------------ | ------------------------- | --------------- |
| P0   | Rajat Mehta   | Accounts Executive | rajat@sharmatraders.com   | +91 98••• •••21 |
| P1   | Rajesh Kumar  | Finance Manager    | rajesh@sharmatraders.com  | +91 99••• •••04 |
| P2   | Mr. R. Sharma | Director           | rsharma@sharmatraders.com | +91 98••• •••77 |

### Contact card

White, hairline border, `rounded-card`. Name and designation on line one, email and phone beneath in `text-fg-muted`.

Channel toggles: `Email · WhatsApp · SMS`. Each is a `<button role="switch" aria-checked>` with an accessible name like `"Email for Rajat Mehta"`. On is `bg-accent-tint text-accent`; off is `bg-alt text-fg-soft`.

A channel the contact has nothing to send to is **disabled, not refused on click** — WhatsApp and SMS on a contact with no phone number, Email on one with no address. The card carries the reason in a line under the toggles (`"WhatsApp and SMS need a phone number. Add one from Edit contact."`) as well as in the toggle's `title`, because a disabled control with no explanation is the dead click the conventions forbid. A channel that is already on stays switchable off whatever is missing: turning it off is the fix.

Also per card: `Always CC` toggle, `Do not contact` toggle with a required reason when on, and a language selector (English, Hindi, Tamil, Telugu, Marathi, Gujarati, Bengali, Kannada).

`Edit contact` in the `⋯` menu swaps the card for the add-contact form, filled in, with `Save changes`. It is the only way to change a name, designation, email or phone after creation, and it is how a missing phone number gets added — which is what the disabled WhatsApp and SMS toggles point at. One write form is open at a time across the whole tab, add included: they all submit with the same `If-Match` token, so a second open form would be refused as a stale write after the user had filled it in. `Do not contact` stays on the card, not in the form — silencing somebody is not part of correcting their phone number.

`+ Add contact` secondary button at the foot of each tier group.

### Reordering — read this before building

The design says drag-to-reorder between tiers. **Drag alone is not acceptable**, and dnd-kit isn't installed.

Build the keyboard-and-mouse path first: each card's `⋯` menu has `Edit contact`, `Move to P0 / P1 / P2` and `Remove contact`, and the card's tier is also a labelled select. That is the real mechanism and it is fully accessible. Drag is a later enhancement over the same state; if it never ships, nothing is lost.

Do not install a drag library for this build. If you think you need one, stop and ask.

### Rules

- At least one usable P0 per account, required before chasing.
- P1 and P2 optional. P0-only is valid and common.
- Multiple contacts may share a tier, P0 included — two AP staff both get the
  P0 message. The database rule is at-least-one-to-chase, not exactly-one:
  see accounts-contract.md §1, which drops the `(account_id, tier)` unique
  index. `docs/project-conventions.md` and the `contacts_one_active_p0_per_account`
  index still say at-most-one and are the migration this PR asks for.
- Promoting a contact demotes nobody. Tiers are labels, not slots.
- Removing the last P0 is blocked with `An account needs a P0 contact to be chased. Add a replacement first.`

### Timing config

On a `bg-subtle` panel beneath the ladder:

```
Bring in P1 after [ 21 ] days overdue
Bring in P2 after [ 45 ] days overdue
```

Real `<input type="number" min="1" max="365">` inline in the sentence, with visually-hidden labels. P2 must be greater than P1; if not, show `P2 must come after P1.` inline and don't save.

### Live preview

Beneath, in a `role="status"` block so changes are announced:

> Rajat gets the first reminder. Rajesh joins at day 21. Mr. Sharma joins at day 45.

Updates as the numbers change. **Escalation is cumulative** — word it so it's clear P0 stays in the thread. Never "hands over to".

### States

- **Empty, no P0** — `bg-danger-tint` block in the P0 group: `No primary contact. This account can't be chased.` + `Add a contact` primary.
- **Loading** — three card skeletons.
- **Error** — `Couldn't load contacts.` + Retry.

---

## 5. Payments tab

Table of payments received against this account: `DATE · AMOUNT · SOURCE · ALLOCATED TO · UNAPPLIED`.

Source is one of `Bank alert · Manual · Statement`.

Above the table, when non-zero: `₹12,000.00 unapplied credit` in `text-warn` with an `Allocate` secondary button. The allocation modal is out of scope — the button routes to `/app/payments` for now.

**Empty:** `No payments recorded from Sharma Traders yet.`

For Sharma: two payments — 4 Aug 2026, ₹40,000.00, Bank alert, allocated to INV-2231; and 22 Jul 2026, ₹60,000.00, Manual, allocated to INV-2166 with ₹12,000.00 unapplied.

---

## 6. Activity tab

Reverse-chronological log in plain sentences, not a table. Each entry: a one-line sentence, a relative timestamp, and where relevant a link.

```
Rajat Mehta's email bounced.                              9 days ago
₹40,000.00 payment received, allocated to INV-2231.          13 days ago
INV-2240 marked as promised for 25 August.                18 days ago
Rajesh Kumar added as P1 contact.                         26 days ago
9 invoices imported from Tally export.                    2 months ago
```

Leave layout room for future chase events so this doesn't need rework.

**Empty:** `Nothing has happened on this account yet.`

---

## 7. Settings tab

A real `<form>` using react-hook-form and zod, matching the repo's existing form patterns.

| Field                | Control                               | Default        |
| -------------------- | ------------------------------------- | -------------- |
| Default credit terms | number input, days                    | 30             |
| Currency             | select                                | INR            |
| Expected TDS section | select — 194C, 194J, 194H, 194I, None | 194J           |
| Expected TDS rate    | number input, %                       | 10             |
| Pause chasing        | switch                                | on (bouncing)  |
| Pause reason         | text, required when paused            | Email bouncing |
| Paused until         | date, optional                        | —              |
| Account owner        | select of org users                   | Priya Nair     |
| Notes                | textarea                              | —              |

Save is disabled until something changes. On save, a toast. On failure, the inline error from the server, verbatim.

**Receivables are carried gross.** The TDS fields record what to expect at payment time; they never net down the outstanding figure anywhere on this screen.

---

## 8. Done when

- Account totals reconcile: the Dashboard's `₹28,00,000.00` overdue, the Accounts list metric strip, and every account row agree.
- Sharma Traders' aging segments sum to `₹4,82,000.00`, and its nine invoice rows sum to the same.
- Kaveri & Sons and Sundaram show `Can't chase` with a `✕` P0 pip. Sharma shows `Can't chase` with a bouncing P0 pip. All three are distinguishable without colour.
- Every account name is a link. Tab order runs header → filters → column headers → rows.
- Column headers are buttons and announce sort state via `aria-sort`.
- Tabs are operable with arrow keys; the active tab survives a refresh.
- The contact ladder is fully usable with keyboard only, with no drag.
- Changing the P1 threshold updates the preview sentence and announces it.
- No `#9a9a92`, no arbitrary Tailwind values, no `outline-none`.
- `bun run typecheck`, `lint`, and `build` all pass.
