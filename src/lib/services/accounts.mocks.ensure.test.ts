import { describe, expect, test } from "bun:test";

import {
  ACCOUNT_IDS,
  getMockAccountContacts,
  getMockAccountDetail,
  getMockAccountInvoices,
  getMockAccountsList,
  mockCreateContact,
  mockUpdateContact,
  mockEnsureAccounts,
  mockPauseAccount,
  resetAccountsMocks,
} from "@/lib/services/accounts.mocks";

describe("mockEnsureAccounts", () => {
  test("creates an account the fixture book has never billed", () => {
    resetAccountsMocks();
    const before = getMockAccountsList().total_count;

    const { accounts } = mockEnsureAccounts(["Nilgiri Roasters"]);

    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.created).toBe(true);
    expect(accounts[0]?.name).toBe("Nilgiri Roasters");
    expect(accounts[0]?.requested_name).toBe("Nilgiri Roasters");
    expect(getMockAccountsList().total_count).toBe(before + 1);
  });

  test("a new account is listed as unchaseable, not active", () => {
    resetAccountsMocks();
    const { accounts } = mockEnsureAccounts(["Nilgiri Roasters"]);
    const row = getMockAccountsList().items.find(
      (item) => item.account_id === accounts[0]?.account_id,
    );

    // No contacts means no P0, and the spec is explicit that an account
    // without one cannot be chased. Showing it as Active would promise
    // chasing that will never happen.
    expect(row?.chase_status).toBe("no_p0");
    expect(row?.status_label).toBe("Can't chase");
    expect(row?.outstanding).toBe("0.00");
    expect(row?.open_count).toBe(0);
  });

  test("keeps the org total an org total, not a page count", () => {
    resetAccountsMocks();
    const before = getMockAccountsList();
    // The fixture is 47 accounts in the org showing 12 of them. Recounting
    // from `items` here would collapse the org total onto the visible page.
    expect(before.org_totals.account_count).toBe(47);
    expect(before.items.length).toBe(12);

    mockEnsureAccounts(["Nilgiri Roasters"]);

    const after = getMockAccountsList();
    expect(after.org_totals.account_count).toBe(48);
    expect(after.total_count).toBe(48);
    expect(after.items.length).toBe(13);
  });

  test("matches an existing account instead of creating a second one", () => {
    resetAccountsMocks();
    const existing = getMockAccountsList().items[0]!;
    const before = getMockAccountsList().total_count;

    const { accounts } = mockEnsureAccounts([existing.name.toUpperCase()]);

    expect(accounts[0]?.created).toBe(false);
    expect(accounts[0]?.account_id).toBe(existing.account_id);
    // The echo is what the caller asked for; `name` is what the org calls it.
    expect(accounts[0]?.requested_name).toBe(existing.name.toUpperCase());
    expect(accounts[0]?.name).toBe(existing.name);
    expect(getMockAccountsList().total_count).toBe(before);
  });

  test("two spellings of one new customer: one account, but a row for each", () => {
    resetAccountsMocks();
    const before = getMockAccountsList().total_count;

    const { accounts } = mockEnsureAccounts(["Nilgiri Roasters", "  nilgiri   roasters  "]);

    // One account — but the caller maps its drafts by the name it sent, so a
    // spelling that got no row back would fail the whole batch.
    expect(getMockAccountsList().total_count).toBe(before + 1);
    expect(accounts).toHaveLength(2);
    expect(accounts.map((a) => a.requested_name)).toEqual([
      "Nilgiri Roasters",
      "nilgiri   roasters",
    ]);
    expect(new Set(accounts.map((a) => a.account_id)).size).toBe(1);
    // Both rows report the id as created, as the RPC does; the caller counts
    // distinct ids rather than rows.
    expect(accounts.every((a) => a.created)).toBe(true);
  });

  test("the same spelling twice is answered once", () => {
    resetAccountsMocks();

    const { accounts } = mockEnsureAccounts(["Nilgiri Roasters", "Nilgiri Roasters"]);

    expect(accounts).toHaveLength(1);
  });

  test("skips blank names rather than creating an unnamed account", () => {
    resetAccountsMocks();
    const before = getMockAccountsList().total_count;

    const { accounts } = mockEnsureAccounts(["   ", ""]);

    expect(accounts).toHaveLength(0);
    expect(getMockAccountsList().total_count).toBe(before);
  });
});

describe("mockCreateContact", () => {
  /** A fresh account and the ladder token its first contact has to carry. */
  function newAccount(name: string) {
    resetAccountsMocks();
    const { accounts } = mockEnsureAccounts([name]);
    const id = accounts[0]!.account_id;
    return { id, ifMatch: getMockAccountContacts(id)!.updated_at };
  }
  const row = (id: string) => getMockAccountsList().items.find((item) => item.account_id === id);

  const CONTACT = {
    tier: "P0" as const,
    name: "Rajat Mehta",
    email: "rajat@example.com",
    channel_email: true,
  };

  test("a first P0 makes the account chaseable in the list", () => {
    const { id, ifMatch } = newAccount("Nilgiri Roasters");
    expect(row(id)?.chase_status).toBe("no_p0");

    mockCreateContact(id, CONTACT, ifMatch);

    // The real list derives both of these from the ladder on every read, so a
    // row still reading "Can't chase" would contradict the contact just added.
    expect(row(id)?.chase_status).toBe("active");
    expect(row(id)?.status_label).toBe("Active");
    expect(row(id)?.contacts.p0).toBe("present");
  });

  test("a P1 does not make an account chaseable", () => {
    const { id, ifMatch } = newAccount("Nilgiri Roasters");

    mockCreateContact(id, { ...CONTACT, tier: "P1" }, ifMatch);

    expect(row(id)?.contacts.p1).toBe("present");
    expect(row(id)?.contacts.p0).toBe("missing");
    expect(row(id)?.chase_status).toBe("no_p0");
  });

  test("a do-not-contact P0 is not a usable one", () => {
    const { id, ifMatch } = newAccount("Nilgiri Roasters");

    mockCreateContact(
      id,
      { ...CONTACT, do_not_contact: true, dnc_reason: "Asked not to be chased" },
      ifMatch,
    );

    expect(row(id)?.contacts.p0).toBe("dnc");
    expect(row(id)?.chase_status).toBe("no_p0");
  });

  test("works on an account with no stored contacts fixture", () => {
    // Every account created during a session is in this state: the read
    // synthesizes an empty ladder, so the create has to accept one too.
    const { id, ifMatch } = newAccount("Nilgiri Roasters");
    mockCreateContact(id, CONTACT, ifMatch);
    expect(getMockAccountContacts(id)?.contacts).toHaveLength(1);
  });
});

describe("invoice chase reasons follow the ladder", () => {
  /** Every reason on the account's invoices, deduplicated. */
  function reasons(accountId: string) {
    const invoices = getMockAccountInvoices(accountId);
    return [
      ...new Set(
        (invoices?.groups ?? []).flatMap((group) =>
          group.invoices.map((invoice) => invoice.chase_disabled_reason),
        ),
      ),
    ];
  }

  test("fixing a bouncing P0 clears the reason from every invoice", () => {
    resetAccountsMocks();
    const id = ACCOUNT_IDS.sharma;
    // Sharma ships bounced_p0: every invoice names the bouncing contact.
    expect(reasons(id)).toEqual(["Can't chase — Rajat Mehta's email is bouncing"]);

    const ladder = getMockAccountContacts(id)!;
    mockCreateContact(
      id,
      { tier: "P0", name: "Reachable Replacement", email: "reachable@example.com" },
      ladder.updated_at,
    );

    // The header says Active now, and the invoice rows must not still be
    // telling the user the account can't be chased.
    expect(reasons(id)).toEqual([null]);
  });

  test("a paused account says so on its invoices", () => {
    resetAccountsMocks();
    const id = ACCOUNT_IDS.sharma;
    const detail = getMockAccountDetail(id)!;

    mockPauseAccount(id, { reason: "Dispute" }, detail.updated_at);

    // Pausing writes chase_status onto the detail and never touches the list
    // row, so a row-first lookup would still report the bounce here.
    expect(reasons(id)).toEqual(["Chasing is paused for this account"]);
  });

  test("silencing the replacement puts the bouncing reason back", () => {
    resetAccountsMocks();
    const id = ACCOUNT_IDS.sharma;

    const before = getMockAccountContacts(id)!;
    const added = mockCreateContact(
      id,
      { tier: "P0", name: "Reachable Replacement", email: "reachable@example.com" },
      before.updated_at,
    );
    expect(reasons(id)).toEqual([null]);

    // Mark the replacement do-not-contact. The original P0 is still there and
    // still bouncing, so the account falls back to bounced_p0 rather than to
    // "no primary contact" — the two need different fixes and say so.
    const replacement = added.contacts.find((c) => c.name === "Reachable Replacement")!;
    mockUpdateContact(
      id,
      replacement.contact_id,
      { do_not_contact: true, dnc_reason: "Asked not to be chased" },
      added.updated_at,
    );

    expect(reasons(id)).toEqual(["Can't chase — Rajat Mehta's email is bouncing"]);
  });
});

describe("accounts whose ladder the fixtures never spelled out", () => {
  const row = (id: string) => getMockAccountsList().items.find((item) => item.account_id === id);

  test("adding a P1 to an active account leaves it chaseable", () => {
    resetAccountsMocks();
    const id = ACCOUNT_IDS.meridian;
    // Meridian carries pips and an Active status but no ladder fixture, so the
    // first read synthesizes an empty one. Recomputing the summary from that
    // would report the account as having no primary contact.
    expect(row(id)?.chase_status).toBe("active");
    expect(row(id)?.contacts.p0).toBe("present");

    const ladder = getMockAccountContacts(id)!;
    expect(ladder.contacts).toHaveLength(0);
    mockCreateContact(
      id,
      { tier: "P1", name: "Second Escalation", email: "second@example.com" },
      ladder.updated_at,
    );

    expect(row(id)?.chase_status).toBe("active");
    expect(row(id)?.status_label).toBe("Active");
    expect(row(id)?.contacts.p0).toBe("present");
  });

  test("a brand-new account is still recomputed, its empty ladder being the truth", () => {
    resetAccountsMocks();
    const { accounts } = mockEnsureAccounts(["Nilgiri Roasters"]);
    const id = accounts[0]!.account_id;
    const ladder = getMockAccountContacts(id)!;

    mockCreateContact(
      id,
      { tier: "P0", name: "Rajat Mehta", email: "rajat@example.com" },
      ladder.updated_at,
    );

    expect(row(id)?.chase_status).toBe("active");
  });
});
