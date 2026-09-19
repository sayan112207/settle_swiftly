import { describe, expect, test } from "bun:test";

import {
  ACCOUNT_IDS,
  getMockAccountDetail,
  getMockAccountsList,
  mockArchiveAccount,
  mockRestoreAccount,
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
