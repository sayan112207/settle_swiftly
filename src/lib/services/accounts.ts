import { z } from "zod";

import { getPublicEnv } from "@/lib/env.public";
import {
  accountActivitySchema,
  accountContactsSchema,
  accountDetailSchema,
  accountInvoicesSchema,
  accountPaymentsSchema,
  accountsListFilterSchema,
  accountsListSchema,
  accountsSortDirSchema,
  archiveAccountBodySchema,
  createContactBodySchema,
  pauseAccountBodySchema,
  updateChasingSettingsBodySchema,
  updateContactBodySchema,
  updateEscalationBodySchema,
  type AccountActivity,
  type AccountContacts,
  type AccountDetail,
  type AccountInvoices,
  type AccountPayments,
  type AccountsList,
  type AccountsListFilter,
  type AccountsSortDir,
  type AccountsView,
  type ArchiveAccountBody,
  type CreateContactBody,
  type PauseAccountBody,
  type UpdateChasingSettingsBody,
  type UpdateContactBody,
  type UpdateEscalationBody,
} from "@/lib/schemas/accounts";
import { apiErrorSchema } from "@/lib/schemas/dashboard";
import {
  getMockAccountActivity,
  getMockAccountContacts,
  getMockAccountDetail,
  getMockAccountInvoices,
  getMockAccountPayments,
  getMockAccountsList,
  MockAccountsConflictError,
  mockArchiveAccount,
  mockCreateContact,
  mockDeleteContact,
  mockPauseAccount,
  mockRestoreAccount,
  mockResumeAccount,
  mockUpdateChasingSettings,
  mockUpdateContact,
  mockUpdateEscalation,
} from "@/lib/services/accounts.mocks";

/**
 * Accounts data access. Components call these; they never call `fetch`.
 *
 * Mock and network paths both end at `schema.parse(...)`. Mutations return the
 * full updated resource — the frontend replaces its cache rather than guessing.
 */

export const accountsQueryKeys = {
  list: (params?: AccountsListParams) => ["accounts", "list", params ?? {}] as const,
  detail: (accountId: string) => ["accounts", "detail", accountId] as const,
  invoices: (accountId: string) => ["accounts", "invoices", accountId] as const,
  contacts: (accountId: string) => ["accounts", "contacts", accountId] as const,
  payments: (accountId: string) => ["accounts", "payments", accountId] as const,
  activity: (accountId: string, limit?: number) =>
    ["accounts", "activity", accountId, limit ?? null] as const,
  /**
   * The prefix every `activity` key starts with, for invalidation.
   *
   * `activity()` always appends a limit slot, so `activity(id)` is the key for
   * the *unlimited* query, not a parent of the limited ones. Invalidating with
   * it would quietly miss a cached `[..., id, 10]` the day a caller passes a
   * limit. React Query matches on prefix, so invalidate on this instead.
   */
  activityRoot: (accountId: string) => ["accounts", "activity", accountId] as const,
};

const API_BASE_PATH = "/api/v1";
const MOCK_DELAY_MS = 400;

const accountIdSchema = z.string().uuid();
const ifMatchSchema = z.string().min(1);

export type AccountsListParams = {
  /** Omitted means the live list; `archived` is the Archived tab. */
  view?: AccountsView;
  filter?: AccountsListFilter | AccountsListFilter[];
  sort?: string;
  dir?: AccountsSortDir;
  page?: number;
};

/**
 * A 4xx/5xx that arrived in the contract's error envelope.
 *
 * `message` is the backend's user-facing copy and is safe to render verbatim.
 */
export class AccountsApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AccountsApiError";
    this.code = code;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toAccountsApiError(error: unknown): never {
  if (error instanceof MockAccountsConflictError) {
    throw new AccountsApiError(error.code, error.message);
  }
  throw error;
}

/**
 * Performs the request and hands back the decoded body, or throws.
 *
 * Returns `unknown` on purpose — the caller must run it through a schema. A
 * generic that returned `T` here would let a caller skip validation and still
 * typecheck, which is the failure this module is built to prevent.
 *
 * Throws `AccountsApiError` when the failure arrived in the contract's error
 * envelope and a plain `Error` when it did not. Screens render the first
 * verbatim and fall back to their own copy for the second, so the two cases
 * must stay distinguishable by type.
 */
async function requestJson(path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`${API_BASE_PATH}${path}`, init);
  const body: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success) {
      throw new AccountsApiError(parsed.data.error.code, parsed.data.error.message);
    }
    // No envelope means the API broke its own contract. This message is for the
    // developer reading the console — no screen renders it, so an unlogged throw
    // would lose the status and path that explain the failure.
    const contractError = new Error(
      `${path} failed with ${response.status} and no error envelope. Check the API contract.`,
    );
    console.error(contractError);
    throw contractError;
  }

  return body;
}

/** The list's query string: view, repeatable filters, sort, direction and page. */
function buildListQuery(params: AccountsListParams): string {
  const search = new URLSearchParams();
  const filters =
    params.filter === undefined
      ? []
      : Array.isArray(params.filter)
        ? params.filter
        : [params.filter];
  for (const filter of filters) {
    search.append("filter", accountsListFilterSchema.parse(filter));
  }
  if (params.view === "archived") search.set("view", "archived");
  if (params.sort !== undefined) search.set("sort", params.sort);
  if (params.dir !== undefined) search.set("dir", accountsSortDirSchema.parse(params.dir));
  if (params.page !== undefined)
    search.set("page", String(z.number().int().positive().parse(params.page)));
  const qs = search.toString();
  return qs.length > 0 ? `?${qs}` : "";
}

function filterMockList(list: AccountsList, params: AccountsListParams): AccountsList {
  const filters =
    params.filter === undefined
      ? []
      : Array.isArray(params.filter)
        ? params.filter
        : [params.filter];

  let items = list.items;
  for (const filter of filters) {
    accountsListFilterSchema.parse(filter);
    if (filter === "has_overdue") {
      items = items.filter((item) => item.overdue !== "0.00" && item.overdue !== "0");
    } else if (filter === "missing_contacts") {
      items = items.filter(
        (item) => item.contacts.p0 === "missing" || item.contacts.p0 === "bounced",
      );
    } else if (filter === "paused") {
      items = items.filter((item) => item.chase_status === "paused");
    }
  }

  const dir = params.dir ?? "desc";
  const sort = params.sort ?? "outstanding";
  items = [...items].sort((a, b) => {
    const cmp = compareAccountRows(a, b, sort);
    return dir === "asc" ? cmp : -cmp;
  });

  const outstandingCents = items.reduce((sum, item) => sum + moneyToCents(item.outstanding), 0n);
  const overdueCents = items.reduce((sum, item) => sum + moneyToCents(item.overdue), 0n);

  return {
    ...list,
    filtered_count: items.length,
    filtered_outstanding: centsToMoney(outstandingCents),
    filtered_overdue: centsToMoney(overdueCents),
    items,
  };
}

function compareAccountRows(
  a: AccountsList["items"][number],
  b: AccountsList["items"][number],
  sort: string,
): number {
  switch (sort) {
    case "name":
      return a.name.localeCompare(b.name);
    case "outstanding":
      return moneyToCents(a.outstanding) < moneyToCents(b.outstanding)
        ? -1
        : moneyToCents(a.outstanding) > moneyToCents(b.outstanding)
          ? 1
          : 0;
    case "overdue":
      return moneyToCents(a.overdue) < moneyToCents(b.overdue)
        ? -1
        : moneyToCents(a.overdue) > moneyToCents(b.overdue)
          ? 1
          : 0;
    case "open_count":
      return a.open_count - b.open_count;
    case "oldest_overdue_days":
      return (a.oldest_overdue_days ?? -1) - (b.oldest_overdue_days ?? -1);
    case "avg_days_late":
      return (a.avg_days_late ?? -1) - (b.avg_days_late ?? -1);
    case "contacts":
      return contactSortKey(a.contacts).localeCompare(contactSortKey(b.contacts));
    case "chase_status":
      return a.chase_status.localeCompare(b.chase_status);
    default:
      return moneyToCents(a.outstanding) < moneyToCents(b.outstanding)
        ? -1
        : moneyToCents(a.outstanding) > moneyToCents(b.outstanding)
          ? 1
          : 0;
  }
}

function contactSortKey(contacts: AccountsList["items"][number]["contacts"]): string {
  return `${contacts.p0}:${contacts.p1}:${contacts.p2}`;
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

/** `GET /api/v1/accounts` */
export async function getAccounts(params: AccountsListParams = {}): Promise<AccountsList> {
  if (getPublicEnv().useAccountsMocks) {
    await delay(MOCK_DELAY_MS);
    return accountsListSchema.parse(filterMockList(getMockAccountsList(params.view), params));
  }

  const body = await requestJson(`/accounts${buildListQuery(params)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  return accountsListSchema.parse(body);
}

/** `GET /api/v1/accounts/{id}` */
export async function getAccount(accountId: string): Promise<AccountDetail> {
  const id = accountIdSchema.parse(accountId);

  if (getPublicEnv().useAccountsMocks) {
    await delay(MOCK_DELAY_MS);
    const detail = getMockAccountDetail(id);
    if (!detail) {
      throw new AccountsApiError("not_found", "Couldn't load this account.");
    }
    return accountDetailSchema.parse(detail);
  }

  const body = await requestJson(`/accounts/${id}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  return accountDetailSchema.parse(body);
}

/** `GET /api/v1/accounts/{id}/invoices` */
export async function getAccountInvoices(accountId: string): Promise<AccountInvoices> {
  const id = accountIdSchema.parse(accountId);

  if (getPublicEnv().useAccountsMocks) {
    await delay(MOCK_DELAY_MS);
    const invoices = getMockAccountInvoices(id);
    if (!invoices) {
      throw new AccountsApiError("not_found", "Couldn't load this account.");
    }
    return accountInvoicesSchema.parse(invoices);
  }

  const body = await requestJson(`/accounts/${id}/invoices`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  return accountInvoicesSchema.parse(body);
}

/** `GET /api/v1/accounts/{id}/contacts` */
export async function getAccountContacts(accountId: string): Promise<AccountContacts> {
  const id = accountIdSchema.parse(accountId);

  if (getPublicEnv().useAccountsMocks) {
    await delay(MOCK_DELAY_MS);
    const contacts = getMockAccountContacts(id);
    if (!contacts) {
      throw new AccountsApiError("not_found", "Couldn't load contacts.");
    }
    return accountContactsSchema.parse(contacts);
  }

  const body = await requestJson(`/accounts/${id}/contacts`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  return accountContactsSchema.parse(body);
}

/** `GET /api/v1/accounts/{id}/payments` */
export async function getAccountPayments(accountId: string): Promise<AccountPayments> {
  const id = accountIdSchema.parse(accountId);

  if (getPublicEnv().useAccountsMocks) {
    await delay(MOCK_DELAY_MS);
    const payments = getMockAccountPayments(id);
    if (!payments) {
      throw new AccountsApiError("not_found", "Couldn't load this account.");
    }
    return accountPaymentsSchema.parse(payments);
  }

  const body = await requestJson(`/accounts/${id}/payments`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  return accountPaymentsSchema.parse(body);
}

/** `GET /api/v1/accounts/{id}/activity?limit=` */
export async function getAccountActivity(
  accountId: string,
  limit?: number,
): Promise<AccountActivity> {
  const id = accountIdSchema.parse(accountId);
  const safeLimit =
    limit === undefined ? undefined : z.number().int().positive().max(100).parse(limit);

  if (getPublicEnv().useAccountsMocks) {
    await delay(MOCK_DELAY_MS);
    const activity = getMockAccountActivity(id, safeLimit);
    if (!activity) {
      throw new AccountsApiError("not_found", "Couldn't load this account.");
    }
    return accountActivitySchema.parse(activity);
  }

  const qs = safeLimit === undefined ? "" : `?limit=${safeLimit}`;
  const body = await requestJson(`/accounts/${id}/activity${qs}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  return accountActivitySchema.parse(body);
}

/** `POST /api/v1/accounts/{id}/contacts` */
export async function createAccountContact(
  accountId: string,
  body: CreateContactBody,
  ifMatch: string,
): Promise<AccountContacts> {
  const id = accountIdSchema.parse(accountId);
  const payload = createContactBodySchema.parse(body);
  const match = ifMatchSchema.parse(ifMatch);

  if (getPublicEnv().useAccountsMocks) {
    await delay(MOCK_DELAY_MS);
    try {
      return accountContactsSchema.parse(mockCreateContact(id, payload, match));
    } catch (error) {
      toAccountsApiError(error);
    }
  }

  const responseBody = await requestJson(`/accounts/${id}/contacts`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "If-Match": match,
    },
    body: JSON.stringify(payload),
  });
  return accountContactsSchema.parse(responseBody);
}

/** `PATCH /api/v1/accounts/{id}/contacts/{contactId}` */
export async function updateAccountContact(
  accountId: string,
  contactId: string,
  body: UpdateContactBody,
  ifMatch: string,
): Promise<AccountContacts> {
  const id = accountIdSchema.parse(accountId);
  const cid = accountIdSchema.parse(contactId);
  const payload = updateContactBodySchema.parse(body);
  const match = ifMatchSchema.parse(ifMatch);

  if (getPublicEnv().useAccountsMocks) {
    await delay(MOCK_DELAY_MS);
    try {
      return accountContactsSchema.parse(mockUpdateContact(id, cid, payload, match));
    } catch (error) {
      toAccountsApiError(error);
    }
  }

  const responseBody = await requestJson(`/accounts/${id}/contacts/${cid}`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "If-Match": match,
    },
    body: JSON.stringify(payload),
  });
  return accountContactsSchema.parse(responseBody);
}

/** `DELETE /api/v1/accounts/{id}/contacts/{contactId}` */
export async function deleteAccountContact(
  accountId: string,
  contactId: string,
  ifMatch: string,
): Promise<AccountContacts> {
  const id = accountIdSchema.parse(accountId);
  const cid = accountIdSchema.parse(contactId);
  const match = ifMatchSchema.parse(ifMatch);

  if (getPublicEnv().useAccountsMocks) {
    await delay(MOCK_DELAY_MS);
    try {
      return accountContactsSchema.parse(mockDeleteContact(id, cid, match));
    } catch (error) {
      toAccountsApiError(error);
    }
  }

  const responseBody = await requestJson(`/accounts/${id}/contacts/${cid}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      "If-Match": match,
    },
  });
  return accountContactsSchema.parse(responseBody);
}

/** `PATCH /api/v1/accounts/{id}/escalation` */
export async function updateAccountEscalation(
  accountId: string,
  body: UpdateEscalationBody,
  ifMatch: string,
): Promise<AccountContacts> {
  const id = accountIdSchema.parse(accountId);
  const payload = updateEscalationBodySchema.parse(body);
  const match = ifMatchSchema.parse(ifMatch);

  if (getPublicEnv().useAccountsMocks) {
    await delay(MOCK_DELAY_MS);
    try {
      return accountContactsSchema.parse(mockUpdateEscalation(id, payload, match));
    } catch (error) {
      toAccountsApiError(error);
    }
  }

  const responseBody = await requestJson(`/accounts/${id}/escalation`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "If-Match": match,
    },
    body: JSON.stringify(payload),
  });
  return accountContactsSchema.parse(responseBody);
}

/** `PATCH /api/v1/accounts/{id}/chasing-settings` */
export async function updateChasingSettings(
  accountId: string,
  body: UpdateChasingSettingsBody,
  ifMatch: string,
): Promise<AccountDetail> {
  const id = accountIdSchema.parse(accountId);
  const payload = updateChasingSettingsBodySchema.parse(body);
  const match = ifMatchSchema.parse(ifMatch);

  if (getPublicEnv().useAccountsMocks) {
    await delay(MOCK_DELAY_MS);
    try {
      return accountDetailSchema.parse(mockUpdateChasingSettings(id, payload, match));
    } catch (error) {
      toAccountsApiError(error);
    }
  }

  const responseBody = await requestJson(`/accounts/${id}/chasing-settings`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "If-Match": match,
    },
    body: JSON.stringify(payload),
  });
  return accountDetailSchema.parse(responseBody);
}

/** `POST /api/v1/accounts/{id}/archive` */
export async function archiveAccount(
  accountId: string,
  body: ArchiveAccountBody,
  ifMatch: string,
): Promise<AccountDetail> {
  const id = accountIdSchema.parse(accountId);
  const payload = archiveAccountBodySchema.parse(body);
  const match = ifMatchSchema.parse(ifMatch);

  if (getPublicEnv().useAccountsMocks) {
    await delay(MOCK_DELAY_MS);
    try {
      return accountDetailSchema.parse(mockArchiveAccount(id, payload, match));
    } catch (error) {
      toAccountsApiError(error);
    }
  }

  const responseBody = await requestJson(`/accounts/${id}/archive`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "If-Match": match,
    },
    body: JSON.stringify(payload),
  });
  return accountDetailSchema.parse(responseBody);
}

/** `POST /api/v1/accounts/{id}/pause` */
export async function pauseAccount(
  accountId: string,
  body: PauseAccountBody,
  ifMatch: string,
): Promise<AccountDetail> {
  const id = accountIdSchema.parse(accountId);
  const payload = pauseAccountBodySchema.parse(body);
  const match = ifMatchSchema.parse(ifMatch);

  if (getPublicEnv().useAccountsMocks) {
    await delay(MOCK_DELAY_MS);
    try {
      return accountDetailSchema.parse(mockPauseAccount(id, payload, match));
    } catch (error) {
      toAccountsApiError(error);
    }
  }

  const responseBody = await requestJson(`/accounts/${id}/pause`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "If-Match": match,
    },
    body: JSON.stringify(payload),
  });
  return accountDetailSchema.parse(responseBody);
}

/** `POST /api/v1/accounts/{id}/resume` */
export async function resumeAccount(accountId: string, ifMatch: string): Promise<AccountDetail> {
  const id = accountIdSchema.parse(accountId);
  const match = ifMatchSchema.parse(ifMatch);

  if (getPublicEnv().useAccountsMocks) {
    await delay(MOCK_DELAY_MS);
    try {
      return accountDetailSchema.parse(mockResumeAccount(id, match));
    } catch (error) {
      toAccountsApiError(error);
    }
  }

  const responseBody = await requestJson(`/accounts/${id}/resume`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "If-Match": match,
    },
  });
  return accountDetailSchema.parse(responseBody);
}

/** `POST /api/v1/accounts/{id}/restore` — un-archives the account. Admins only. */
export async function restoreAccount(accountId: string, ifMatch: string): Promise<AccountDetail> {
  const id = accountIdSchema.parse(accountId);
  const match = ifMatchSchema.parse(ifMatch);

  if (getPublicEnv().useAccountsMocks) {
    await delay(MOCK_DELAY_MS);
    try {
      return accountDetailSchema.parse(mockRestoreAccount(id, match));
    } catch (error) {
      toAccountsApiError(error);
    }
  }

  const responseBody = await requestJson(`/accounts/${id}/restore`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "If-Match": match,
    },
  });
  return accountDetailSchema.parse(responseBody);
}
