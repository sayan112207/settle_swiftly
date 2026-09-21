import { describe, expect, test } from "bun:test";

import {
  ACCOUNT_IDS,
  accountListItemsFixture,
  CONTACT_IDS,
  getMockAccountContacts,
  getMockAccountDetail,
  LONG_ACCOUNT_NAME,
  mockCreateContact,
  mockUpdateContact,
  mockUpdateChasingSettings,
  sharmaContactsFixture,
  sharmaDetailFixture,
} from "@/lib/services/accounts.mocks";
import type { AccountContact } from "@/lib/schemas/accounts";

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

describe("accounts list fixtures", () => {
  test("twelve rows outstanding sum to 3637000.00 and overdue to 1994000.00", () => {
    expect(accountListItemsFixture).toHaveLength(12);

    const outstanding = accountListItemsFixture.reduce(
      (sum, row) => sum + moneyToCents(row.outstanding),
      0n,
    );
    const overdue = accountListItemsFixture.reduce(
      (sum, row) => sum + moneyToCents(row.overdue),
      0n,
    );

    expect(centsToMoney(outstanding)).toBe("3637000.00");
    expect(centsToMoney(overdue)).toBe("1994000.00");
  });

  test("overflow account name is exactly 60 characters", () => {
    expect(LONG_ACCOUNT_NAME).toHaveLength(60);
  });
});

describe("Sharma Traders detail fixtures", () => {
  test("aging buckets sum to outstanding and overdue equals total minus Not yet due", () => {
    const agingSum = sharmaDetailFixture.aging.reduce(
      (sum, segment) => sum + moneyToCents(segment.amount),
      0n,
    );
    expect(centsToMoney(agingSum)).toBe(sharmaDetailFixture.outstanding);

    const notYetDue = sharmaDetailFixture.aging.find((segment) => segment.bucket === "Not yet due");
    if (!notYetDue) {
      throw new Error("missing Not yet due bucket");
    }
    const expectedOverdue =
      moneyToCents(sharmaDetailFixture.outstanding) - moneyToCents(notYetDue.amount);
    expect(centsToMoney(expectedOverdue)).toBe(sharmaDetailFixture.overdue);
  });
});

describe("last usable P0 is protected", () => {
  // Sharma has exactly one usable P0 (Rajat Mehta), so any edit that would stop
  // it being a usable P0 has to be refused.
  function sharmaToken(): string {
    const contacts = getMockAccountContacts(ACCOUNT_IDS.sharma);
    if (!contacts) throw new Error("missing Sharma contacts fixture");
    return contacts.updated_at;
  }

  test("moving the only usable P0 to another tier is rejected", () => {
    expect(() =>
      mockUpdateContact(ACCOUNT_IDS.sharma, CONTACT_IDS.rajat, { tier: "P1" }, sharmaToken()),
    ).toThrow("An account needs a P0 contact to be chased. Add a replacement first.");
  });

  test("marking the only usable P0 do-not-contact is rejected", () => {
    expect(() =>
      mockUpdateContact(
        ACCOUNT_IDS.sharma,
        CONTACT_IDS.rajat,
        { do_not_contact: true, dnc_reason: "Left the company" },
        sharmaToken(),
      ),
    ).toThrow("An account needs a P0 contact to be chased. Add a replacement first.");
  });

  test("a P0 edit that keeps it usable still goes through", () => {
    const updated = mockUpdateContact(
      ACCOUNT_IDS.sharma,
      CONTACT_IDS.rajat,
      { tier: "P0", designation: "Accounts Payable" },
      sharmaToken(),
    );
    const rajat = updated.contacts.find((c) => c.contact_id === CONTACT_IDS.rajat);
    expect(rajat?.tier).toBe("P0");
    expect(rajat?.designation).toBe("Accounts Payable");
  });
});

describe("a channel needs something to send to", () => {
  // Rajesh is P1, so these edits never collide with the last-usable-P0 rule.
  function token(): string {
    const contacts = getMockAccountContacts(ACCOUNT_IDS.sharma);
    if (!contacts) throw new Error("missing Sharma contacts fixture");
    return contacts.updated_at;
  }

  /** Puts Rajesh back to the fixture's email-and-phone, email-only state. */
  function reset(): void {
    mockUpdateContact(
      ACCOUNT_IDS.sharma,
      CONTACT_IDS.rajesh,
      {
        phone: "+91 99••• •••04",
        channel_email: true,
        channel_whatsapp: false,
        channel_sms: false,
      },
      token(),
    );
  }

  test("switching WhatsApp on without a phone number is refused", () => {
    reset();
    mockUpdateContact(ACCOUNT_IDS.sharma, CONTACT_IDS.rajesh, { phone: null }, token());

    expect(() =>
      mockUpdateContact(
        ACCOUNT_IDS.sharma,
        CONTACT_IDS.rajesh,
        { channel_whatsapp: true },
        token(),
      ),
    ).toThrow("WhatsApp needs a phone number.");
  });

  test("clearing the phone number under a live SMS channel is refused", () => {
    reset();
    mockUpdateContact(ACCOUNT_IDS.sharma, CONTACT_IDS.rajesh, { channel_sms: true }, token());

    // The rule reads the merged contact, so the same combination is refused
    // whichever half of it the patch carries.
    expect(() =>
      mockUpdateContact(ACCOUNT_IDS.sharma, CONTACT_IDS.rajesh, { phone: null }, token()),
    ).toThrow("SMS needs a phone number.");
    reset();
  });

  test("a new contact cannot arrive with a channel it can't deliver on", () => {
    expect(() =>
      mockCreateContact(
        ACCOUNT_IDS.sharma,
        {
          tier: "P1",
          name: "Priya Nair",
          email: "priya@sharmatraders.com",
          channel_whatsapp: true,
        },
        token(),
      ),
    ).toThrow("WhatsApp needs a phone number.");
  });

  test("an email-only contact still has to turn Email off, default or not", () => {
    // channel_email defaults to true, so leaving the address out is the one
    // way a create body can break the rule without naming a channel at all.
    expect(() =>
      mockCreateContact(
        ACCOUNT_IDS.sharma,
        { tier: "P1", name: "Priya Nair", phone: "+91 98765 43210" },
        token(),
      ),
    ).toThrow("Email needs an address to send to.");
  });
});

describe("a corrected email address clears the bounce", () => {
  // Rajat is Sharma's only usable P0 and his address is bouncing, which is what
  // puts the account on "Can't chase". Editing that address is the fix the
  // bounce strip asks for, so it has to actually land.
  function token(): string {
    const contacts = getMockAccountContacts(ACCOUNT_IDS.sharma);
    if (!contacts) throw new Error("missing Sharma contacts fixture");
    return contacts.updated_at;
  }

  function rajat(contacts: { contacts: { contact_id: string }[] }) {
    const found = contacts.contacts.find((c) => c.contact_id === CONTACT_IDS.rajat);
    if (!found) throw new Error("missing Rajat");
    return found as AccountContact;
  }

  // One sequence rather than two tests: the fixture's bounce is spent the first
  // time an address is changed, so the "kept" half has to be observed before
  // the "cleared" half, not left to the order two tests happen to run in.
  test("kept by an edit that leaves the address alone, cleared by one that doesn't", () => {
    const before = rajat(sharmaContactsFixture);
    expect(before.delivery_state).toBe("bounced");
    // A timestamp, not just "defined": null is defined too, and that is the
    // exact value this is here to rule out.
    expect(typeof before.last_bounced_at).toBe("string");

    // `delivery_state` is the mail provider's, not the user's: renaming
    // somebody does not clear what their address did.
    const renamed = rajat(
      mockUpdateContact(
        ACCOUNT_IDS.sharma,
        CONTACT_IDS.rajat,
        { designation: "Senior Accounts Executive" },
        token(),
      ),
    );
    expect(renamed.delivery_state).toBe("bounced");
    expect(renamed.last_bounced_at).toBe(before.last_bounced_at);

    // The address the verdict was about is gone, so the new one starts where
    // every address starts.
    const corrected = rajat(
      mockUpdateContact(
        ACCOUNT_IDS.sharma,
        CONTACT_IDS.rajat,
        { email: "rajat.mehta@sharmatraders.com" },
        token(),
      ),
    );
    expect(corrected.delivery_state).toBe("unverified");
    expect(corrected.last_bounced_at).toBeNull();
  });
});

describe("account settings owner", () => {
  test("clearing the owner clears the owner name with it", () => {
    const before = getMockAccountDetail(ACCOUNT_IDS.sharma);
    if (!before) throw new Error("missing Sharma detail fixture");

    // The settings body is now the whole chasing-settings resource, so the call
    // echoes the current values back and changes only the owner.
    const s = before.settings;
    const after = mockUpdateChasingSettings(
      ACCOUNT_IDS.sharma,
      {
        chase_mode: s.chase_mode,
        stop_reason: s.stop_reason,
        stop_note: s.stop_note,
        send_window_mode: s.send_window_mode,
        terms_preset: s.terms_preset,
        term_days: s.term_days,
        is_msme: s.is_msme,
        tds_section: s.tds_section,
        tds_rate: s.tds_rate,
        owner_user_id: null,
        notes: s.notes,
      },
      before.updated_at,
    );

    expect(after.settings.owner_user_id).toBeNull();
    expect(after.settings.owner_name).toBeNull();
  });

  test("an unknown owner id carries no name", () => {
    const before = getMockAccountDetail(ACCOUNT_IDS.sharma);
    if (!before) throw new Error("missing Sharma detail fixture");

    const s = before.settings;
    const after = mockUpdateChasingSettings(
      ACCOUNT_IDS.sharma,
      {
        chase_mode: s.chase_mode,
        stop_reason: s.stop_reason,
        stop_note: s.stop_note,
        send_window_mode: s.send_window_mode,
        terms_preset: s.terms_preset,
        term_days: s.term_days,
        is_msme: s.is_msme,
        tds_section: s.tds_section,
        tds_rate: s.tds_rate,
        owner_user_id: "ffffffff-0000-4000-8000-00000000ffff",
        notes: s.notes,
      },
      before.updated_at,
    );

    // The id is stored, so the name must not be the previous owner's.
    expect(after.settings.owner_user_id).toBe("ffffffff-0000-4000-8000-00000000ffff");
    expect(after.settings.owner_name).toBeNull();
  });
});
