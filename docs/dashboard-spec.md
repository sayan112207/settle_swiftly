# Dashboard — Build Spec

This is the corrected spec, post-audit. Every figure here is authoritative. Where an earlier design file disagrees, this wins.

**The Dashboard is shell authority.** The sidebar, table, badge, and button built here are the versions every other screen will inherit. Build them as shared components in `/components`, not inline.

---

## 1. Shell

```
┌──────────────┬────────────────────────────────────────────────┐
│  Sidebar     │  Main                                          │
│  240px       │  flex 1 · bg page · max-width 1400px           │
│  bg subtle   │  padding 28px 32px 40px                        │
│  sticky      │                                                │
│  100vh       │                                                │
└──────────────┴────────────────────────────────────────────────┘
```

**Sidebar** — `<aside>` containing:

- Wordmark. 17px / 700 / -0.02em. Padding `6px 8px 24px`. Value from `lib/brand.js`.
- `<nav>` with eight `<a>` elements, in this fixed order:
  `Dashboard · Accounts · Invoices · Add entries · Payments · Chasing · Reports · Settings`
  - Each: padding `9px 12px`, `--fs-body` / 600, radius `0 var(--r-nav) var(--r-nav) 0`.
  - Active: `color: var(--text-primary)`, `border-left: 2px solid var(--accent-line)`, `padding-left: 10px`, `aria-current="page"`.
  - Inactive: `color: var(--text-secondary)`, `border-left: 2px solid transparent`.
  - Hover: `background: var(--surface-hover)`.
  - Only `/app/dashboard` has a page in this build. The other seven route to `/app/[section]` which renders a bare `<h1>` and nothing else. **Do not disable them and do not hide them** — the nav must be structurally complete now, because 21 screens copy it later.
- Footer, pinned bottom, `1px solid var(--border-hairline)` top border: 30px circle avatar + name at `--fs-prose`/600 + org name at `--fs-eyebrow`/400 in `--text-muted`.

**Page header** — `<h1>` at `--fs-title` / 700 / -0.02em. Optional metadata line beneath at `--fs-prose` / 400 / `--text-secondary`. 22px margin below the header block.

Header copy: `<h1>` reads `Good morning, Priya`. Metadata line: `Monday, 17 August · Last synced today at 09:12`.

---

## 2. Metric tiles

Four tiles in a row, `gap: var(--sp-4)`. Each is a card (`bg card`, `1px var(--border-hairline)`, `--r-card`, padding `18px 20px`, **no shadow**) and each is a real `<a>` wrapping its whole content.

| Eyebrow           | Value      | Sub-line                 | Links to                   |
| ----------------- | ---------- | ------------------------ | -------------------------- |
| TOTAL OUTSTANDING | ₹18,40,000 | 47 accounts              | `/accounts`                |
| OVERDUE           | ₹9,20,000  | 50.0% of book            | `/invoices?status=overdue` |
| OPEN INVOICES     | 128        | across 47 accounts       | `/invoices`                |
| MISSING CONTACTS  | 6          | accounts can't be chased | `/accounts/contacts-fill`  |

- Eyebrow: `--fs-eyebrow`, uppercase, `0.08em`, `--text-muted`.
- Value: `--fs-metric` / 700 / -0.02em, `--text-primary`. Overdue value is `--danger-text`.
- Sub-line: `--fs-prose` / 400, `--text-secondary`.
- Hover: `background: var(--surface-hover)`.
- **All four destinations must be distinct.** The audit found tiles pointing at the same place.

---

## 3. Aging bar

Full-width horizontal bar beneath the tiles. Section heading `<h2>` reads `Where the money is sitting`.

Segments, left to right, widths proportional to amount:

| Label       | Amount    | Share | Colour token          |
| ----------- | --------- | ----- | --------------------- |
| Not yet due | ₹9,20,000 | 50.0% | `--aging-not-yet-due` |
| 1–30        | ₹2,60,000 | 14.1% | `--aging-1-30`        |
| 31–60       | ₹2,40,000 | 13.0% | `--aging-31-60`       |
| 61–90       | ₹1,80,000 | 9.8%  | `--aging-61-90`       |
| 90+         | ₹2,40,000 | 13.0% | `--aging-90-plus`     |

Total ₹18,40,000. **The segments must sum to the Total outstanding tile.** A unit test asserts this.

- Bar height 10px, radius `--r-pill`, no gaps between segments.
- Labels sit beneath each segment: bucket name at `--fs-eyebrow`/600/`--text-muted`, amount at `--fs-prose`/600/`--text-primary`.
- The bar is decorative. Add a `.sr-only` `<table>` immediately after it carrying the five bucket/amount pairs, so the data is not conveyed by shape and colour alone.
- First bucket is `Not yet due`. Never `Current`.

---

## 4. "Needs your attention" strip

`<h2>` reads `Needs your attention`. Three columns, each a card, each with a count, a label, and a link.

| Count | Label                       | Links to                          |
| ----- | --------------------------- | --------------------------------- |
| 6     | accounts with no P0 contact | `/accounts/contacts-fill`         |
| 1     | dispute raised              | `/invoices?status=disputed`       |
| 3     | promises broken this week   | `/invoices?status=promise-broken` |

Count at `--fs-metric`, label at `--fs-prose`/400/`--text-secondary`.

---

## 5. "Chase now" table

`<h2>` reads `Chase now`. Subtitle beneath at `--fs-prose`/400/`--text-secondary`: `Ranked by what's most worth chasing today`.

### Structure

Real `<table>`, wrapped in `<div style="overflow-x:auto">`. Seven columns:

| #   | `<th>`                                | Align     | Notes                                           |
| --- | ------------------------------------- | --------- | ----------------------------------------------- |
| 1   | `<span class="sr-only">Select</span>` | —         | header checkbox: select all                     |
| 2   | ACCOUNT                               | left      | plain text, not a link in this build            |
| 3   | INVOICE                               | left      | `INV-1042` format, monospace-free, tabular-nums |
| 4   | AMOUNT                                | **right** | `₹4,60,000`                                     |
| 5   | OVERDUE                               | **right** | `38 days`                                       |
| 6   | PRIORITY                              | left      | badge                                           |
| 7   | REASON                                | left      | plain-language sentence                         |

Plus an unheaded eighth cell at the far right holding the per-row Chase button.

- `<thead>`: `background: var(--surface-subtle)`, `1px solid var(--border-hairline)` bottom.
- `<th>`: `--fs-eyebrow`, 600, uppercase, `0.08em`, `--text-muted`, padding `11px 12px`.
- `<td>`: `--fs-body` / 600 / `--text-primary`, padding `0 var(--sp-3)`, row height `var(--row-h)`, `1px solid var(--border-hairline)` bottom.
- Row hover: `background: var(--surface-hover)`. Row selected: `background: var(--accent-row-tint)`.
- Long account names: `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` plus a `title` attribute carrying the full string.

### The six rows — exact data

Rows 1–3 render pre-checked.

| ✓   | Account                     | Invoice  | Amount    | Overdue | Priority  | Reason                            |
| --- | --------------------------- | -------- | --------- | ------- | --------- | --------------------------------- |
| ✓   | Meridian Industries Pvt Ltd | INV-1042 | ₹4,60,000 | 38 days | Escalate  | Largest overdue balance, 38 days  |
| ✓   | Nimbus Creative LLP         | INV-2052 | ₹2,80,000 | 40 days | Escalate  | Promise broken on 8 Aug           |
| ✓   | Shakti Engineering Pvt Ltd  | INV-2038 | ₹2,40,000 | 52 days | Escalate  | Second reminder went unanswered   |
|     | Anand & Sons Traders        | INV-1187 | ₹95,000   | 44 days | Chase now | Crosses the 45-day mark tomorrow  |
|     | Pinnacle Industries LLP     | INV-1402 | ₹62,000   | 9 days  | Watch     | Small balance, first reminder due |
|     | Orbit Labs Pvt Ltd          | INV-1998 | ₹22,000   | 61 days | Watch     | Small amount but 61 days old      |

**Two accounts that appeared in the original design are deliberately absent:**

- _Kaveri & Sons_ — has no P0 contact, so it cannot be chased.
- _Vertex Labs Pvt Ltd, INV-2103_ — Disputed, so it has no chase priority.

Showing a Chase action on either contradicts the product's core rule. The API must exclude them; the frontend must not need to know why.

### Priority badge

Pill: `--fs-pill` / 600, padding `3px 10px`, radius `--r-pill`. Text label always present.

| Band      | Background      | Text               |
| --------- | --------------- | ------------------ |
| Escalate  | `--danger-tint` | `--danger-text`    |
| Chase now | `--warn-tint`   | `--warn-text`      |
| Watch     | `--surface-alt` | `--text-secondary` |

### Row Chase button

Last cell, text-button variant: no background, no border, `color: var(--accent-text)`, hover `--accent-fill-hover`. Label `Chase`.

Visible on row hover **and always visible on keyboard focus** — `opacity: 0` by default is fine, but it must become `opacity: 1` on both `tr:hover` and `button:focus-visible`. A hover-only control is unreachable by keyboard.

### Bulk bar

Appears above the table when one or more rows are checked. `background: var(--accent-tint)`, `1px solid var(--accent-tint-border)`, radius `--r-card`, padding `var(--sp-3) var(--sp-4)`.

- Left: `3 selected` at `--fs-body`/600.
- Right: primary button labelled `Chase 3 invoices`. The count is live. Never `Chase all`.
- With three rows pre-checked on load, this bar is visible on first paint.

---

## 6. States

### Loading

Four tile skeletons, one aging-bar skeleton, six table row skeletons. Skeleton bars are `background: var(--surface-alt)`, `radius: var(--r-check)`. **No shimmer animation.** The layout must not shift when real data arrives — skeletons occupy the final dimensions.

### Empty — nothing overdue

Replace the Chase now table (only the table, keep tiles and aging bar) with a centred empty state, max-width 480px:

- 40px thin-stroke line icon, `--text-muted`, 1.6 stroke.
- Heading, `--fs-section`/700: `Nothing overdue. All ₹18,40,000 is current.`
- Line, `--fs-prose`/400/`--text-secondary`: `We'll start chasing again the moment something slips.`
- **No button.** There is nothing to do.

### Error — aggregates failed

All four tiles show `—`. A single inline message above the tile row: `Couldn't load your totals.` plus a secondary `Retry` button. Do not show four separate error messages.

### Overflow

- A 60-character account name ellipsises with a `title` attribute.
- A value of `₹4,20,00,000` must not wrap or clip inside its tile. Test this specific string.

### Everything-is-aged edge case

If the main queue is empty _because_ every invoice is 90+ days old, do not render the cheerful empty state. Render: `Nothing in the chase queue — everything is over 90 days old.` with a link to Reports. That situation means something has gone badly wrong for the business and a congratulatory message is the wrong response.

---

## 7. Formatting rules

- **Currency:** Indian digit grouping, always. `₹4,82,000.00`, `₹18,40,000.00`. Symbol prefixed, no space. Paise always shown, including on whole amounts — `Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`. Fixed width keeps the decimal points on one axis in a right-aligned column, and stops a stored `125000.50` from reading as `₹1,25,001`. **Never abbreviate on desktop.**
- **Zero:** `₹0.00` in `--text-muted`. Never `—`.
- **Dates:** `17 Aug 2026` in tables. `8 Aug` only where the year is unambiguous in surrounding context.
- **Relative time:** `4 days ago`, `Today · 09:12`, `Never`. Never "recently".
- **Aging:** `38 days`. Where not overdue, `Not yet due`. Never `0 days`.
- **Invoice numbers:** `INV-1042`. Never `#0042`.
- **Percentages:** one decimal maximum.

---

## 8. Fixed vocabulary

Use these exact strings. Do not invent variants.

```
Invoice status   Not yet due · Open · Partially paid · Promised · Disputed
                 · Paid · Written off
Account status   Active · Paused
Priority band    Chase now · Watch · Escalate
Contact tiers    P0 · P1 · P2
Delivery state   verified · unverified · bounced
Aging buckets    Not yet due · 1–30 · 31–60 · 61–90 · 90+
```

---

## 9. Done when

- Tab reaches every nav item, every tile, the header checkbox, every row checkbox, every row Chase button, and the bulk button — with a visible outline at each stop.
- A screen reader announces the Chase now table with seven column headers.
- No `#9a9a92`, no `#18A873` as a fill or as text, no `#B08900` in `src/routes/app/`, `src/components/app/`, or `src/styles/app-tokens.css`. The marketing palette in `src/styles.css` is out of scope for this rule.
- The Overdue tile reads `₹9,20,000` and the aging segments sum to `₹18,40,000`.
- No Disputed invoice and no account without a P0 contact appears in the table.
- All four tiles link to distinct destinations.
- Resizing below 1100px scrolls the table horizontally rather than compressing columns.
