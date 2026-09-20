import { z } from "zod";

import type {
  AccountActivity,
  AccountChasingSettings,
  AccountContacts,
  AccountDetail,
  AccountInvoices,
  AccountListItem,
  AccountPayments,
  AccountsList,
  AccountsView,
  ApiError,
  ArchiveAccountBody,
  CadenceChannel,
  CadenceRecipients,
  CadenceStep,
  CadenceTone,
  ChaseStatus,
  ContactPip,
  ContactTier,
  CreateContactBody,
  EnsureAccountsResult,
  EscalationContact,
  PauseAccountBody,
  UpdateChasingSettingsBody,
  UpdateContactBody,
  UpdateEscalationBody,
} from "@/lib/schemas/accounts";
import { updateChasingSettingsBodySchema } from "@/lib/schemas/accounts";
import { CHASE_STATUS_LABEL } from "@/lib/services/accounts-rules";
import { dncReasonIsPresent } from "@/lib/schemas/accounts";

/**
 * Fixture data for `VITE_USE_MOCKS=true`, figures from `docs/accounts-spec.md`.
 *
 * Mutations below mutate `mockStore` and return the full updated resource so
 * optimistic-update paths can be exercised without a backend.
 */

/** Matches dashboard chase-queue IDs where the same account appears. */
export const ACCOUNT_IDS = {
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

const USER_IDS = {
  priya: "a5e70001-0000-4000-8000-000000000001",
  amit: "a5e70001-0000-4000-8000-000000000002",
  neha: "a5e70001-0000-4000-8000-000000000003",
} as const;

const ASSIGNABLE_OWNERS = [
  { id: USER_IDS.priya, name: "Priya Nair" },
  { id: USER_IDS.amit, name: "Amit Desai" },
  { id: USER_IDS.neha, name: "Neha Kapoor" },
] as const;

const DEFAULT_SEND_WINDOW = {
  opens_at: "10:00",
  closes_at: "18:00",
  days: ["Mon", "Tue", "Wed", "Thu", "Fri"] as const,
};

const EARLY_ALLOWED_CHANNELS: CadenceChannel[] = ["email", "whatsapp", "both"];
const LATE_ALLOWED_CHANNELS: CadenceChannel[] = ["email", "whatsapp", "both", "voice"];

function cadenceStep(
  key: string,
  label: string,
  tone: CadenceTone,
  channel: CadenceChannel,
  recipients: CadenceRecipients,
  needsApproval: boolean,
  late: boolean,
): CadenceStep {
  return {
    key,
    label,
    tone,
    channel,
    recipients,
    needs_approval: needsApproval,
    allowed_channels: late ? [...LATE_ALLOWED_CHANNELS] : [...EARLY_ALLOWED_CHANNELS],
  };
}

/** Org default cadence — Sharma's `default_steps` copy. */
const ORG_DEFAULT_STEPS: CadenceStep[] = [
  cadenceStep("s1", "−3 days", "Gentle", "email", "p0", false, false),
  cadenceStep("s2", "Due date", "Standard", "both", "p0", false, false),
  cadenceStep("s3", "+7", "Standard", "both", "p0p1", false, false),
  cadenceStep("s4", "+14", "Standard", "email", "p0p1", false, false),
  cadenceStep("s5", "+30", "Firm", "email", "p0p1p2", false, true),
  cadenceStep("s6", "+45", "Firm", "email", "p0p1p2", true, true),
];

/** Sharma custom overrides — differs from org default on s3 (tone + channel) and s5 (channel). */
const SHARMA_CUSTOM_STEPS: CadenceStep[] = [
  cadenceStep("s1", "−3 days", "Gentle", "email", "p0", true, false),
  cadenceStep("s2", "Due date", "Standard", "both", "p0", true, false),
  cadenceStep("s3", "+7", "Firm", "whatsapp", "p0p1", true, false),
  cadenceStep("s4", "+14", "Standard", "email", "p0p1", true, false),
  cadenceStep("s5", "+30", "Firm", "both", "p0p1p2", true, true),
  cadenceStep("s6", "+45", "Firm", "email", "p0p1p2", true, true),
];

const SHARMA_ESCALATION_CONTACTS: EscalationContact[] = [
  { tier: "P0", name: "Rajat Mehta", detail: "Accounts executive · Email, WhatsApp" },
  { tier: "P1", name: "Rajesh Sharma", detail: "Finance head · Email" },
  { tier: "P2", name: null, detail: "Owner or director" },
];

function cloneSteps(steps: readonly CadenceStep[]): CadenceStep[] {
  return steps.map((step) => ({ ...step, allowed_channels: [...step.allowed_channels] }));
}

function makeChasingSettings({
  paused_at = null,
  pause_reason = null,
  paused_until = null,
  ...rest
}: Partial<AccountChasingSettings> = {}): AccountChasingSettings {
  const defaultSteps = cloneSteps(ORG_DEFAULT_STEPS);
  return {
    chase_mode: "default",
    steps: cloneSteps(ORG_DEFAULT_STEPS),
    default_steps: defaultSteps,
    default_summary: "6 steps, −3 days to +45, email and WhatsApp",
    stop_reason: null,
    stop_note: null,
    send_window_mode: "default",
    send_window: {
      opens_at: DEFAULT_SEND_WINDOW.opens_at,
      closes_at: DEFAULT_SEND_WINDOW.closes_at,
      days: [...DEFAULT_SEND_WINDOW.days],
    },
    default_send_window: {
      opens_at: DEFAULT_SEND_WINDOW.opens_at,
      closes_at: DEFAULT_SEND_WINDOW.closes_at,
      days: [...DEFAULT_SEND_WINDOW.days],
    },
    terms_preset: "net_30",
    term_days: 30,
    is_msme: false,
    tds_section: "None",
    tds_rate: null,
    owner_user_id: USER_IDS.priya,
    owner_name: "Priya Nair",
    assignable_owners: [...ASSIGNABLE_OWNERS],
    notes: null,
    escalation_contacts: [],
    can_edit: true,
    archived_at: null,
    paused_at,
    pause_reason,
    paused_until,
    ...rest,
  };
}

export const CONTACT_IDS = {
  rajat: "c0c00001-0000-4000-8000-000000000001",
  rajesh: "c0c00002-0000-4000-8000-000000000002",
  rsharma: "c0c00003-0000-4000-8000-000000000003",
  kaveriP1: "c0c00004-0000-4000-8000-000000000004",
  kaveriP2: "c0c00005-0000-4000-8000-000000000005",
} as const;

const INVOICE_IDS = {
  inv2301: "d0c00010-0000-4000-8000-000000002301",
  inv2288: "d0c00011-0000-4000-8000-000000002288",
  inv2240: "d0c00012-0000-4000-8000-000000002240",
  inv2231: "d0c00013-0000-4000-8000-000000002231",
  inv2180: "d0c00014-0000-4000-8000-000000002180",
  inv2166: "d0c00015-0000-4000-8000-000000002166",
  inv2104: "d0c00016-0000-4000-8000-000000002104",
  inv2015: "d0c00017-0000-4000-8000-000000002015",
  inv2008: "d0c00018-0000-4000-8000-000000002008",
  inv1042: "d0c00020-0000-4000-8000-000000001042",
  inv1041: "d0c00021-0000-4000-8000-000000001041",
  inv1040: "d0c00022-0000-4000-8000-000000001040",
  inv1038: "d0c00023-0000-4000-8000-000000001038",
  inv1026: "d0c00024-0000-4000-8000-000000001026",
  inv1019: "d0c00025-0000-4000-8000-000000001019",
} as const;

const PAYMENT_IDS = {
  p1: "a0f00001-0000-4000-8000-000000000001",
  p2: "a0f00002-0000-4000-8000-000000000002",
  p3: "a0f00003-0000-4000-8000-000000000003",
  p4: "a0f00004-0000-4000-8000-000000000004",
  p5: "a0f00005-0000-4000-8000-000000000005",
} as const;

const ACTIVITY_IDS = {
  a1: "a0700001-0000-4000-8000-000000000001",
  a2: "a0700002-0000-4000-8000-000000000002",
  a3: "a0700003-0000-4000-8000-000000000003",
  a4: "a0700004-0000-4000-8000-000000000004",
  a5: "a0700005-0000-4000-8000-000000000005",
  a6: "a0700006-0000-4000-8000-000000000006",
  a7: "a0700007-0000-4000-8000-000000000007",
} as const;

/** Spec reference date: Monday 17 August 2026. */
const AS_OF = "2026-08-17T09:12:00+05:30";
const UPDATED_AT = "2026-08-17T09:12:00+05:30";
const SYNCED_TWO_DAYS_AGO = "2026-08-15T09:12:00+05:30";
const BOUNCED_NINE_DAYS_AGO = "2026-08-08T11:00:00+05:30";

/** Sharma Traders — custom cadence with two steps diverging from org default. */
export const sharmaChasingSettingsFixture: AccountChasingSettings = {
  chase_mode: "custom",
  steps: cloneSteps(SHARMA_CUSTOM_STEPS),
  default_steps: cloneSteps(ORG_DEFAULT_STEPS),
  default_summary: "6 steps, −3 days to +45, email and WhatsApp",
  stop_reason: null,
  stop_note: null,
  send_window_mode: "default",
  send_window: {
    opens_at: DEFAULT_SEND_WINDOW.opens_at,
    closes_at: DEFAULT_SEND_WINDOW.closes_at,
    days: [...DEFAULT_SEND_WINDOW.days],
  },
  default_send_window: {
    opens_at: DEFAULT_SEND_WINDOW.opens_at,
    closes_at: DEFAULT_SEND_WINDOW.closes_at,
    days: [...DEFAULT_SEND_WINDOW.days],
  },
  terms_preset: "net_30",
  term_days: 30,
  is_msme: false,
  tds_section: "194J",
  tds_rate: 10,
  owner_user_id: USER_IDS.priya,
  owner_name: "Priya Nair",
  assignable_owners: [...ASSIGNABLE_OWNERS],
  notes: null,
  escalation_contacts: SHARMA_ESCALATION_CONTACTS,
  can_edit: true,
  archived_at: null,
  paused_at: BOUNCED_NINE_DAYS_AGO,
  pause_reason: "Other",
  paused_until: null,
};

/** Kaveri & Sons — read-only settings for the no-admin lock state. */
export const kaveriNoAdminChasingSettingsFixture: AccountChasingSettings = makeChasingSettings({
  can_edit: false,
  escalation_contacts: [
    { tier: "P1", name: "Suresh Kaveri", detail: "Partner · Email" },
    { tier: "P2", name: "Meera Kaveri", detail: "Operations · Email" },
  ],
});

const CHASE_DISABLED_BOUNCE = "Can't chase — Rajat Mehta's email is bouncing";

const ORG_TOTALS = {
  account_count: 47,
  outstanding: "5000000.00",
  overdue: "2800000.00",
} as const;

/** Spec §1 — the twelve visible rows, outstanding desc. */
export const accountListItemsFixture: AccountListItem[] = [
  {
    account_id: ACCOUNT_IDS.meridian,
    name: "Meridian Industries Pvt Ltd",
    outstanding: "620000.00",
    overdue: "460000.00",
    open_count: 3,
    oldest_overdue_days: 38,
    avg_days_late: 29,
    contacts: { p0: "present", p1: "present", p2: "missing" },
    chase_status: "active",
    status_label: "Active",
  },
  {
    account_id: ACCOUNT_IDS.sharma,
    name: "Sharma Traders Pvt Ltd",
    outstanding: "482000.00",
    overdue: "310000.00",
    open_count: 9,
    oldest_overdue_days: 94,
    avg_days_late: 34,
    contacts: { p0: "bounced", p1: "present", p2: "present" },
    chase_status: "bounced_p0",
    status_label: "Can't chase",
  },
  {
    account_id: ACCOUNT_IDS.nimbus,
    name: "Nimbus Creative LLP",
    outstanding: "415000.00",
    overdue: "280000.00",
    open_count: 2,
    oldest_overdue_days: 40,
    avg_days_late: 41,
    contacts: { p0: "present", p1: "present", p2: "missing" },
    chase_status: "active",
    status_label: "Active",
  },
  {
    account_id: ACCOUNT_IDS.shakti,
    name: "Shakti Engineering Pvt Ltd",
    outstanding: "390000.00",
    overdue: "240000.00",
    open_count: 3,
    oldest_overdue_days: 52,
    avg_days_late: 47,
    contacts: { p0: "present", p1: "present", p2: "present" },
    chase_status: "active",
    status_label: "Active",
  },
  {
    account_id: ACCOUNT_IDS.bhavani,
    name: "Bhavani Traders",
    outstanding: "345000.00",
    overdue: "0.00",
    open_count: 2,
    oldest_overdue_days: null,
    avg_days_late: 12,
    contacts: { p0: "present", p1: "missing", p2: "missing" },
    chase_status: "active",
    status_label: "Active",
  },
  {
    account_id: ACCOUNT_IDS.kaveri,
    name: "Kaveri & Sons",
    outstanding: "295000.00",
    overdue: "180000.00",
    open_count: 2,
    oldest_overdue_days: 67,
    avg_days_late: 52,
    contacts: { p0: "missing", p1: "present", p2: "present" },
    chase_status: "no_p0",
    status_label: "Can't chase",
  },
  {
    account_id: ACCOUNT_IDS.vertex,
    name: "Vertex Labs Pvt Ltd",
    outstanding: "260000.00",
    overdue: "140000.00",
    open_count: 2,
    oldest_overdue_days: 38,
    avg_days_late: 22,
    contacts: { p0: "present", p1: "present", p2: "missing" },
    chase_status: "active",
    status_label: "Active",
  },
  {
    account_id: ACCOUNT_IDS.sundaram,
    name: "Sundaram Industries Pvt Ltd",
    outstanding: "220000.00",
    overdue: "165000.00",
    open_count: 2,
    oldest_overdue_days: 71,
    avg_days_late: 58,
    contacts: { p0: "missing", p1: "present", p2: "missing" },
    chase_status: "no_p0",
    status_label: "Can't chase",
  },
  {
    account_id: ACCOUNT_IDS.raghav,
    name: "Raghav & Co Traders",
    outstanding: "185000.00",
    overdue: "62000.00",
    open_count: 2,
    oldest_overdue_days: 15,
    avg_days_late: 18,
    contacts: { p0: "present", p1: "missing", p2: "missing" },
    chase_status: "active",
    status_label: "Active",
  },
  {
    account_id: ACCOUNT_IDS.anand,
    name: "Anand & Sons Traders",
    outstanding: "160000.00",
    overdue: "95000.00",
    open_count: 2,
    oldest_overdue_days: 12,
    avg_days_late: 21,
    contacts: { p0: "present", p1: "present", p2: "missing" },
    chase_status: "active",
    status_label: "Active",
  },
  {
    account_id: ACCOUNT_IDS.coral,
    name: "Coral Bay Creative",
    outstanding: "140000.00",
    overdue: "0.00",
    open_count: 1,
    oldest_overdue_days: null,
    avg_days_late: 8,
    contacts: { p0: "present", p1: "missing", p2: "missing" },
    chase_status: "paused",
    status_label: "Paused",
  },
  {
    account_id: ACCOUNT_IDS.pinnacle,
    name: "Pinnacle Industries LLP",
    outstanding: "125000.00",
    overdue: "62000.00",
    open_count: 1,
    oldest_overdue_days: 9,
    avg_days_late: 14,
    contacts: { p0: "present", p1: "missing", p2: "missing" },
    chase_status: "active",
    status_label: "Active",
  },
];

export const accountsListFixture: AccountsList = {
  total_count: 47,
  filtered_count: 12,
  filtered_outstanding: "3637000.00",
  filtered_overdue: "1994000.00",
  org_totals: { ...ORG_TOTALS },
  items: accountListItemsFixture,
};

/** Spec §2 — Sharma Traders detail. */
export const sharmaDetailFixture: AccountDetail = {
  account_id: ACCOUNT_IDS.sharma,
  name: "Sharma Traders Pvt Ltd",
  outstanding: "482000.00",
  overdue: "310000.00",
  open_count: 9,
  oldest_overdue_days: 94,
  avg_days_late: 34,
  chase_status: "bounced_p0",
  status_label: "Can't chase",
  header_status: "Chasing paused — email bouncing",
  last_synced_at: SYNCED_TWO_DAYS_AGO,
  updated_at: UPDATED_AT,
  aging: [
    { bucket: "Not yet due", amount: "172000.00", share_pct: 35.7 },
    { bucket: "1–30", amount: "94000.00", share_pct: 19.5 },
    { bucket: "31–60", amount: "116000.00", share_pct: 24.1 },
    { bucket: "61–90", amount: "52000.00", share_pct: 10.8 },
    { bucket: "90+", amount: "48000.00", share_pct: 9.9 },
  ],
  settings: structuredClone(sharmaChasingSettingsFixture),
  recommendation: null,
};

/** Spec §3 — nine invoices grouped by aging bucket. */
export const sharmaInvoicesFixture: AccountInvoices = {
  account_id: ACCOUNT_IDS.sharma,
  groups: [
    {
      bucket: "Not yet due",
      subtotal: "172000.00",
      invoices: [
        {
          invoice_id: INVOICE_IDS.inv2301,
          number: "INV-2301",
          invoice_date: "2026-08-06",
          due_date: "2026-09-05",
          days_overdue: 0,
          amount_outstanding: "100000.00",
          status: "Not yet due",
          chase_disabled_reason: CHASE_DISABLED_BOUNCE,
        },
        {
          invoice_id: INVOICE_IDS.inv2288,
          number: "INV-2288",
          invoice_date: "2026-07-31",
          due_date: "2026-08-30",
          days_overdue: 0,
          amount_outstanding: "72000.00",
          status: "Not yet due",
          chase_disabled_reason: CHASE_DISABLED_BOUNCE,
        },
      ],
    },
    {
      bucket: "1–30",
      subtotal: "94000.00",
      invoices: [
        {
          invoice_id: INVOICE_IDS.inv2240,
          number: "INV-2240",
          invoice_date: "2026-07-03",
          due_date: "2026-08-02",
          days_overdue: 15,
          amount_outstanding: "54000.00",
          status: "Promised",
          chase_disabled_reason: CHASE_DISABLED_BOUNCE,
        },
        {
          invoice_id: INVOICE_IDS.inv2231,
          number: "INV-2231",
          invoice_date: "2026-06-26",
          due_date: "2026-07-26",
          days_overdue: 22,
          amount_outstanding: "40000.00",
          status: "Partially paid",
          chase_disabled_reason: CHASE_DISABLED_BOUNCE,
        },
      ],
    },
    {
      bucket: "31–60",
      subtotal: "116000.00",
      invoices: [
        {
          invoice_id: INVOICE_IDS.inv2180,
          number: "INV-2180",
          invoice_date: "2026-06-05",
          due_date: "2026-07-05",
          days_overdue: 43,
          amount_outstanding: "68000.00",
          status: "Open",
          chase_disabled_reason: CHASE_DISABLED_BOUNCE,
        },
        {
          invoice_id: INVOICE_IDS.inv2166,
          number: "INV-2166",
          invoice_date: "2026-05-29",
          due_date: "2026-06-28",
          days_overdue: 50,
          amount_outstanding: "48000.00",
          status: "Open",
          chase_disabled_reason: CHASE_DISABLED_BOUNCE,
        },
      ],
    },
    {
      bucket: "61–90",
      subtotal: "52000.00",
      invoices: [
        {
          invoice_id: INVOICE_IDS.inv2104,
          number: "INV-2104",
          invoice_date: "2026-05-07",
          due_date: "2026-06-06",
          days_overdue: 72,
          amount_outstanding: "52000.00",
          status: "Open",
          chase_disabled_reason: CHASE_DISABLED_BOUNCE,
        },
      ],
    },
    {
      bucket: "90+",
      subtotal: "48000.00",
      invoices: [
        {
          invoice_id: INVOICE_IDS.inv2015,
          number: "INV-2015",
          invoice_date: "2026-04-21",
          due_date: "2026-05-21",
          days_overdue: 94,
          amount_outstanding: "30000.00",
          status: "Open",
          chase_disabled_reason: CHASE_DISABLED_BOUNCE,
        },
        {
          invoice_id: INVOICE_IDS.inv2008,
          number: "INV-2008",
          invoice_date: "2026-04-24",
          due_date: "2026-05-24",
          days_overdue: 91,
          amount_outstanding: "18000.00",
          status: "Open",
          chase_disabled_reason: CHASE_DISABLED_BOUNCE,
        },
      ],
    },
  ],
};

/** Spec §4 — three contacts on Sharma's ladder. */
export const sharmaContactsFixture: AccountContacts = {
  account_id: ACCOUNT_IDS.sharma,
  updated_at: UPDATED_AT,
  p1_after_days: 21,
  p2_after_days: 45,
  contacts: [
    {
      contact_id: CONTACT_IDS.rajat,
      tier: "P0",
      name: "Rajat Mehta",
      designation: "Accounts Executive",
      email: "rajat@sharmatraders.com",
      phone: "+91 98••• •••21",
      channel_email: true,
      channel_whatsapp: false,
      channel_sms: false,
      always_cc: false,
      do_not_contact: false,
      dnc_reason: null,
      language: "en",
      delivery_state: "bounced",
      last_bounced_at: BOUNCED_NINE_DAYS_AGO,
      last_contacted_at: null,
      sort_order: 0,
      updated_at: UPDATED_AT,
    },
    {
      contact_id: CONTACT_IDS.rajesh,
      tier: "P1",
      name: "Rajesh Kumar",
      designation: "Finance Manager",
      email: "rajesh@sharmatraders.com",
      phone: "+91 99••• •••04",
      channel_email: true,
      channel_whatsapp: false,
      channel_sms: false,
      always_cc: false,
      do_not_contact: false,
      dnc_reason: null,
      language: "en",
      delivery_state: "verified",
      last_bounced_at: null,
      last_contacted_at: null,
      sort_order: 0,
      updated_at: UPDATED_AT,
    },
    {
      contact_id: CONTACT_IDS.rsharma,
      tier: "P2",
      name: "Mr. R. Sharma",
      designation: "Director",
      email: "rsharma@sharmatraders.com",
      phone: "+91 98••• •••77",
      channel_email: true,
      channel_whatsapp: false,
      channel_sms: false,
      always_cc: false,
      do_not_contact: false,
      dnc_reason: null,
      language: "en",
      delivery_state: "verified",
      last_bounced_at: null,
      last_contacted_at: null,
      sort_order: 0,
      updated_at: UPDATED_AT,
    },
  ],
};

/** Sharma Traders — five payments; ₹8,000.00 unapplied on the Statement receipt. */
export const sharmaPaymentsFixture: AccountPayments = {
  stats: {
    received_90d: "618000.00",
    unapplied_total: "8000.00",
    average_delay_days: 34,
  },
  items: [
    {
      payment_id: PAYMENT_IDS.p1,
      date: "2026-08-08",
      source: "Bank alert",
      reference: "UTR HDFC0004521XXXXX",
      amount: "108000.00",
      applied_to: "INV-1041",
      is_applied: true,
      status_label: "TDS shortfall ₹10,000.00",
      status_tone: "warn",
      action_label: "Adjust",
      action_kind: "adjust",
      allocations: [
        {
          invoice_id: INVOICE_IDS.inv1041,
          invoice_number: "INV-1041",
          amount: "108000.00",
        },
      ],
    },
    {
      payment_id: PAYMENT_IDS.p2,
      date: "2026-07-24",
      source: "Bank alert",
      reference: "UTR ICIC0009812XXXXX",
      amount: "200000.00",
      applied_to: "INV-1038, INV-1040",
      is_applied: true,
      status_label: "Settled in full",
      status_tone: "muted",
      action_label: "View split",
      action_kind: "view_split",
      allocations: [
        {
          invoice_id: INVOICE_IDS.inv1038,
          invoice_number: "INV-1038",
          amount: "100000.00",
        },
        {
          invoice_id: INVOICE_IDS.inv1040,
          invoice_number: "INV-1040",
          amount: "100000.00",
        },
      ],
    },
    {
      payment_id: PAYMENT_IDS.p3,
      date: "2026-07-11",
      source: "Manual",
      reference: "Cheque 448120",
      amount: "140000.00",
      applied_to: "INV-1026",
      is_applied: true,
      status_label: "Settled in full",
      status_tone: "muted",
      action_label: "View split",
      action_kind: "view_split",
      allocations: [
        {
          invoice_id: INVOICE_IDS.inv1026,
          invoice_number: "INV-1026",
          amount: "140000.00",
        },
      ],
    },
    {
      payment_id: PAYMENT_IDS.p4,
      date: "2026-07-02",
      source: "Bank alert",
      reference: "UTR HDFC0004102XXXXX",
      amount: "162000.00",
      applied_to: "INV-1019",
      is_applied: true,
      status_label: "Settled in full",
      status_tone: "muted",
      action_label: "View split",
      action_kind: "view_split",
      allocations: [
        {
          invoice_id: INVOICE_IDS.inv1019,
          invoice_number: "INV-1019",
          amount: "162000.00",
        },
      ],
    },
    {
      payment_id: PAYMENT_IDS.p5,
      date: "2026-06-19",
      source: "Statement",
      reference: "NEFT — no remitter name",
      amount: "8000.00",
      applied_to: "Not applied",
      is_applied: false,
      status_label: "Held as credit · needs review",
      status_tone: "danger",
      action_label: "Allocate",
      action_kind: "allocate",
      allocations: [],
    },
  ],
};

/** Sharma Traders — seven activity entries, reverse chronological. */
export const sharmaActivityFixture: AccountActivity = {
  account_id: ACCOUNT_IDS.sharma,
  items: [
    {
      activity_id: ACTIVITY_IDS.a1,
      kind: "message_sent",
      when_label: "Today · 09:12",
      occurred_at: "2026-08-17T09:12:00+05:30",
      title: "Standard reminder sent to Rajat Mehta",
      title_tone: "neutral",
      detail: "Invoice INV-1042 — ₹54,000.00. Delivered 09:13.",
      link_label: null,
      link_href: null,
    },
    {
      activity_id: ACTIVITY_IDS.a2,
      kind: "promise_made",
      when_label: "12 Aug · 16:40",
      occurred_at: "2026-08-12T16:40:00+05:30",
      title: "Promised 22 Aug 2026",
      title_tone: "warn",
      detail:
        "Rajat Mehta committed to ₹54,000.00 from the debtor page. Reminders paused until then.",
      link_label: null,
      link_href: null,
    },
    {
      activity_id: ACTIVITY_IDS.a3,
      kind: "payment_received",
      when_label: "08 Aug · 11:02",
      occurred_at: "2026-08-08T11:02:00+05:30",
      title: "Payment received — ₹1,08,000.00",
      title_tone: "neutral",
      detail: "Against INV-1041. ₹10,000.00 shortfall explained as 194J TDS.",
      link_label: null,
      link_href: null,
    },
    {
      activity_id: ACTIVITY_IDS.a4,
      kind: "bounce",
      when_label: "05 Aug · 09:00",
      occurred_at: "2026-08-05T09:00:00+05:30",
      title: "Email bounced",
      title_tone: "danger",
      detail: "priya@sharmatraders.com is no longer valid. Replaced with rajat@sharmatraders.com.",
      link_label: "Open contacts",
      link_href: `/app/accounts/${ACCOUNT_IDS.sharma}?tab=contacts`,
    },
    {
      activity_id: ACTIVITY_IDS.a5,
      kind: "message_sent",
      when_label: "02 Aug · 15:20",
      occurred_at: "2026-08-02T15:20:00+05:30",
      title: "Send window overridden",
      title_tone: "neutral",
      detail: "Priya Nair set a 9 AM–2 PM window for this account.",
      link_label: "Open settings",
      link_href: `/app/accounts/${ACCOUNT_IDS.sharma}?tab=settings`,
    },
    {
      activity_id: ACTIVITY_IDS.a6,
      kind: "import",
      when_label: "28 Jul · 10:44",
      occurred_at: "2026-07-28T10:44:00+05:30",
      title: "9 invoices imported from Tally",
      title_tone: "neutral",
      detail: "₹4,82,000.00 total.",
      link_label: null,
      link_href: null,
    },
    {
      activity_id: ACTIVITY_IDS.a7,
      kind: "invoice_created",
      when_label: "19 Jun · 12:05",
      occurred_at: "2026-06-19T12:05:00+05:30",
      title: "Account created",
      title_tone: "neutral",
      detail: "From the first Tally import. GSTIN 27AAECS4321B1Z9.",
      link_label: null,
      link_href: null,
    },
  ],
};

/** Kaveri & Sons — no usable P0. */
export const kaveriDetailFixture: AccountDetail = {
  account_id: ACCOUNT_IDS.kaveri,
  name: "Kaveri & Sons",
  outstanding: "295000.00",
  overdue: "180000.00",
  open_count: 2,
  oldest_overdue_days: 67,
  avg_days_late: 52,
  chase_status: "no_p0",
  status_label: "Can't chase",
  header_status: "Can't chase — no primary contact",
  last_synced_at: SYNCED_TWO_DAYS_AGO,
  updated_at: UPDATED_AT,
  aging: [
    { bucket: "Not yet due", amount: "115000.00", share_pct: 39.0 },
    { bucket: "1–30", amount: "0.00", share_pct: 0.0 },
    { bucket: "31–60", amount: "0.00", share_pct: 0.0 },
    { bucket: "61–90", amount: "180000.00", share_pct: 61.0 },
    { bucket: "90+", amount: "0.00", share_pct: 0.0 },
  ],
  settings: structuredClone(kaveriNoAdminChasingSettingsFixture),
  recommendation: null,
};

export const kaveriContactsFixture: AccountContacts = {
  account_id: ACCOUNT_IDS.kaveri,
  updated_at: UPDATED_AT,
  p1_after_days: 21,
  p2_after_days: 45,
  contacts: [
    {
      contact_id: CONTACT_IDS.kaveriP1,
      tier: "P1",
      name: "Suresh Kaveri",
      designation: "Partner",
      email: "suresh@kaverisons.com",
      phone: "+91 98••• •••55",
      channel_email: true,
      channel_whatsapp: false,
      channel_sms: false,
      always_cc: false,
      do_not_contact: false,
      dnc_reason: null,
      language: "en",
      delivery_state: "verified",
      last_bounced_at: null,
      last_contacted_at: null,
      sort_order: 0,
      updated_at: UPDATED_AT,
    },
    {
      contact_id: CONTACT_IDS.kaveriP2,
      tier: "P2",
      name: "Meena Kaveri",
      designation: "Partner",
      email: "meena@kaverisons.com",
      phone: "+91 98••• •••56",
      channel_email: true,
      channel_whatsapp: false,
      channel_sms: false,
      always_cc: false,
      do_not_contact: false,
      dnc_reason: null,
      language: "en",
      delivery_state: "verified",
      last_bounced_at: null,
      last_contacted_at: null,
      sort_order: 0,
      updated_at: UPDATED_AT,
    },
  ],
};

/** Empty invoices state — named for Bhavani per the empty-copy example. */
export const bhavaniEmptyInvoicesFixture: AccountInvoices = {
  account_id: ACCOUNT_IDS.bhavani,
  groups: [],
};

export const filteredEmptyAccountsFixture: AccountsList = {
  total_count: 47,
  filtered_count: 0,
  filtered_outstanding: "0.00",
  filtered_overdue: "0.00",
  org_totals: { ...ORG_TOTALS },
  items: [],
};

export const accountsUnavailableFixture: ApiError = {
  error: {
    code: "accounts_unavailable",
    message: "Couldn't load your accounts.",
  },
};

/**
 * Spec §1 overflow: exactly 60 characters — a test asserts the length, so
 * don't tidy the wording without recounting.
 */
export const LONG_ACCOUNT_NAME = "Brahmaputra Infrastructure & Allied Engineering Services Ltd";

export const longAccountNameListFixture: AccountsList = {
  ...accountsListFixture,
  items: accountListItemsFixture.map((item, index) =>
    index === 0 ? { ...item, name: LONG_ACCOUNT_NAME } : item,
  ),
};

// ---------------------------------------------------------------------------
// Mutable mock store — seeded from fixtures; mutations write here.
// ---------------------------------------------------------------------------

type MockStore = {
  list: AccountsList;
  /** Rows under Accounts → Archived. Moved here by archive, back by restore. */
  archived: AccountListItem[];
  details: Record<string, AccountDetail>;
  invoices: Record<string, AccountInvoices>;
  contacts: Record<string, AccountContacts>;
  payments: Record<string, AccountPayments>;
  activity: Record<string, AccountActivity>;
};

/** A fresh copy of every fixture, so each reset starts from the same state. */
function seedStore(): MockStore {
  return {
    list: structuredClone(accountsListFixture),
    archived: [],
    details: {
      [ACCOUNT_IDS.sharma]: structuredClone(sharmaDetailFixture),
      [ACCOUNT_IDS.kaveri]: structuredClone(kaveriDetailFixture),
    },
    invoices: {
      [ACCOUNT_IDS.sharma]: structuredClone(sharmaInvoicesFixture),
      [ACCOUNT_IDS.bhavani]: structuredClone(bhavaniEmptyInvoicesFixture),
    },
    contacts: {
      [ACCOUNT_IDS.sharma]: structuredClone(sharmaContactsFixture),
      [ACCOUNT_IDS.kaveri]: structuredClone(kaveriContactsFixture),
    },
    payments: {
      [ACCOUNT_IDS.sharma]: structuredClone(sharmaPaymentsFixture),
    },
    activity: {
      [ACCOUNT_IDS.sharma]: structuredClone(sharmaActivityFixture),
    },
  };
}

let mockStore = seedStore();

export function resetAccountsMocks(): void {
  mockStore = seedStore();
}

/**
 * The list for one view. `org_totals` stays the live book in both views —
 * archived accounts are out of every total.
 */
export function getMockAccountsList(view: AccountsView = "active"): AccountsList {
  if (view === "active") return structuredClone(mockStore.list);
  const items = structuredClone(mockStore.archived);
  return { ...structuredClone(mockStore.list), total_count: items.length, items };
}

/** The stored detail, or one synthesized from a list row (active or archived). */
export function getMockAccountDetail(accountId: string): AccountDetail | undefined {
  const detail = mockStore.details[accountId];
  if (detail) return structuredClone(detail);

  const listItem = [...mockStore.list.items, ...mockStore.archived].find(
    (item) => item.account_id === accountId,
  );
  if (!listItem) return undefined;
  return synthesizeDetailFromListItem(listItem);
}

/** The account's chase status as the store currently holds it. */
function currentChaseStatus(accountId: string): ChaseStatus | null {
  const row = [...mockStore.list.items, ...mockStore.archived].find(
    (item) => item.account_id === accountId,
  );
  return row?.chase_status ?? mockStore.details[accountId]?.chase_status ?? null;
}

/**
 * Applies the account-level chase reason over each invoice's own.
 *
 * Derived on read rather than written into the store, which is what the real
 * API does and the only way the two reasons can both survive: an account-level
 * reason wins while it applies, and the invoice's own ("Disputed", "Promised")
 * is still there underneath when the account becomes chaseable again. Writing
 * the account reason into the rows would overwrite that fact and lose it.
 */
function withAccountChaseReasons(accountId: string, invoices: AccountInvoices): AccountInvoices {
  const status = currentChaseStatus(accountId);
  if (status === null) return invoices;
  const accountReason = accountChaseDisabledReason(status, mockStore.contacts[accountId]);

  return {
    ...invoices,
    groups: invoices.groups.map((group) => ({
      ...group,
      invoices: group.invoices.map((invoice) => {
        // A stored account-level reason is the fixture's snapshot of this same
        // derivation, not something the invoice owns.
        const own = isAccountLevelChaseReason(invoice.chase_disabled_reason)
          ? null
          : invoice.chase_disabled_reason;
        return { ...invoice, chase_disabled_reason: accountReason ?? own };
      }),
    })),
  };
}

/** The stored invoice groups, with the account-level chase reason applied over each row. */
export function getMockAccountInvoices(accountId: string): AccountInvoices | undefined {
  const invoices = mockStore.invoices[accountId];
  if (invoices) return structuredClone(withAccountChaseReasons(accountId, invoices));

  // Account exists but has no invoice fixture yet — empty groups, not a 404.
  if (accountExists(accountId)) {
    return { account_id: accountId, groups: [] };
  }
  return undefined;
}

/** True for any account the mock knows, including archived ones. */
function accountExists(accountId: string): boolean {
  return (
    accountId in mockStore.details ||
    mockStore.list.items.some((item) => item.account_id === accountId) ||
    mockStore.archived.some((item) => item.account_id === accountId)
  );
}

/**
 * List-only accounts still need a detail payload so row links work. Full tab
 * fixtures (nine invoices, contacts, …) stay on Sharma / Kaveri / Bhavani.
 */
function synthesizeDetailFromListItem(item: AccountListItem): AccountDetail {
  const currentCents = moneyToCents(item.outstanding) - moneyToCents(item.overdue);
  const current = centsToMoney(currentCents < 0n ? 0n : currentCents);
  const overdue = item.overdue;
  const total = Number(item.outstanding);
  const share = (amount: string) =>
    total > 0 ? Math.round((Number(amount) / total) * 1000) / 10 : 0;

  return {
    account_id: item.account_id,
    name: item.name,
    outstanding: item.outstanding,
    overdue: item.overdue,
    open_count: item.open_count,
    oldest_overdue_days: item.oldest_overdue_days,
    avg_days_late: item.avg_days_late,
    chase_status: item.chase_status,
    status_label: item.status_label,
    header_status: headerStatusFor(item),
    last_synced_at: SYNCED_TWO_DAYS_AGO,
    updated_at: UPDATED_AT,
    aging: [
      { bucket: "Not yet due", amount: current, share_pct: share(current) },
      { bucket: "1–30", amount: "0.00", share_pct: 0 },
      { bucket: "31–60", amount: overdue, share_pct: share(overdue) },
      { bucket: "61–90", amount: "0.00", share_pct: 0 },
      { bucket: "90+", amount: "0.00", share_pct: 0 },
    ],
    settings: makeChasingSettings({
      paused_at: item.chase_status === "paused" ? SYNCED_TWO_DAYS_AGO : null,
      pause_reason: item.chase_status === "paused" ? "Other" : null,
    }),
    recommendation: null,
  };
}

/** The header line for a chase status, as the backend composes it. */
function headerStatusFor(item: { chase_status: ChaseStatus }): string {
  switch (item.chase_status) {
    case "bounced_p0":
      return "Chasing paused — email bouncing";
    case "no_p0":
      return "Can't chase — no primary contact";
    case "paused":
      return "Chasing paused";
    case "active":
      return "Active";
  }
}

function moneyToCents(value: string): bigint {
  const [rupees, paise = "0"] = value.split(".");
  return BigInt(rupees ?? "0") * 100n + BigInt(paise.padEnd(2, "0").slice(0, 2));
}

function centsToMoney(cents: bigint): string {
  const sign = cents < 0n ? "-" : "";
  const abs = cents < 0n ? -cents : cents;
  const rupees = abs / 100n;
  const paise = abs % 100n;
  return `${sign}${rupees}.${paise.toString().padStart(2, "0")}`;
}

export function getMockAccountContacts(accountId: string): AccountContacts | undefined {
  const contacts = mockStore.contacts[accountId];
  if (contacts) return structuredClone(contacts);
  if (accountExists(accountId)) {
    return {
      account_id: accountId,
      updated_at: UPDATED_AT,
      p1_after_days: 21,
      p2_after_days: 45,
      contacts: [],
    };
  }
  return undefined;
}

export function getMockAccountPayments(accountId: string): AccountPayments | undefined {
  const payments = mockStore.payments[accountId];
  if (payments) return structuredClone(payments);
  if (accountExists(accountId)) {
    return {
      stats: {
        received_90d: "0.00",
        unapplied_total: "0.00",
        average_delay_days: null,
      },
      items: [],
    };
  }
  return undefined;
}

export function getMockAccountActivity(
  accountId: string,
  limit?: number,
): AccountActivity | undefined {
  const activity = mockStore.activity[accountId];
  if (activity) {
    const items = limit === undefined ? activity.items : activity.items.slice(0, limit);
    return structuredClone({ account_id: activity.account_id, items });
  }
  if (accountExists(accountId)) {
    return { account_id: accountId, items: [] };
  }
  return undefined;
}

function bumpUpdatedAt(): string {
  // Milliseconds are kept deliberately. This value is the If-Match token, and
  // truncating to whole seconds leaves a stale token valid for up to a second,
  // which makes the stale_write path untestable in mock mode.
  return new Date().toISOString().replace(/Z$/, "+00:00");
}

/** Usable P0 = tier P0 and not DNC. Bounced still counts — replace before remove. */
function usableP0Count(contacts: AccountContacts): number {
  return contacts.contacts.filter((c) => c.tier === "P0" && !c.do_not_contact).length;
}

function appendActivity(
  accountId: string,
  kind: AccountActivity["items"][number]["kind"],
  title: string,
  detail = "",
): void {
  const log = mockStore.activity[accountId] ?? {
    account_id: accountId,
    items: [],
  };
  const occurredAt = bumpUpdatedAt();
  log.items.unshift({
    activity_id: crypto.randomUUID(),
    kind,
    when_label: "Just now",
    occurred_at: occurredAt,
    title,
    title_tone: "neutral",
    detail,
    link_label: null,
    link_href: null,
  });
  mockStore.activity[accountId] = log;
}

export class MockAccountsConflictError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MockAccountsConflictError";
    this.code = code;
  }
}

/**
 * The account-wide chase reason, which `chaseDisabledReason` checks before any
 * per-invoice one: while an account cannot be chased at all, that fact is the
 * answer for every invoice on it.
 */
function accountChaseDisabledReason(
  status: ChaseStatus,
  ladder: AccountContacts | undefined,
): string | null {
  if (status === "no_p0") return "Can't chase — no primary contact";
  if (status === "bounced_p0") {
    const bounced = ladder?.contacts.find(
      (contact) =>
        contact.tier === "P0" && !contact.do_not_contact && contact.delivery_state === "bounced",
    );
    return bounced
      ? `Can't chase — ${bounced.name}'s email is bouncing`
      : "Can't chase — the primary contact's email is bouncing";
  }
  if (status === "paused") return "Chasing is paused for this account";
  return null;
}

/**
 * Whether a stored reason came from the account rather than the invoice.
 *
 * Only these may be cleared when an account becomes chaseable. "Disputed" and
 * "Promised" are facts about one invoice and survive a contact being fixed.
 */
function isAccountLevelChaseReason(reason: string | null): boolean {
  return (
    reason !== null &&
    (reason.startsWith("Can't chase — ") || reason === "Chasing is paused for this account")
  );
}

/**
 * Recomputes an account's contact pips and chase status from its stored ladder.
 *
 * The real list derives both from the contacts on every read, so a mock that
 * files a new P0 and leaves the row reading "Can't chase" would have the one
 * screen that proves the contact worked still insisting it did not. Kept in
 * terms of the same rules as `resolveChaseStatus` and `contactPip`: a tier is
 * `present` when somebody on it is reachable, `bounced` when the only ones left
 * bounce, `dnc` when all of them are do-not-contact.
 */
function syncChaseStateFromLadder(accountId: string): void {
  const ladder = mockStore.contacts[accountId];
  if (!ladder) return;

  const pip = (tier: ContactTier): ContactPip => {
    const onTier = ladder.contacts.filter((contact) => contact.tier === tier);
    if (onTier.length === 0) return "missing";
    if (onTier.some((c) => !c.do_not_contact && c.delivery_state !== "bounced")) return "present";
    if (onTier.some((c) => !c.do_not_contact)) return "bounced";
    return "dnc";
  };

  const row = mockStore.list.items.find((item) => item.account_id === accountId);
  const detail = mockStore.details[accountId];
  // Pausing is a property of the account, not the ladder, so it survives a
  // contact change rather than being recomputed away.
  const paused = row?.chase_status === "paused" || detail?.chase_status === "paused";
  const usableP0 = ladder.contacts.filter((c) => c.tier === "P0" && !c.do_not_contact);
  const status: ChaseStatus =
    usableP0.length === 0
      ? "no_p0"
      : usableP0.every((c) => c.delivery_state === "bounced")
        ? "bounced_p0"
        : paused
          ? "paused"
          : "active";

  const contacts = { p0: pip("P0"), p1: pip("P1"), p2: pip("P2") };
  if (row) {
    row.contacts = contacts;
    row.chase_status = status;
    row.status_label = CHASE_STATUS_LABEL[status];
  }
  if (detail) {
    detail.chase_status = status;
    detail.status_label = CHASE_STATUS_LABEL[status];
    detail.header_status = headerStatusFor({ chase_status: status });
  }
}

/**
 * Refuses a contact write on an archived account, as the RPCs do.
 *
 * Every contact mutation goes through `app.lock_account_for_write`, which
 * raises `account_archived` before it looks at the If-Match token — an archived
 * account is readable under Accounts → Archived but nothing may be written to
 * it until it is restored. The mock had no such guard, so the fixture store
 * would accept a contact the real backend refuses.
 *
 * Checked before the version token for the same reason the RPC does it in that
 * order: being archived is the more useful answer, and a caller holding a stale
 * token would otherwise be told to reload a page whose problem is not staleness.
 */
function refuseIfArchived(accountId: string): void {
  const archived =
    mockStore.archived.some((item) => item.account_id === accountId) ||
    mockStore.details[accountId]?.settings.archived_at != null;
  if (archived) {
    throw new MockAccountsConflictError(
      "account_archived",
      "This account is archived. Restore it to make changes.",
    );
  }
}

/** `POST /api/v1/accounts/{id}/contacts` against the fixture store. */
export function mockCreateContact(
  accountId: string,
  body: CreateContactBody,
  ifMatch: string,
): AccountContacts {
  refuseIfArchived(accountId);

  // Materialize the same empty ladder the read synthesizes. Most accounts have
  // no stored contacts fixture — including every account created during the
  // session — and refusing those as `not_found` would mean the one account you
  // just made is the one you cannot add a contact to, while the real RPC
  // accepts it.
  let contacts = mockStore.contacts[accountId];
  if (!contacts) {
    const synthesized = getMockAccountContacts(accountId);
    if (!synthesized) {
      throw new MockAccountsConflictError("not_found", "Account contacts not found.");
    }
    contacts = synthesized;
    mockStore.contacts[accountId] = contacts;
  }
  if (contacts.updated_at !== ifMatch) {
    throw new MockAccountsConflictError(
      "stale_write",
      "Someone else changed this account. Reload and try again.",
    );
  }
  const now = bumpUpdatedAt();
  contacts.contacts.push({
    contact_id: crypto.randomUUID(),
    tier: body.tier,
    name: body.name,
    designation: body.designation ?? null,
    email: body.email ?? null,
    phone: body.phone ?? null,
    channel_email: body.channel_email ?? true,
    channel_whatsapp: body.channel_whatsapp ?? false,
    channel_sms: body.channel_sms ?? false,
    always_cc: body.always_cc ?? false,
    do_not_contact: body.do_not_contact ?? false,
    dnc_reason: body.dnc_reason ?? null,
    language: body.language ?? "en",
    delivery_state: "unverified",
    last_bounced_at: null,
    last_contacted_at: null,
    sort_order: contacts.contacts.filter((c) => c.tier === body.tier).length,
    updated_at: now,
  });
  contacts.updated_at = now;
  appendActivity(accountId, "contact_added", `${body.name} added as ${body.tier} contact.`);
  syncChaseStateFromLadder(accountId);
  return structuredClone(contacts);
}

/** `PATCH /api/v1/accounts/{id}/contacts/{contactId}` against the fixture store. */
export function mockUpdateContact(
  accountId: string,
  contactId: string,
  body: UpdateContactBody,
  ifMatch: string,
): AccountContacts {
  refuseIfArchived(accountId);

  const contacts = mockStore.contacts[accountId];
  if (!contacts) {
    throw new MockAccountsConflictError("not_found", "Account contacts not found.");
  }
  if (contacts.updated_at !== ifMatch) {
    throw new MockAccountsConflictError(
      "stale_write",
      "Someone else changed this account. Reload and try again.",
    );
  }
  const contact = contacts.contacts.find((c) => c.contact_id === contactId);
  if (!contact) {
    throw new MockAccountsConflictError("not_found", "Contact not found.");
  }

  // A usable P0 can be lost two ways, and the rule has to cover both: marking it
  // do-not-contact, or moving it off the P0 tier. Guarding only the first left
  // "Move to P1" as a way to make the last P0 vanish and the account unchaseable.
  const nextDnc = body.do_not_contact ?? contact.do_not_contact;
  const nextTier = body.tier ?? contact.tier;
  const wasUsableP0 = contact.tier === "P0" && !contact.do_not_contact;
  const staysUsableP0 = nextTier === "P0" && !nextDnc;
  if (wasUsableP0 && !staysUsableP0 && usableP0Count(contacts) <= 1) {
    throw new MockAccountsConflictError(
      "last_p0_required",
      "An account needs a P0 contact to be chased. Add a replacement first.",
    );
  }

  const merged = { ...contact, ...body };
  if (!dncReasonIsPresent(merged)) {
    throw new MockAccountsConflictError(
      "dnc_reason_required",
      "Add a reason before marking a contact do-not-contact.",
    );
  }

  Object.assign(contact, body, { updated_at: bumpUpdatedAt() });
  contacts.updated_at = contact.updated_at;
  appendActivity(accountId, "contact_edited", `${contact.name} updated.`);
  syncChaseStateFromLadder(accountId);
  return structuredClone(contacts);
}

/** `DELETE /api/v1/accounts/{id}/contacts/{contactId}` against the fixture store. */
export function mockDeleteContact(
  accountId: string,
  contactId: string,
  ifMatch: string,
): AccountContacts {
  refuseIfArchived(accountId);

  const contacts = mockStore.contacts[accountId];
  if (!contacts) {
    throw new MockAccountsConflictError("not_found", "Account contacts not found.");
  }
  if (contacts.updated_at !== ifMatch) {
    throw new MockAccountsConflictError(
      "stale_write",
      "Someone else changed this account. Reload and try again.",
    );
  }
  const contact = contacts.contacts.find((c) => c.contact_id === contactId);
  if (!contact) {
    throw new MockAccountsConflictError("not_found", "Contact not found.");
  }
  if (contact.tier === "P0" && !contact.do_not_contact && usableP0Count(contacts) <= 1) {
    throw new MockAccountsConflictError(
      "last_p0_required",
      "An account needs a P0 contact to be chased. Add a replacement first.",
    );
  }
  const name = contact.name;
  contacts.contacts = contacts.contacts.filter((c) => c.contact_id !== contactId);
  contacts.updated_at = bumpUpdatedAt();
  appendActivity(accountId, "contact_removed", `${name} removed.`);
  syncChaseStateFromLadder(accountId);
  return structuredClone(contacts);
}

export function mockUpdateEscalation(
  accountId: string,
  body: UpdateEscalationBody,
  ifMatch: string,
): AccountContacts {
  const contacts = mockStore.contacts[accountId];
  if (!contacts) {
    throw new MockAccountsConflictError("not_found", "Account contacts not found.");
  }
  if (contacts.updated_at !== ifMatch) {
    throw new MockAccountsConflictError(
      "stale_write",
      "Someone else changed this account. Reload and try again.",
    );
  }
  if (body.p2_after_days <= body.p1_after_days) {
    throw new MockAccountsConflictError("escalation_order", "P2 must come after P1.");
  }
  contacts.p1_after_days = body.p1_after_days;
  contacts.p2_after_days = body.p2_after_days;
  contacts.updated_at = bumpUpdatedAt();
  appendActivity(
    accountId,
    "escalation_changed",
    `Escalation timing changed to P1 after ${body.p1_after_days} days, P2 after ${body.p2_after_days} days.`,
  );
  return structuredClone(contacts);
}

export function mockUpdateChasingSettings(
  accountId: string,
  body: UpdateChasingSettingsBody,
  ifMatch: string,
): AccountDetail {
  const detail = mockStore.details[accountId];
  if (!detail) {
    throw new MockAccountsConflictError("not_found", "Account not found.");
  }
  if (detail.updated_at !== ifMatch) {
    throw new MockAccountsConflictError(
      "stale_write",
      "Someone else changed this account. Reload and try again.",
    );
  }

  let payload: UpdateChasingSettingsBody;
  try {
    payload = updateChasingSettingsBodySchema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      const code = issue?.path[0] === "stop_reason" ? "stop_reason_required" : "validation_error";
      throw new MockAccountsConflictError(code, issue?.message ?? "Invalid settings.");
    }
    throw error;
  }

  const settings = detail.settings;
  settings.chase_mode = payload.chase_mode;
  if (payload.steps !== undefined) {
    settings.steps = settings.steps.map((step) => {
      const patch = payload.steps!.find((entry) => entry.key === step.key);
      return patch ? { ...step, ...patch } : step;
    });
  }
  if (payload.stop_reason !== undefined) {
    settings.stop_reason = payload.stop_reason;
  }
  if (payload.stop_note !== undefined) {
    settings.stop_note = payload.stop_note;
  }
  settings.send_window_mode = payload.send_window_mode;
  if (payload.send_window !== undefined) {
    settings.send_window = {
      opens_at: payload.send_window.opens_at,
      closes_at: payload.send_window.closes_at,
      days: [...payload.send_window.days],
    };
  }
  settings.terms_preset = payload.terms_preset;
  settings.term_days = payload.term_days;
  settings.is_msme = payload.is_msme;
  settings.tds_section = payload.tds_section;
  settings.tds_rate = payload.tds_rate;
  settings.owner_user_id = payload.owner_user_id;
  // An id with no matching owner has no name — keeping the previous one would
  // return a row whose owner id and owner name describe two different people.
  settings.owner_name =
    ASSIGNABLE_OWNERS.find((owner) => owner.id === payload.owner_user_id)?.name ?? null;
  settings.notes = payload.notes;

  if (payload.chase_mode === "stopped" && payload.stop_reason) {
    settings.paused_at = settings.paused_at ?? bumpUpdatedAt();
    settings.pause_reason =
      payload.stop_reason === "Relationship hold" ? "Other" : payload.stop_reason;
    detail.chase_status = "paused";
    detail.status_label = "Paused";
    detail.header_status = `Chasing paused — ${payload.stop_reason}`;
  }

  detail.updated_at = bumpUpdatedAt();
  appendActivity(accountId, "settings_changed", "Account settings updated.");
  return structuredClone(detail);
}

/** Mock archive: moves the row to the Archived view and keeps the detail readable. */
export function mockArchiveAccount(
  accountId: string,
  body: ArchiveAccountBody,
  ifMatch: string,
): AccountDetail {
  const detail = mockStore.details[accountId];
  if (!detail) {
    throw new MockAccountsConflictError("not_found", "Account not found.");
  }
  if (detail.updated_at !== ifMatch) {
    throw new MockAccountsConflictError(
      "stale_write",
      "Someone else changed this account. Reload and try again.",
    );
  }
  if (body.confirm_name.trim().toUpperCase() !== detail.name.trim().toUpperCase()) {
    throw new MockAccountsConflictError("archive_name_mismatch", "That name doesn't match.");
  }

  if (detail.settings.archived_at !== null) {
    throw new MockAccountsConflictError(
      "account_archived",
      "This account is archived. Restore it to make changes.",
    );
  }

  const row = mockStore.list.items.find((item) => item.account_id === accountId);
  if (row) mockStore.archived.push(row);
  mockStore.list.items = mockStore.list.items.filter((item) => item.account_id !== accountId);
  mockStore.list.total_count = Math.max(0, mockStore.list.total_count - 1);
  mockStore.list.filtered_count = mockStore.list.items.length;

  const now = bumpUpdatedAt();
  detail.settings.archived_at = now;
  detail.header_status = "Archived";
  detail.recommendation = null;
  detail.updated_at = now;
  appendActivity(accountId, "settings_changed", "Account archived");
  return structuredClone(detail);
}

/** Mock restore: moves the row back to the active list and clears `archived_at`. */
export function mockRestoreAccount(accountId: string, ifMatch: string): AccountDetail {
  const detail = mockStore.details[accountId];
  if (!detail) {
    throw new MockAccountsConflictError("not_found", "Account not found.");
  }
  if (detail.updated_at !== ifMatch) {
    throw new MockAccountsConflictError(
      "stale_write",
      "Someone else changed this account. Reload and try again.",
    );
  }
  if (detail.settings.archived_at === null) {
    throw new MockAccountsConflictError("not_archived", "This account isn't archived.");
  }

  const row = mockStore.archived.find((item) => item.account_id === accountId);
  if (row) mockStore.list.items.push(row);
  mockStore.archived = mockStore.archived.filter((item) => item.account_id !== accountId);
  // Mirrors the archive's decrement: the fixture's total covers more accounts
  // than its sample rows, so recounting the rows would shrink it.
  mockStore.list.total_count += 1;
  mockStore.list.filtered_count = mockStore.list.items.length;

  detail.settings.archived_at = null;
  detail.header_status = row ? headerStatusFor(row) : "Active";
  detail.updated_at = bumpUpdatedAt();
  appendActivity(accountId, "settings_changed", "Account restored");
  return structuredClone(detail);
}

export function mockPauseAccount(
  accountId: string,
  body: PauseAccountBody,
  ifMatch: string,
): AccountDetail {
  const detail = mockStore.details[accountId];
  if (!detail) {
    throw new MockAccountsConflictError("not_found", "Account not found.");
  }
  if (detail.updated_at !== ifMatch) {
    throw new MockAccountsConflictError(
      "stale_write",
      "Someone else changed this account. Reload and try again.",
    );
  }
  if (!body.reason) {
    throw new MockAccountsConflictError("pause_reason_required", "Add a reason before pausing.");
  }
  // Contract §2.4. Compared as a plain date string rather than through Date:
  // paused_until is a calendar date in the org timezone, and parsing it to an
  // instant would make the boundary depend on where the code runs.
  if (body.until !== undefined && body.until < new Date().toISOString().slice(0, 10)) {
    throw new MockAccountsConflictError(
      "pause_until_past",
      "Pick a date in the future, or leave it blank to pause indefinitely.",
    );
  }
  const now = bumpUpdatedAt();
  detail.settings.paused_at = now;
  detail.settings.pause_reason = body.reason;
  detail.settings.paused_until = body.until ?? null;
  detail.chase_status = "paused";
  detail.status_label = "Paused";
  detail.header_status = `Chasing paused — ${body.reason}`;
  detail.updated_at = now;
  appendActivity(accountId, "pause", `Chasing paused — ${body.reason}.`);
  return structuredClone(detail);
}

export function mockResumeAccount(accountId: string, ifMatch: string): AccountDetail {
  const detail = mockStore.details[accountId];
  if (!detail) {
    throw new MockAccountsConflictError("not_found", "Account not found.");
  }
  if (detail.updated_at !== ifMatch) {
    throw new MockAccountsConflictError(
      "stale_write",
      "Someone else changed this account. Reload and try again.",
    );
  }
  detail.settings.paused_at = null;
  detail.settings.pause_reason = null;
  detail.settings.paused_until = null;
  // Sharma's P0 is still bouncing after resume of an intentional pause.
  if (accountId === ACCOUNT_IDS.sharma) {
    detail.chase_status = "bounced_p0";
    detail.status_label = "Can't chase";
    detail.header_status = "Chasing paused — email bouncing";
  } else if (accountId === ACCOUNT_IDS.kaveri) {
    detail.chase_status = "no_p0";
    detail.status_label = "Can't chase";
    detail.header_status = "Can't chase — no primary contact";
  } else {
    detail.chase_status = "active";
    detail.status_label = "Active";
    detail.header_status = "Active";
  }
  detail.updated_at = bumpUpdatedAt();
  appendActivity(accountId, "resume", "Chasing resumed.");
  return structuredClone(detail);
}

/** Kept for callers that only need the static seed timestamp. */
export const ACCOUNTS_AS_OF = AS_OF;

/**
 * `POST /api/v1/accounts` against the fixture store.
 *
 * The normalization here is deliberately cruder than
 * `app.normalize_account_name()` — it case-folds and collapses whitespace but
 * does not strip "Pvt Ltd". Matching the database exactly would mean keeping a
 * second copy of the domain's duplicate rule in TypeScript, which is the thing
 * the RPC exists to avoid. The mock's job is to exercise the created/matched
 * branches, not to be the authority on which two names are one debtor.
 */
export function mockEnsureAccounts(names: readonly string[]): EnsureAccountsResult {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  const existing = new Map(
    [...mockStore.list.items, ...mockStore.archived].map((item) => [normalize(item.name), item]),
  );

  // Two different dedup keys, mirroring the RPC:
  //   answered — the exact trimmed name, because the response carries a row
  //              per *requested* spelling. The caller maps its drafts by the
  //              name it sent, so dropping a repeated spelling would leave one
  //              of them unanswered.
  //   existing — the normalized name, because that is what decides whether an
  //              account has to be created.
  const answered = new Set<string>();
  const createdIds = new Set<string>();
  const accounts: EnsureAccountsResult["accounts"] = [];

  for (const raw of names) {
    const name = raw.trim();
    if (name === "" || answered.has(name)) continue;
    answered.add(name);
    const key = normalize(name);

    const match = existing.get(key);
    if (match) {
      accounts.push({
        requested_name: name,
        account_id: match.account_id,
        name: match.name,
        // True when this same call created it a moment ago under another
        // spelling — the RPC reports the id it inserted, not the spelling.
        created: createdIds.has(match.account_id),
      });
      continue;
    }

    // A brand-new account has no invoices and no contacts, so it cannot be
    // chased yet — `no_p0`, not `active`.
    const item: AccountListItem = {
      account_id: crypto.randomUUID(),
      name,
      outstanding: "0.00",
      overdue: "0.00",
      open_count: 0,
      oldest_overdue_days: null,
      avg_days_late: null,
      contacts: { p0: "missing", p1: "missing", p2: "missing" },
      chase_status: "no_p0",
      status_label: "Can't chase",
    };
    mockStore.list.items.push(item);
    mockStore.list.total_count += 1;
    mockStore.list.filtered_count = mockStore.list.items.length;
    // Incremented, not recounted. The fixture is an org of 47 accounts
    // showing 12 of them, so assigning items.length here would quietly
    // collapse the org total to the size of the visible page.
    mockStore.list.org_totals.account_count += 1;
    existing.set(key, item);
    createdIds.add(item.account_id);
    accounts.push({
      requested_name: name,
      account_id: item.account_id,
      name: item.name,
      created: true,
    });
  }

  return { accounts };
}
