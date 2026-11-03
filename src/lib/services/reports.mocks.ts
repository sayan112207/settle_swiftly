import type { WeeklyReport } from "@/lib/schemas/reports";

/**
 * Fixture data for the Reports screen under `VITE_USE_MOCKS=true`.
 *
 * Account IDs and names are the ones the dashboard and accounts fixtures
 * already use, so a row here links to an account page that exists in the mock
 * store and names the same business everywhere else on screen.
 *
 * Typed but not parsed here — the service runs every fixture through the same
 * zod schema as a real response.
 */

const ACCOUNT_IDS = {
  meridian: "acc00001-0000-4000-8000-000000000001",
  nimbus: "acc00002-0000-4000-8000-000000000002",
  shakti: "acc00003-0000-4000-8000-000000000003",
  anand: "acc00004-0000-4000-8000-000000000004",
  pinnacle: "acc00005-0000-4000-8000-000000000005",
  sharma: "acc00007-0000-4000-8000-000000000007",
  bhavani: "acc00008-0000-4000-8000-000000000008",
  kaveri: "acc00009-0000-4000-8000-000000000009",
  vertex: "acc00010-0000-4000-8000-000000000010",
  sundaram: "acc00011-0000-4000-8000-000000000011",
  raghav: "acc00012-0000-4000-8000-000000000012",
  coral: "acc00013-0000-4000-8000-000000000013",
} as const;

const INVOICE_IDS = {
  // Shared with the dashboard chase queue.
  inv1187: "d0c00004-0000-4000-8000-000000001187",
  inv1402: "d0c00005-0000-4000-8000-000000001402",
  // Shared with Sharma Traders' account invoices.
  inv2015: "d0c00017-0000-4000-8000-000000002015",
  inv2008: "d0c00018-0000-4000-8000-000000002008",
  // Reports-only rows.
  inv1205: "d0c00040-0000-4000-8000-000000001205",
  inv2061: "d0c00041-0000-4000-8000-000000002061",
  inv2103: "d0c00042-0000-4000-8000-000000002103",
  inv1876: "d0c00043-0000-4000-8000-000000001876",
  inv1733: "d0c00044-0000-4000-8000-000000001733",
  inv1691: "d0c00045-0000-4000-8000-000000001691",
} as const;

/** Same Monday the dashboard fixture is pinned to. */
const AS_OF = "2026-08-17T09:12:00+05:30";

/** Matches the copy the accounts fixtures derive for a `no_p0` account. */
const NO_P0 = "Can't chase — no primary contact";
/** Matches Sharma Traders' bounce in the accounts fixtures. */
const BOUNCING = "Can't chase — Rajat Mehta's email is bouncing";

/**
 * The canonical weekly report.
 *
 * `aged_debt` sums to ₹3,00,000.00 — the dashboard summary's 90+ bucket. Two
 * screens disagreeing about the same money is a bug on screen; a test holds
 * the two fixtures together.
 */
export const weeklyReportFixture: WeeklyReport = {
  has_report: true,
  as_of: AS_OF,
  tiles: {
    collected_this_week: "420000.00",
    collected_last_week: "310000.00",
    dso_days: 38,
    dso_at_signup_days: 47,
    messages_sent: 18,
    messages_approved_manually: 12,
    hours_saved_estimate: 3.1,
  },
  dso_series: [
    { month: "2026-03", days: 47 },
    { month: "2026-04", days: 45 },
    { month: "2026-05", days: 43 },
    { month: "2026-06", days: 41 },
    { month: "2026-07", days: 39 },
    { month: "2026-08", days: 38 },
  ],
  at_risk: [
    {
      invoice_id: INVOICE_IDS.inv1187,
      account_id: ACCOUNT_IDS.anand,
      account_name: "Anand & Sons Traders",
      invoice_number: "INV-1187",
      amount_outstanding: "95000.00",
      bucket: "1–30",
      note: "Second reminder due Wednesday",
    },
    {
      invoice_id: INVOICE_IDS.inv1205,
      account_id: ACCOUNT_IDS.coral,
      account_name: "Coral Bay Creative",
      invoice_number: "INV-1205",
      amount_outstanding: "64000.00",
      bucket: "31–60",
      note: "Crosses 60 days on 21 Aug",
    },
    {
      invoice_id: INVOICE_IDS.inv1402,
      account_id: ACCOUNT_IDS.pinnacle,
      account_name: "Pinnacle Industries LLP",
      invoice_number: "INV-1402",
      amount_outstanding: "62000.00",
      bucket: "1–30",
      note: "First reminder due",
    },
    {
      invoice_id: INVOICE_IDS.inv2061,
      account_id: ACCOUNT_IDS.sundaram,
      account_name: "Sundaram Industries Pvt Ltd",
      invoice_number: "INV-2061",
      amount_outstanding: "240000.00",
      bucket: "31–60",
      note: "No P0 — can't chase",
    },
  ],
  call_list: [
    {
      account_id: ACCOUNT_IDS.meridian,
      account_name: "Meridian Industries Pvt Ltd",
      reason: "Largest overdue balance, 38 days",
    },
    {
      account_id: ACCOUNT_IDS.nimbus,
      account_name: "Nimbus Creative LLP",
      reason: "Promise broken on 8 Aug",
    },
    {
      account_id: ACCOUNT_IDS.shakti,
      account_name: "Shakti Engineering Pvt Ltd",
      reason: "Second reminder went unanswered",
    },
    {
      account_id: ACCOUNT_IDS.kaveri,
      account_name: "Kaveri & Sons",
      reason: "No primary contact — can't be chased",
    },
  ],
  aged_debt: [
    {
      invoice_id: INVOICE_IDS.inv2103,
      account_id: ACCOUNT_IDS.vertex,
      account_name: "Vertex Labs Pvt Ltd",
      invoice_number: "INV-2103",
      amount_outstanding: "110000.00",
      days_overdue: 96,
      chase_disabled_reason: "Can't chase — invoice is disputed",
    },
    {
      invoice_id: INVOICE_IDS.inv1876,
      account_id: ACCOUNT_IDS.kaveri,
      account_name: "Kaveri & Sons",
      invoice_number: "INV-1876",
      amount_outstanding: "72000.00",
      days_overdue: 108,
      chase_disabled_reason: NO_P0,
    },
    {
      invoice_id: INVOICE_IDS.inv1733,
      account_id: ACCOUNT_IDS.raghav,
      account_name: "Raghav & Co Traders",
      invoice_number: "INV-1733",
      amount_outstanding: "45000.00",
      days_overdue: 102,
      chase_disabled_reason: null,
    },
    {
      invoice_id: INVOICE_IDS.inv2015,
      account_id: ACCOUNT_IDS.sharma,
      account_name: "Sharma Traders Pvt Ltd",
      invoice_number: "INV-2015",
      amount_outstanding: "30000.00",
      days_overdue: 94,
      chase_disabled_reason: BOUNCING,
    },
    {
      invoice_id: INVOICE_IDS.inv1691,
      account_id: ACCOUNT_IDS.bhavani,
      account_name: "Bhavani Traders",
      invoice_number: "INV-1691",
      amount_outstanding: "25000.00",
      days_overdue: 93,
      chase_disabled_reason: null,
    },
    {
      invoice_id: INVOICE_IDS.inv2008,
      account_id: ACCOUNT_IDS.sharma,
      account_name: "Sharma Traders Pvt Ltd",
      invoice_number: "INV-2008",
      amount_outstanding: "18000.00",
      days_overdue: 91,
      chase_disabled_reason: BOUNCING,
    },
  ],
};

/** A new org before its first Monday: the "first report lands" state. */
export const pendingReportFixture: WeeklyReport = {
  has_report: false,
  as_of: AS_OF,
};

/** The "Nothing over 90 days." state. */
export const noAgedDebtReportFixture: WeeklyReport = {
  ...weeklyReportFixture,
  aged_debt: [],
};
