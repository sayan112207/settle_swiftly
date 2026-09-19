/**
 * Server side of `/api/v1/accounts/*` (docs/accounts-contract.md §3 and
 * docs/account-settings-changes.md).
 *
 * Reads assemble responses from `book.server.ts` and the pure rules in
 * `accounts-rules.ts`. Every mutation is one RPC — If-Match check, change and
 * activity_log row in a single transaction — followed by a fresh read, so the
 * response is always the full updated resource (contract: never a 204).
 */

import { z } from "zod";

import type {
  AccountActivity,
  AccountChasingSettings,
  AccountContacts,
  AccountDetail,
  AccountInvoiceGroup,
  AccountInvoices,
  AccountListItem,
  AccountPayments,
  AccountsList,
  AccountsListFilter,
  CadenceChannel,
  CadenceRecipients,
  CadenceTone,
  ChaseStopReason,
  ContactTier,
  DeliveryState,
  PauseReason,
  PaymentSource,
  TdsSection,
  Weekday,
} from "@/lib/schemas/accounts";
import {
  accountsListFilterSchema,
  accountsSortColumnSchema,
  accountsViewSchema,
  accountsSortDirSchema,
  archiveAccountBodySchema,
  createContactBodySchema,
  pauseAccountBodySchema,
  updateChasingSettingsBodySchema,
  updateContactBodySchema,
  updateEscalationBodySchema,
} from "@/lib/schemas/accounts";
import type { AgingBucket } from "@/lib/schemas/dashboard";
import {
  CHASE_STATUS_LABEL,
  DEFAULT_CADENCE_SUMMARY,
  DEFAULT_SEND_WINDOW,
  accountFigures,
  activityWhenLabel,
  avgDaysLate,
  chaseDisabledReason,
  contactPip,
  defaultSteps,
  escalationContacts,
  filterAccounts,
  headerStatus,
  invoiceStatus,
  mergeSteps,
  paymentStatus,
  sortAccounts,
  stepOverridesProblem,
  type PaidSample,
  type StepOverride,
} from "@/lib/services/accounts-rules";
import {
  ApiError,
  fetchAllPages,
  resolveCaller,
  validationError,
  type Caller,
} from "@/lib/services/api.server";
import {
  contactLanguage,
  loadAccounts,
  loadBook,
  type AccountState,
  type BookEntry,
} from "@/lib/services/book.server";
import {
  AGING_BUCKETS,
  addDays,
  agingBucket,
  agingTotals,
  daysOverdue,
  paiseToMoney,
  sharePct,
  todayInTimezone,
  toPaise,
  type IsoDate,
} from "@/lib/services/dashboard-rules";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** `2026-09-19` → `19 Sep 2026`. */
function longDate(date: IsoDate): string {
  const [year, month, day] = date.split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? ""} ${year}`;
}

const NOT_FOUND = () => new ApiError(404, "not_found", "We couldn't find that account.");

/** Accounts per page when the caller asks for paging; without `page` the whole list is returned. */
export const ACCOUNTS_PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Shared assembly
// ---------------------------------------------------------------------------

type AccountContext = {
  caller: Caller;
  today: IsoDate;
  state: AccountState;
};

/**
 * The caller, today, and one account — 404 for anything missing or foreign.
 * Archived accounts are readable (Accounts → Archived); every write RPC refuses
 * them with `account_archived`.
 */
async function loadAccountContext(accountId: string): Promise<AccountContext> {
  const caller = await resolveCaller();
  const today = todayInTimezone(caller.timezone);
  const accounts = await loadAccounts(caller, today, { accountId, archived: "include" });
  const state = accounts.get(accountId);
  if (!state) throw NOT_FOUND();
  return { caller, today, state };
}

/** One account's open book and paid samples. */
async function loadAccountBook(context: AccountContext) {
  const accounts = new Map([[context.state.row.id, context.state]]);
  return loadBook(context.caller, context.today, accounts, {
    accountId: context.state.row.id,
    includePaid: true,
  });
}

/** The account's five aging segments in contract order; they sum to its outstanding. */
function agingTuple(entries: readonly BookEntry[], today: IsoDate): AccountDetail["aging"] {
  const book = entries.map((entry) => entry.invoice);
  const total = book.reduce((sum, invoice) => sum + invoice.outstandingPaise, 0);
  const paise = new Map(agingTotals(book, today).map(({ bucket, paise: p }) => [bucket, p]));
  const segment = <B extends AgingBucket>(bucket: B) => {
    const amount = paise.get(bucket) ?? 0;
    return { bucket, amount: paiseToMoney(amount), share_pct: sharePct(amount, total) };
  };
  return [
    segment("Not yet due"),
    segment("1–30"),
    segment("31–60"),
    segment("61–90"),
    segment("90+"),
  ];
}

/** One account's list row: figures, payment history, contact pips and chase status. */
function listItem(
  state: AccountState,
  entries: readonly BookEntry[],
  samples: readonly PaidSample[],
  today: IsoDate,
): AccountListItem {
  const figures = accountFigures(
    entries.map((entry) => entry.invoice),
    today,
  );
  return {
    account_id: state.row.id,
    name: state.row.name,
    outstanding: paiseToMoney(figures.outstandingPaise),
    overdue: paiseToMoney(figures.overduePaise),
    open_count: figures.openCount,
    oldest_overdue_days: figures.oldestOverdueDays,
    avg_days_late: avgDaysLate(samples, today),
    contacts: {
      p0: contactPip(state.ladder, "P0"),
      p1: contactPip(state.ladder, "P1"),
      p2: contactPip(state.ladder, "P2"),
    },
    chase_status: state.status,
    status_label: CHASE_STATUS_LABEL[state.status],
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Validated `GET /api/v1/accounts` query. */
export type AccountsListQuery = {
  view: "active" | "archived";
  filters: AccountsListFilter[];
  sort: string;
  dir: "asc" | "desc";
  page: number | null;
};

/** Parses the list query; a filter, sort or direction outside the vocabulary is a 422. */
export function parseAccountsListQuery(url: URL): AccountsListQuery {
  const view = accountsViewSchema
    .default("active")
    .safeParse(url.searchParams.get("view") ?? undefined);
  const filters = z.array(accountsListFilterSchema).safeParse(url.searchParams.getAll("filter"));
  const sort = accountsSortColumnSchema
    .default("outstanding")
    .safeParse(url.searchParams.get("sort") ?? undefined);
  const dir = accountsSortDirSchema
    .default("desc")
    .safeParse(url.searchParams.get("dir") ?? undefined);
  const page = z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .safeParse(url.searchParams.get("page") ?? undefined);
  if (!view.success || !filters.success || !sort.success || !dir.success || !page.success) {
    throw new ApiError(422, "invalid_query", "That filter or sort isn't available.");
  }
  return {
    view: view.data,
    filters: filters.data,
    sort: sort.data,
    dir: dir.data,
    page: page.data ?? null,
  };
}

/**
 * `GET /api/v1/accounts?view=active|archived`.
 *
 * `items`, `total_count` and the filtered figures describe the chosen view;
 * `org_totals` is always the live (non-archived) book, because archived
 * accounts are out of every total.
 */
export async function buildAccountsList(query: AccountsListQuery): Promise<AccountsList> {
  const caller = await resolveCaller();
  const today = todayInTimezone(caller.timezone);
  const accounts = await loadAccounts(caller, today, { archived: "include" });
  const { entries, paidSamples } = await loadBook(caller, today, accounts, { includePaid: true });

  const byAccount = new Map<string, BookEntry[]>();
  for (const entry of entries) {
    const list = byAccount.get(entry.invoice.accountId) ?? [];
    list.push(entry);
    byAccount.set(entry.invoice.accountId, list);
  }

  const rows = (archived: boolean) =>
    [...accounts.values()]
      .filter((state) => (state.row.archived_at !== null) === archived)
      .map((state) =>
        listItem(
          state,
          byAccount.get(state.row.id) ?? [],
          paidSamples.get(state.row.id) ?? [],
          today,
        ),
      );
  const live = rows(false);
  const all = query.view === "archived" ? rows(true) : live;
  const filtered = sortAccounts(filterAccounts(all, query.filters), query.sort, query.dir);
  const page =
    query.page === null
      ? filtered
      : filtered.slice((query.page - 1) * ACCOUNTS_PAGE_SIZE, query.page * ACCOUNTS_PAGE_SIZE);

  const sum = (items: readonly AccountListItem[], key: "outstanding" | "overdue") =>
    paiseToMoney(items.reduce((total, item) => total + toPaise(item[key]), 0));

  return {
    total_count: all.length,
    filtered_count: filtered.length,
    filtered_outstanding: sum(filtered, "outstanding"),
    filtered_overdue: sum(filtered, "overdue"),
    org_totals: {
      account_count: live.length,
      outstanding: sum(live, "outstanding"),
      overdue: sum(live, "overdue"),
    },
    items: page,
  };
}

/** The Settings tab: cadence, window, terms, owners (org members) and the server-decided `can_edit`. */
async function loadSettings(context: AccountContext): Promise<AccountChasingSettings> {
  const { caller, state } = context;
  const row = state.row;

  const [overridesResult, membersResult] = await Promise.all([
    caller.supabase
      .from("account_cadence_steps")
      .select("step_key, tone, channel, recipients")
      .eq("account_id", row.id),
    caller.supabase.from("org_members").select("user_id, role").eq("org_id", caller.orgId),
  ]);
  if (overridesResult.error) throw overridesResult.error;
  if (membersResult.error) throw membersResult.error;

  const memberIds = membersResult.data.map((m) => m.user_id);
  const profilesResult =
    memberIds.length === 0
      ? { data: [], error: null }
      : await caller.supabase.from("profiles").select("id, display_name").in("id", memberIds);
  if (profilesResult.error) throw profilesResult.error;

  const names = new Map(profilesResult.data.map((p) => [p.id, p.display_name]));
  const owners = membersResult.data
    .map((m) => ({ id: m.user_id, name: names.get(m.user_id) ?? "Teammate" }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const callerRole = membersResult.data.find((m) => m.user_id === caller.userId)?.role;

  const overrides: StepOverride[] = overridesResult.data.map((o) => ({
    key: o.step_key,
    tone: o.tone as CadenceTone,
    channel: o.channel as CadenceChannel,
    recipients: o.recipients as CadenceRecipients,
  }));

  const customWindow =
    row.send_window_opens !== null && row.send_window_closes !== null && row.send_window_days
      ? {
          opens_at: row.send_window_opens.slice(0, 5),
          closes_at: row.send_window_closes.slice(0, 5),
          days: row.send_window_days as Weekday[],
        }
      : null;

  return {
    chase_mode: row.chase_mode as AccountChasingSettings["chase_mode"],
    steps: row.chase_mode === "custom" ? mergeSteps(overrides) : defaultSteps(),
    default_steps: defaultSteps(),
    default_summary: DEFAULT_CADENCE_SUMMARY,
    stop_reason: row.stop_reason as ChaseStopReason | null,
    stop_note: row.stop_note,
    send_window_mode: row.send_window_mode as "default" | "custom",
    send_window:
      row.send_window_mode === "custom" && customWindow
        ? customWindow
        : { ...DEFAULT_SEND_WINDOW, days: [...DEFAULT_SEND_WINDOW.days] },
    default_send_window: { ...DEFAULT_SEND_WINDOW, days: [...DEFAULT_SEND_WINDOW.days] },
    terms_preset: row.terms_preset as AccountChasingSettings["terms_preset"],
    term_days: row.term_days,
    is_msme: row.is_msme,
    tds_section: row.tds_section as TdsSection,
    tds_rate: row.tds_rate === null ? null : Number(row.tds_rate),
    owner_user_id: row.owner_user_id,
    owner_name: owners.find((o) => o.id === row.owner_user_id)?.name ?? null,
    assignable_owners: owners,
    notes: row.notes,
    escalation_contacts: escalationContacts(state.ladder),
    // Decided here, never inferred from a role string in the UI.
    can_edit: callerRole === "owner" || callerRole === "admin",
    archived_at: row.archived_at,
    paused_at: row.paused_at,
    pause_reason: row.pause_reason as PauseReason | null,
    paused_until: row.paused_until,
  };
}

/** The action strip for an account nobody can be chased on, or null. */
function recommendation(state: AccountState): AccountDetail["recommendation"] {
  const contactsHref = `/app/accounts/${state.row.id}?tab=contacts`;
  if (state.status === "no_p0") {
    return {
      sentence: "Nobody on this account can be chased yet. Add a P0 contact to start.",
      action_label: "Add contact",
      action_href: contactsHref,
    };
  }
  if (state.status === "bounced_p0") {
    const bounced = state.ladder.find(
      (c) => c.tier === "P0" && !c.doNotContact && c.deliveryState === "bounced",
    );
    return {
      sentence: `${bounced?.name ?? "The P0 contact"}'s email is bouncing, so reminders can't be delivered. Add a working address.`,
      action_label: "Fix contact",
      action_href: contactsHref,
    };
  }
  return null;
}

/** `GET /api/v1/accounts/{id}` — also for archived accounts, which read as archived. */
export async function buildAccountDetail(accountId: string): Promise<AccountDetail> {
  const context = await loadAccountContext(accountId);
  const { today, state } = context;
  const [{ entries, paidSamples }, settings] = await Promise.all([
    loadAccountBook(context),
    loadSettings(context),
  ]);
  const item = listItem(state, entries, paidSamples.get(state.row.id) ?? [], today);

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
    header_status:
      state.row.archived_at !== null
        ? `Archived on ${longDate(todayInTimezone(context.caller.timezone, new Date(state.row.archived_at)))}`
        : headerStatus(state.status, {
            ...state.chase,
            pauseReason: state.row.pause_reason,
            stopReason: state.row.stop_reason,
          }),
    last_synced_at: state.row.last_synced_at ?? state.row.created_at,
    // The If-Match token for account mutations (see the migration).
    updated_at: state.row.detail_version,
    aging: agingTuple(entries, today),
    settings,
    recommendation: state.row.archived_at !== null ? null : recommendation(state),
  };
}

/** `GET /api/v1/accounts/{id}/invoices` — open invoices grouped by bucket, contract order, empty groups omitted. */
export async function buildAccountInvoices(accountId: string): Promise<AccountInvoices> {
  const context = await loadAccountContext(accountId);
  const { today, state } = context;
  const { entries } = await loadAccountBook(context);

  const groups: AccountInvoiceGroup[] = AGING_BUCKETS.flatMap((bucket) => {
    const inBucket = entries
      .filter((entry) => agingBucket(entry.invoice, today) === bucket)
      .sort(
        (a, b) =>
          a.invoice.dueDate.localeCompare(b.invoice.dueDate) ||
          a.invoice.invoiceNumber.localeCompare(b.invoice.invoiceNumber),
      );
    if (inBucket.length === 0) return [];
    const subtotal = inBucket.reduce((sum, entry) => sum + entry.invoice.outstandingPaise, 0);
    return [
      {
        bucket,
        subtotal: paiseToMoney(subtotal),
        invoices: inBucket.map(({ invoice, issueDate }) => ({
          invoice_id: invoice.id,
          number: invoice.invoiceNumber,
          invoice_date: issueDate,
          due_date: invoice.dueDate,
          days_overdue: Math.max(0, daysOverdue(invoice, today)),
          amount_outstanding: paiseToMoney(invoice.outstandingPaise),
          status: invoiceStatus(invoice, today),
          chase_disabled_reason:
            state.row.archived_at !== null
              ? "This account is archived"
              : chaseDisabledReason(invoice, state.status, state.ladder, today),
        })),
      },
    ];
  });

  return { account_id: state.row.id, groups };
}

/** `GET /api/v1/accounts/{id}/contacts` — the ladder, P0 → P2, then by sort order. */
export async function buildAccountContacts(accountId: string): Promise<AccountContacts> {
  const { state } = await loadAccountContext(accountId);
  const tierRank: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
  const contacts = [...state.contacts].sort(
    (a, b) =>
      (tierRank[a.priority] ?? 3) - (tierRank[b.priority] ?? 3) ||
      a.sort_order - b.sort_order ||
      a.created_at.localeCompare(b.created_at),
  );

  return {
    account_id: state.row.id,
    // The If-Match token for ladder mutations (see the migration).
    updated_at: state.row.ladder_version,
    p1_after_days: state.row.p1_after_days,
    p2_after_days: state.row.p2_after_days,
    contacts: contacts.map((c) => ({
      contact_id: c.id,
      tier: c.priority as ContactTier,
      name: c.name,
      designation: c.designation,
      email: c.email,
      phone: c.phone,
      channel_email: c.channel_email,
      channel_whatsapp: c.channel_whatsapp,
      channel_sms: c.channel_sms,
      always_cc: c.always_cc,
      do_not_contact: c.do_not_contact,
      dnc_reason: c.dnc_reason,
      language: contactLanguage(c.language),
      delivery_state: c.delivery_state as DeliveryState,
      last_bounced_at: c.last_bounced_at,
      last_contacted_at: c.last_contacted_at,
      sort_order: c.sort_order,
      updated_at: c.updated_at,
    })),
  };
}

const PAYMENT_SOURCES: readonly PaymentSource[] = ["Bank alert", "Manual", "Statement"];

type PaymentRow = {
  id: string;
  amount: number;
  paid_on: string;
  method: string | null;
  reference: string | null;
  created_at: string;
  invoices: { id: string; invoice_number: string; amount: number; account_id: string };
};

/**
 * `GET /api/v1/accounts/{id}/payments`.
 *
 * Each payment in this schema belongs to exactly one invoice, so every row is
 * fully applied and unapplied credit is always zero. Payment allocations
 * across invoices are a later schema change.
 */
export async function buildAccountPayments(accountId: string): Promise<AccountPayments> {
  const context = await loadAccountContext(accountId);
  const { caller, today, state } = context;

  const [rows, { paidSamples }] = await Promise.all([
    fetchAllPages((from, to) =>
      caller.supabase
        .from("payments")
        .select(
          "id, amount, paid_on, method, reference, created_at, " +
            "invoices!inner(id, invoice_number, amount, account_id)",
        )
        .eq("org_id", caller.orgId)
        .eq("currency", "INR")
        .eq("invoices.account_id", state.row.id)
        .order("paid_on", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ) as Promise<unknown[]> as Promise<PaymentRow[]>,
    loadAccountBook(context),
  ]);

  const paidPerInvoice = new Map<string, number>();
  for (const row of rows) {
    paidPerInvoice.set(
      row.invoices.id,
      (paidPerInvoice.get(row.invoices.id) ?? 0) + toPaise(row.amount),
    );
  }
  const tdsRate =
    state.row.tds_section === "None" || state.row.tds_rate === null
      ? null
      : Number(state.row.tds_rate);
  const since = addDays(today, -90);

  return {
    stats: {
      received_90d: paiseToMoney(
        rows.filter((r) => r.paid_on >= since).reduce((sum, r) => sum + toPaise(r.amount), 0),
      ),
      unapplied_total: "0.00",
      average_delay_days: avgDaysLate(paidSamples.get(state.row.id) ?? [], today),
    },
    items: rows.map((row) => {
      const gross = toPaise(row.invoices.amount);
      const balance = gross - (paidPerInvoice.get(row.invoices.id) ?? 0);
      const status = paymentStatus(gross, balance, tdsRate);
      const source = PAYMENT_SOURCES.find((s) => s === row.method) ?? "Manual";
      return {
        payment_id: row.id,
        date: row.paid_on,
        source,
        reference: row.reference ?? "",
        amount: paiseToMoney(toPaise(row.amount)),
        applied_to: row.invoices.invoice_number,
        is_applied: true,
        status_label: status.label,
        status_tone: status.tone,
        action_label: status.actionLabel,
        action_kind: status.actionKind,
        allocations: [
          {
            invoice_id: row.invoices.id,
            invoice_number: row.invoices.invoice_number,
            amount: paiseToMoney(toPaise(row.amount)),
          },
        ],
      };
    }),
  };
}

/** Contract: `limit` is optional; capped so one request can't pull an unbounded history. */
export const activityLimitSchema = z.coerce.number().int().min(1).max(200).default(50);

/** `GET /api/v1/accounts/{id}/activity?limit=` — reverse chronological. */
export async function buildAccountActivity(
  accountId: string,
  limit: number,
): Promise<AccountActivity> {
  const { caller, state } = await loadAccountContext(accountId);

  const { data: rows, error } = await caller.supabase
    .from("activity_log")
    .select("id, kind, title, detail, tone, link_label, link_href, occurred_at, actor_user_id")
    .eq("account_id", state.row.id)
    .order("occurred_at", { ascending: false })
    .order("id")
    .limit(limit);
  if (error) throw error;

  const actorIds = [
    ...new Set(rows.map((r) => r.actor_user_id).filter((id): id is string => !!id)),
  ];
  const actors = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles, error: profileError } = await caller.supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", actorIds);
    if (profileError) throw profileError;
    for (const p of profiles) actors.set(p.id, p.display_name);
  }

  const now = new Date();
  return {
    account_id: state.row.id,
    items: rows.map((row) => {
      const actor = row.actor_user_id ? actors.get(row.actor_user_id) : undefined;
      const detail = [row.detail, actor ? `By ${actor}.` : ""].filter(Boolean).join(" ");
      return {
        activity_id: row.id,
        kind: row.kind as AccountActivity["items"][number]["kind"],
        when_label: activityWhenLabel(row.occurred_at, caller.timezone, now),
        occurred_at: row.occurred_at,
        title: row.title,
        title_tone: row.tone as AccountActivity["items"][number]["title_tone"],
        detail,
        link_label: row.link_label,
        link_href: row.link_href,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Parses a body with one of the frontend's own schemas; its messages are user-facing. */
function parseBody<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

/** Runs an RPC through the caller's session and throws its error for `handleApi` to map. */
async function rpc(
  caller: Caller,
  fn: Parameters<Caller["supabase"]["rpc"]>[0],
  args: Record<string, unknown>,
): Promise<void> {
  const { error } = await caller.supabase.rpc(fn, args as never);
  if (error) throw error;
}

/** `POST /api/v1/accounts/{id}/contacts` */
export async function createContact(
  accountId: string,
  body: unknown,
  ifMatch: string,
): Promise<AccountContacts> {
  const payload = parseBody(createContactBodySchema, body);
  const caller = await resolveCaller();
  await rpc(caller, "account_contact_create", {
    p_account: accountId,
    p_if_match: ifMatch,
    p_body: payload,
  });
  return buildAccountContacts(accountId);
}

/** `PATCH /api/v1/accounts/{id}/contacts/{contactId}` */
export async function updateContact(
  accountId: string,
  contactId: string,
  body: unknown,
  ifMatch: string,
): Promise<AccountContacts> {
  const payload = parseBody(updateContactBodySchema, body);
  const caller = await resolveCaller();
  await rpc(caller, "account_contact_update", {
    p_account: accountId,
    p_contact: contactId,
    p_if_match: ifMatch,
    p_body: payload,
  });
  return buildAccountContacts(accountId);
}

/** `DELETE /api/v1/accounts/{id}/contacts/{contactId}` */
export async function deleteContact(
  accountId: string,
  contactId: string,
  ifMatch: string,
): Promise<AccountContacts> {
  const caller = await resolveCaller();
  await rpc(caller, "account_contact_delete", {
    p_account: accountId,
    p_contact: contactId,
    p_if_match: ifMatch,
  });
  return buildAccountContacts(accountId);
}

/** `PATCH /api/v1/accounts/{id}/escalation` */
export async function updateEscalation(
  accountId: string,
  body: unknown,
  ifMatch: string,
): Promise<AccountContacts> {
  // escalation_order is also refused by the schema; the RPC and a table check back it up.
  const parsed = updateEscalationBodySchema.safeParse(body);
  if (!parsed.success) {
    const order = parsed.error.issues.some((issue) => issue.path[0] === "p2_after_days");
    throw order
      ? new ApiError(422, "escalation_order", "P2 must come after P1.")
      : validationError(parsed.error);
  }
  const caller = await resolveCaller();
  await rpc(caller, "account_update_escalation", {
    p_account: accountId,
    p_if_match: ifMatch,
    p_p1_after_days: parsed.data.p1_after_days,
    p_p2_after_days: parsed.data.p2_after_days,
  });
  return buildAccountContacts(accountId);
}

/** `PATCH /api/v1/accounts/{id}/chasing-settings` */
export async function updateChasingSettings(
  accountId: string,
  body: unknown,
  ifMatch: string,
): Promise<AccountDetail> {
  const parsed = updateChasingSettingsBodySchema.safeParse(body);
  if (!parsed.success) {
    const stop = parsed.error.issues.some((issue) => issue.path[0] === "stop_reason");
    throw stop
      ? new ApiError(422, "stop_reason_required", "Pick a reason before saving.")
      : validationError(parsed.error);
  }
  const problem = stepOverridesProblem(parsed.data.steps ?? []);
  if (problem) throw new ApiError(422, "invalid_cadence", problem);

  const caller = await resolveCaller();
  await rpc(caller, "account_update_chasing_settings", {
    p_account: accountId,
    p_if_match: ifMatch,
    p_body: parsed.data,
  });
  return buildAccountDetail(accountId);
}

/** `POST /api/v1/accounts/{id}/archive` — returns the account's final state. */
export async function archiveAccount(
  accountId: string,
  body: unknown,
  ifMatch: string,
): Promise<AccountDetail> {
  const payload = parseBody(archiveAccountBodySchema, body);
  const caller = await resolveCaller();
  await rpc(caller, "account_archive", {
    p_account: accountId,
    p_if_match: ifMatch,
    p_confirm_name: payload.confirm_name,
  });
  return buildAccountDetail(accountId);
}

/** `POST /api/v1/accounts/{id}/restore` — admins only; brings an archived account back. */
export async function restoreAccount(accountId: string, ifMatch: string): Promise<AccountDetail> {
  const caller = await resolveCaller();
  await rpc(caller, "account_restore", { p_account: accountId, p_if_match: ifMatch });
  return buildAccountDetail(accountId);
}

/** `POST /api/v1/accounts/{id}/pause` */
export async function pauseAccount(
  accountId: string,
  body: unknown,
  ifMatch: string,
): Promise<AccountDetail> {
  const parsed = pauseAccountBodySchema.safeParse(body);
  if (!parsed.success) {
    const reason = parsed.error.issues.some((issue) => issue.path[0] === "reason");
    throw reason
      ? new ApiError(422, "pause_reason_required", "Add a reason before pausing.")
      : validationError(parsed.error);
  }
  const caller = await resolveCaller();
  await rpc(caller, "account_pause", {
    p_account: accountId,
    p_if_match: ifMatch,
    p_reason: parsed.data.reason,
    p_until: parsed.data.until ?? null,
  });
  return buildAccountDetail(accountId);
}

/** `POST /api/v1/accounts/{id}/resume` */
export async function resumeAccount(accountId: string, ifMatch: string): Promise<AccountDetail> {
  const caller = await resolveCaller();
  await rpc(caller, "account_resume", { p_account: accountId, p_if_match: ifMatch });
  return buildAccountDetail(accountId);
}

/** A path id that is not a UUID can't name an account; answer 404, not 500. */
export function requireId(
  value: string | undefined,
  what: "account" | "contact" = "account",
): string {
  if (!value || !z.string().uuid().safeParse(value).success) {
    throw what === "account"
      ? NOT_FOUND()
      : new ApiError(404, "contact_not_found", "We couldn't find that contact.");
  }
  return value;
}
