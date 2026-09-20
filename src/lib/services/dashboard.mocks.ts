import type {
  ChaseQueue,
  ChaseResponse,
  DashboardSummary,
  ApiError,
} from "@/lib/schemas/dashboard";

/**
 * Fixture data for `VITE_USE_MOCKS=true`.
 *
 * Book totals come from `docs/accounts-spec.md` §0 (reconciled to per-invoice
 * figures). Open-invoice count (63) and missing-contact count (2) are product
 * decisions that override the older dashboard-spec / contract numbers.
 *
 * These are typed but not parsed here — the service runs every fixture through
 * the same zod schema as a real response, so a fixture that drifts from the
 * contract fails in exactly the same place a bad backend payload would.
 *
 * IDs are fixed rather than random so a screenshot, a test, and a bug report
 * all refer to the same row.
 */

const ACCOUNT_IDS = {
  meridian: "acc00001-0000-4000-8000-000000000001",
  nimbus: "acc00002-0000-4000-8000-000000000002",
  shakti: "acc00003-0000-4000-8000-000000000003",
  anand: "acc00004-0000-4000-8000-000000000004",
  pinnacle: "acc00005-0000-4000-8000-000000000005",
  orbit: "acc00006-0000-4000-8000-000000000006",
} as const;

const INVOICE_IDS = {
  inv1042: "d0c00001-0000-4000-8000-000000001042",
  inv2052: "d0c00002-0000-4000-8000-000000002052",
  inv2038: "d0c00003-0000-4000-8000-000000002038",
  inv1187: "d0c00004-0000-4000-8000-000000001187",
  inv1402: "d0c00005-0000-4000-8000-000000001402",
  inv1998: "d0c00006-0000-4000-8000-000000001998",
} as const;

/** Spec §1: "Last synced today at 09:12" on Monday 17 August. */
const AS_OF = "2026-08-17T09:12:00+05:30";

/**
 * The canonical summary. Aging segments sum to `total_outstanding` — spec §3
 * makes that a unit-test invariant, so treat it as one when editing.
 */
export const summaryFixture: DashboardSummary = {
  as_of: AS_OF,
  stale: false,
  tiles: {
    // accounts-spec §0: book totals move to match per-invoice figures.
    total_outstanding: "5000000.00",
    account_count: 47,
    overdue: "2800000.00",
    overdue_share_pct: 56.0,
    // DECISION: 63, overriding the older dashboard-spec / contract 128.
    open_invoice_count: 63,
    // DECISION: 2, overriding the older dashboard-spec / contract 6. Counted
    // from the accounts fixtures, where two of the twelve listed accounts
    // resolve to `no_p0`. `attention.accounts_without_p0` is the same condition
    // and links to the same filtered list, so it carries the same number.
    missing_contact_account_count: 2,
  },
  aging: [
    { bucket: "Not yet due", amount: "2200000.00", share_pct: 44.0 },
    { bucket: "1–30", amount: "600000.00", share_pct: 12.0 },
    { bucket: "31–60", amount: "1400000.00", share_pct: 28.0 },
    { bucket: "61–90", amount: "500000.00", share_pct: 10.0 },
    { bucket: "90+", amount: "300000.00", share_pct: 6.0 },
  ],
  attention: {
    // Same condition and same destination as `missing_contact_account_count`
    // above. Two fields disagreeing about one count is a bug on screen.
    accounts_without_p0: 2,
    disputes_open: 1,
    // DECISION: the third attention item is broken promises, not payments
    // awaiting triage — Payments does not exist in this build.
    promises_broken_this_week: 3,
  },
};

/**
 * The six rows from spec §5, in rank order.
 *
 * Kaveri & Sons (no P0 contact) and Vertex Labs INV-2103 (disputed) are absent
 * on purpose: they fail chase-queue eligibility, so the API never returns them.
 * Do not add them back to "fill out" the table.
 */
export const chaseQueueFixture: ChaseQueue = {
  total_eligible: 41,
  items: [
    {
      invoice_id: INVOICE_IDS.inv1042,
      account_id: ACCOUNT_IDS.meridian,
      account_name: "Meridian Industries Pvt Ltd",
      invoice_number: "INV-1042",
      amount_outstanding: "460000.00",
      days_overdue: 38,
      priority_band: "Escalate",
      priority_reason: "Largest overdue balance, 38 days",
    },
    {
      invoice_id: INVOICE_IDS.inv2052,
      account_id: ACCOUNT_IDS.nimbus,
      account_name: "Nimbus Creative LLP",
      invoice_number: "INV-2052",
      amount_outstanding: "280000.00",
      days_overdue: 40,
      priority_band: "Escalate",
      priority_reason: "Promise broken on 8 Aug",
    },
    {
      invoice_id: INVOICE_IDS.inv2038,
      account_id: ACCOUNT_IDS.shakti,
      account_name: "Shakti Engineering Pvt Ltd",
      invoice_number: "INV-2038",
      amount_outstanding: "240000.00",
      days_overdue: 52,
      priority_band: "Escalate",
      priority_reason: "Second reminder went unanswered",
    },
    {
      invoice_id: INVOICE_IDS.inv1187,
      account_id: ACCOUNT_IDS.anand,
      account_name: "Anand & Sons Traders",
      invoice_number: "INV-1187",
      amount_outstanding: "95000.00",
      days_overdue: 12,
      priority_band: "Chase now",
      priority_reason: "No reminder sent yet, 12 days",
    },
    {
      invoice_id: INVOICE_IDS.inv1402,
      account_id: ACCOUNT_IDS.pinnacle,
      account_name: "Pinnacle Industries LLP",
      invoice_number: "INV-1402",
      amount_outstanding: "62000.00",
      days_overdue: 9,
      priority_band: "Watch",
      priority_reason: "Small balance, first reminder due",
    },
    {
      invoice_id: INVOICE_IDS.inv1998,
      account_id: ACCOUNT_IDS.orbit,
      account_name: "Orbit Labs Pvt Ltd",
      invoice_number: "INV-1998",
      amount_outstanding: "22000.00",
      days_overdue: 61,
      priority_band: "Watch",
      priority_reason: "Small amount but 61 days old",
    },
  ],
};

/** Spec §5: rows 1–3 render pre-checked, so the bulk bar shows on first paint. */
export const PRE_CHECKED_INVOICE_IDS: readonly string[] = [
  INVOICE_IDS.inv1042,
  INVOICE_IDS.inv2052,
  INVOICE_IDS.inv2038,
];

// ---------------------------------------------------------------------------
// Variants — each one exists because a state in spec §6 is otherwise
// unreachable without a backend.
// ---------------------------------------------------------------------------

/** Spec §6 "Empty — nothing overdue". Tiles and aging bar still render. */
export const emptyChaseQueueFixture: ChaseQueue = {
  total_eligible: 0,
  items: [],
};

/**
 * Spec §6 "Everything-is-aged". The queue is empty *because* the whole book is
 * over 90 days old, which must not produce the cheerful empty state.
 *
 * Pair with `emptyChaseQueueFixture`: the distinction lives in the aging split,
 * not in the queue, so the summary is what tells the two states apart.
 */
export const allAgedSummaryFixture: DashboardSummary = {
  ...summaryFixture,
  tiles: {
    ...summaryFixture.tiles,
    overdue: "5000000.00",
    overdue_share_pct: 100.0,
  },
  aging: [
    { bucket: "Not yet due", amount: "0.00", share_pct: 0.0 },
    { bucket: "1–30", amount: "0.00", share_pct: 0.0 },
    { bucket: "31–60", amount: "0.00", share_pct: 0.0 },
    { bucket: "61–90", amount: "0.00", share_pct: 0.0 },
    { bucket: "90+", amount: "5000000.00", share_pct: 100.0 },
  ],
};

/**
 * Spec §6 "Overflow": a 60-character account name must ellipsise and carry a
 * `title` attribute. Exactly 60 characters — a test asserts the length, so
 * don't tidy the wording without recounting.
 */
export const LONG_ACCOUNT_NAME = "Brahmaputra Infrastructure & Allied Engineering Services Ltd";

export const longAccountNameChaseQueueFixture: ChaseQueue = {
  total_eligible: chaseQueueFixture.total_eligible,
  items: chaseQueueFixture.items.map((item, index) =>
    index === 0 ? { ...item, account_name: LONG_ACCOUNT_NAME } : item,
  ),
};

/**
 * Spec §6 "Overflow": ₹4,20,00,000.00 must not wrap or clip inside its tile.
 * Segments still sum to the total; the invariant does not get a holiday
 * because the number is large.
 */
export const largeTotalSummaryFixture: DashboardSummary = {
  ...summaryFixture,
  tiles: {
    ...summaryFixture.tiles,
    total_outstanding: "42000000.00",
    overdue: "21000000.00",
    overdue_share_pct: 50.0,
  },
  aging: [
    { bucket: "Not yet due", amount: "21000000.00", share_pct: 50.0 },
    { bucket: "1–30", amount: "6000000.00", share_pct: 14.3 },
    { bucket: "31–60", amount: "5000000.00", share_pct: 11.9 },
    { bucket: "61–90", amount: "4000000.00", share_pct: 9.5 },
    { bucket: "90+", amount: "6000000.00", share_pct: 14.3 },
  ],
};

/**
 * Spec §6 "Error — aggregates failed". The message is the backend's copy and
 * the screen shows it verbatim above the tile row, with all four tiles at "—".
 */
export const aggregatesUnavailableFixture: ApiError = {
  error: {
    code: "aggregates_unavailable",
    message: "Couldn't load your totals.",
  },
};

/**
 * The mock reply to `POST /api/v1/chases`.
 *
 * Always accepts everything asked for. The real endpoint re-validates each
 * invoice and can return entries in `skipped`; that path needs a live backend
 * to exercise, so don't read an empty `skipped` here as proof the UI handles it.
 */
export function makeChaseResponseFixture(invoiceIds: readonly string[]): ChaseResponse {
  return { queued: invoiceIds.length, skipped: [] };
}
