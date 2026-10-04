import { describe, expect, test } from "bun:test";

import {
  ACCOUNT_IDS,
  getMockAccountContacts,
  getMockAccountDetail,
  getMockAccountsList,
  MockAccountsConflictError,
  mockArchiveAccount,
  mockCreateContact,
  mockDeleteContact,
  mockRestoreAccount,
  mockUpdateContact,
  resetAccountsMocks,
} from "@/lib/services/accounts.mocks";

describe("mock archive / restore", () => {
  test("restore puts total_count back where archive found it", () => {
    resetAccountsMocks();
    const before = getMockAccountsList();
    const detail = getMockAccountDetail(ACCOUNT_IDS.sharma);
    if (!detail) throw new Error("Sharma fixture missing");

    const archived = mockArchiveAccount(
      ACCOUNT_IDS.sharma,
      { confirm_name: detail.name },
      detail.updated_at,
    );
    expect(getMockAccountsList().total_count).toBe(before.total_count - 1);
    expect(getMockAccountsList("archived").items.map((i) => i.account_id)).toEqual([
      ACCOUNT_IDS.sharma,
    ]);

    mockRestoreAccount(ACCOUNT_IDS.sharma, archived.updated_at);
    const after = getMockAccountsList();
    expect(after.total_count).toBe(before.total_count);
    expect(after.items.length).toBe(before.items.length);
    expect(getMockAccountsList("archived").items).toEqual([]);
    resetAccountsMocks();
  });
});

describe("contact writes on an archived account", () => {
  /** Archives Sharma and hands back its id plus a fresh ladder token. */
  function archivedSharma() {
    resetAccountsMocks();
    const detail = getMockAccountDetail(ACCOUNT_IDS.sharma);
    if (!detail) throw new Error("Sharma fixture missing");
    mockArchiveAccount(ACCOUNT_IDS.sharma, { confirm_name: detail.name }, detail.updated_at);
    const ladder = getMockAccountContacts(ACCOUNT_IDS.sharma);
    if (!ladder) throw new Error("Sharma ladder missing");
    return { id: ACCOUNT_IDS.sharma, ifMatch: ladder.updated_at, contacts: ladder.contacts };
  }

  const expectArchivedRefusal = (run: () => unknown) => {
    // `app.lock_account_for_write` raises this before it looks at If-Match, so
    // the mock has to refuse in the same place or it accepts writes the real
    // backend rejects.
    try {
      run();
    } catch (error) {
      expect(error instanceof MockAccountsConflictError).toBe(true);
      expect((error as MockAccountsConflictError).code).toBe("account_archived");
      return;
    }
    throw new Error("Expected the write to be refused.");
  };

  test("adding a contact is refused", () => {
    const { id, ifMatch } = archivedSharma();
    expectArchivedRefusal(() =>
      mockCreateContact(id, { tier: "P0", name: "Nope", email: "nope@example.com" }, ifMatch),
    );
  });

  test("editing a contact is refused", () => {
    const { id, ifMatch, contacts } = archivedSharma();
    expectArchivedRefusal(() =>
      mockUpdateContact(id, contacts[0]!.contact_id, { name: "Renamed" }, ifMatch),
    );
  });

  test("removing a contact is refused", () => {
    const { id, ifMatch, contacts } = archivedSharma();
    expectArchivedRefusal(() => mockDeleteContact(id, contacts[0]!.contact_id, ifMatch));
  });

  test("restoring the account allows them again", () => {
    const { id } = archivedSharma();
    const detail = getMockAccountDetail(id);
    if (!detail) throw new Error("detail missing");
    mockRestoreAccount(id, detail.updated_at);

    const ladder = getMockAccountContacts(id);
    if (!ladder) throw new Error("ladder missing");
    const before = ladder.contacts.length;
    mockCreateContact(
      id,
      { tier: "P1", name: "Back In Business", email: "back@example.com" },
      ladder.updated_at,
    );
    expect(getMockAccountContacts(id)?.contacts).toHaveLength(before + 1);
  });
});
