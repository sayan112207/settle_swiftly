import { describe, expect, test } from "bun:test";

import { composeReminder, senderHeader, type ReminderContext } from "@/lib/services/reminder-copy";

const BASE: ReminderContext = {
  orgName: "Northline Creative",
  contactName: "Rajat Mehta",
  accountName: "Sharma Traders",
  invoiceNumber: "INV-2231",
  amount: "482000.00",
  dueDate: "2026-09-14",
  daysOverdue: 14,
  tone: "Standard",
  language: "en",
};

describe("senderHeader", () => {
  test("the From name is the org, not the product", () => {
    // The customer owes this business money and has never heard of the tool.
    expect(senderHeader("Northline Creative", "contact@settleswiftly.com")).toBe(
      '"Northline Creative" <contact@settleswiftly.com>',
    );
  });

  test("a business name with a comma stays one address", () => {
    // Unquoted, "Sharma Traders Pvt. Ltd, Mumbai" parses as two recipients.
    const header = senderHeader("Sharma Traders Pvt. Ltd, Mumbai", "contact@settleswiftly.com");
    expect(header).toBe('"Sharma Traders Pvt. Ltd, Mumbai" <contact@settleswiftly.com>');
  });

  test("an embedded quote cannot break out of the display name", () => {
    expect(senderHeader('Acme " Ltd', "contact@settleswiftly.com")).toBe(
      '"Acme  Ltd" <contact@settleswiftly.com>',
    );
  });

  test("a blank org name falls back to the bare address", () => {
    expect(senderHeader("   ", "contact@settleswiftly.com")).toBe("contact@settleswiftly.com");
  });
});

describe("subject", () => {
  test("every tone carries the invoice number", () => {
    // The recipient's accounts inbox is searched by it.
    for (const tone of ["Gentle", "Standard", "Firm"] as const) {
      const { subject } = composeReminder({ ...BASE, tone });
      expect(subject.includes("INV-2231")).toBe(true);
    }
  });

  test("gentle before the due date says due, not overdue", () => {
    const { subject } = composeReminder({ ...BASE, tone: "Gentle", daysOverdue: -3 });
    expect(subject.includes("overdue")).toBe(false);
    expect(subject.includes("due")).toBe(true);
  });

  test("firm leads with the number of days", () => {
    const { subject } = composeReminder({ ...BASE, tone: "Firm", daysOverdue: 45 });
    expect(subject).toBe("Invoice INV-2231 — 45 days overdue");
  });
});

describe("body", () => {
  test("gentle greets by first name and does not accuse", () => {
    const { textBody } = composeReminder({ ...BASE, tone: "Gentle", daysOverdue: -3 });
    expect(textBody.startsWith("Hi Rajat — ")).toBe(true);
    expect(textBody.includes("overdue")).toBe(false);
    // The escape hatch matters: most unpaid invoices are an oversight.
    expect(textBody.includes("already on its way")).toBe(true);
  });

  test("standard states the position and asks a question", () => {
    const { textBody } = composeReminder(BASE);
    expect(textBody.startsWith("Hi Rajat,")).toBe(true);
    expect(textBody.includes("14 days overdue")).toBe(true);
    expect(textBody.includes("when it will be paid")).toBe(true);
  });

  test("one day overdue is not pluralised", () => {
    const { textBody } = composeReminder({ ...BASE, daysOverdue: 1 });
    expect(textBody.includes("1 day overdue")).toBe(true);
  });

  test("firm drops the greeting and addresses the company", () => {
    // At this point the message is to the business, and the individual should
    // not feel personally accused.
    const { textBody } = composeReminder({ ...BASE, tone: "Firm", daysOverdue: 45 });
    expect(textBody.startsWith("Invoice INV-2231")).toBe(true);
    expect(textBody.includes("Hi Rajat")).toBe(false);
    expect(textBody.includes("Re: Sharma Traders")).toBe(true);
  });

  test("firm offers the dispute route rather than a threat", () => {
    // The product can pause chasing on a dispute; it cannot take legal
    // action, so it must not imply it will.
    const { textBody } = composeReminder({ ...BASE, tone: "Firm", daysOverdue: 45 });
    expect(textBody.includes("disputed")).toBe(true);
    expect(textBody.includes("legal")).toBe(false);
  });

  test("no tone shouts", () => {
    for (const tone of ["Gentle", "Standard", "Firm"] as const) {
      const { subject, textBody } = composeReminder({ ...BASE, tone });
      expect(`${subject}${textBody}`.includes("!")).toBe(false);
    }
  });

  test("every tone signs off as the org and formats money in lakhs", () => {
    for (const tone of ["Gentle", "Standard", "Firm"] as const) {
      const { textBody } = composeReminder({ ...BASE, tone });
      expect(textBody.includes("Northline Creative")).toBe(true);
      // ₹4,82,000.00 — Indian grouping, two decimals, never abbreviated.
      expect(textBody.includes("₹4,82,000.00")).toBe(true);
    }
  });
});
