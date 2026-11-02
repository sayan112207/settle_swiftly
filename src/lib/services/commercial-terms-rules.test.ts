import { describe, expect, test } from "bun:test";

import type { FeePolicy, PaymentPlan } from "@/lib/schemas/commercial-terms";
import { commercialTermsSchema, paymentPlanSchema } from "@/lib/schemas/commercial-terms";
import { accountListItemsFixture } from "@/lib/services/accounts.mocks";
import {
  accruedInterest,
  addMonthsClamped,
  bankRateAgeDays,
  daysBetween,
  discountVerdict,
  formatAccrualPeriod,
  fromPaise,
  impliedDiscountCostPct,
  indexAccountTerms,
  interestClaimGate,
  invoiceInterest,
  istDateOf,
  planProgress,
  rateDescription,
  rateWorking,
  settlementCheck,
  splitInstalments,
  statutoryRatePct,
  toPaise,
} from "@/lib/services/commercial-terms-rules";
import {
  commercialTermsFixture,
  paymentPlansFixture,
  PLAN_IDS,
  POLICY_IDS,
  SUNDARAM_INV_2104,
  taxDocumentsFixture,
  TERMS_ACCOUNT_IDS,
  TERMS_AS_OF,
} from "@/lib/services/commercial-terms.mocks";

const S16: FeePolicy = {
  policy_id: POLICY_IDS.msme,
  name: "MSME statutory",
  basis: "msmed_s16",
  rate_annual_pct: null,
  grace_days: 0,
  compounding: "monthly",
  account_count: 0,
};

const CONTRACTUAL_18: FeePolicy = {
  policy_id: POLICY_IDS.standard,
  name: "Standard terms",
  basis: "contractual",
  rate_annual_pct: 18,
  grace_days: 7,
  compounding: "none",
  account_count: 0,
};

/** The compound formula written out independently of the implementation. */
function compoundByHand(principal: number, annualPct: number, months: number, stubDays: number) {
  const r = annualPct / 100 / 12;
  const grown = principal * Math.pow(1 + r, months);
  return Math.round((grown - principal + grown * r * (stubDays / 30)) * 100) / 100;
}

function plan(id: string): PaymentPlan {
  const found = paymentPlansFixture.find((p) => p.plan_id === id);
  if (!found) throw new Error(`no plan ${id}`);
  return found;
}

describe("paise helpers", () => {
  test("round-trip without float", () => {
    expect(toPaise("165000.00")).toBe(16500000n);
    expect(toPaise("-1016.95")).toBe(-101695n);
    expect(toPaise("12.5")).toBe(1250n);
    expect(fromPaise(-101695n)).toBe("-1016.95");
    expect(fromPaise(5n)).toBe("0.05");
  });
});

describe("dates", () => {
  test("daysBetween counts calendar days", () => {
    expect(daysBetween("2026-05-09", "2026-10-14")).toBe(158);
    expect(daysBetween("2026-10-14", "2026-05-09")).toBe(-158);
  });

  test("addMonthsClamped keeps the anchor day where the month has it", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonthsClamped("2026-08-31", 1, 31)).toBe("2026-09-30");
  });

  test("istDateOf reads the day in India, not UTC", () => {
    expect(istDateOf("2026-08-16T20:00:00Z")).toBe("2026-08-17");
  });
});

describe("accruedInterest — Section 16", () => {
  test("statutory rate is three times the bank rate", () => {
    expect(statutoryRatePct(5.5)).toBe(16.5);
  });

  test("compounds monthly from the due date", () => {
    const accrual = accruedInterest({
      principal: "480000.00",
      dueDate: "2026-05-09",
      asOf: "2026-10-14",
      policy: S16,
      bankRatePct: 5.5,
    });
    expect(accrual?.months).toBe(5);
    expect(accrual?.stubDays).toBe(5);
    expect(accrual?.daysOverdue).toBe(158);
    expect(Number(accrual?.amount)).toBe(compoundByHand(480000, 16.5, 5, 5));
    expect(formatAccrualPeriod(accrual!)).toBe("5 months + 5 days");
  });

  test("ignores the policy's grace period — the statute sets the terms", () => {
    const withGrace = { ...S16, grace_days: 30 };
    const accrual = accruedInterest({
      principal: "100000.00",
      dueDate: "2026-08-01",
      asOf: "2026-08-11",
      policy: withGrace,
      bankRatePct: 5.5,
    });
    expect(accrual === null).toBe(false);
  });

  test("nothing accrues on or before the due date", () => {
    const onDue = accruedInterest({
      principal: "100000.00",
      dueDate: "2026-08-17",
      asOf: "2026-08-17",
      policy: S16,
      bankRatePct: 5.5,
    });
    expect(onDue).toBeNull();
  });
});

describe("accruedInterest — contractual", () => {
  test("simple interest on the days beyond grace", () => {
    const accrual = accruedInterest({
      principal: "45000.00",
      dueDate: "2026-05-07",
      asOf: "2026-08-12",
      policy: CONTRACTUAL_18,
      bankRatePct: 5.5,
    });
    expect(accrual?.daysOverdue).toBe(97);
    expect(accrual?.chargedDays).toBe(90);
    expect(accrual?.amount).toBe("1997.26");
    expect(formatAccrualPeriod(accrual!)).toBe("90 days");
  });

  test("nothing accrues inside the grace period", () => {
    const accrual = accruedInterest({
      principal: "45000.00",
      dueDate: "2026-08-10",
      asOf: "2026-08-17",
      policy: CONTRACTUAL_18,
      bankRatePct: 5.5,
    });
    expect(accrual).toBeNull();
  });

  test("rate copy shows the working for statutory rates only", () => {
    expect(rateWorking(S16, 5.5)).toBe("3 × 5.50% bank rate");
    expect(rateWorking(CONTRACTUAL_18, 5.5)).toBeNull();
    expect(rateDescription(S16, 5.5)).toBe("16.50% p.a. compounded monthly");
    expect(rateDescription(CONTRACTUAL_18, 5.5)).toBe("18.00% p.a. simple");
  });
});

describe("early payment discounts", () => {
  test("1% within 10 days on 45-day terms costs 10.5% a year", () => {
    expect(impliedDiscountCostPct(1, 10, 45)?.toFixed(1)).toBe("10.5");
  });

  test("2% within 10 days on 45-day terms costs 21.3% a year", () => {
    expect(impliedDiscountCostPct(2, 10, 45)?.toFixed(1)).toBe("21.3");
  });

  test("no days of early payment, no price", () => {
    expect(impliedDiscountCostPct(1, 45, 45)).toBeNull();
  });

  test("2% on ₹4,80,000 is dearer than a 13% overdraft by ₹3,616.44", () => {
    const verdict = discountVerdict({
      principal: "480000.00",
      discountPct: 2,
      windowDays: 10,
      netDays: 45,
      costOfCapitalPct: 13,
    });
    expect(verdict?.cheaper).toBe(false);
    expect(verdict?.givenUp).toBe("9600.00");
    expect(verdict?.overdraftCost).toBe("5983.56");
    expect(verdict?.difference).toBe("3616.44");
    expect(verdict?.daysSooner).toBe(35);
  });

  test("1% on ₹4,80,000 is cheaper than the same overdraft", () => {
    const verdict = discountVerdict({
      principal: "480000.00",
      discountPct: 1,
      windowDays: 10,
      netDays: 45,
      costOfCapitalPct: 13,
    });
    expect(verdict?.cheaper).toBe(true);
    expect(verdict?.givenUp).toBe("4800.00");
    expect(verdict?.difference).toBe("1183.56");
  });
});

describe("settlementCheck", () => {
  test("15% haircut needs the owner", () => {
    const check = settlementCheck("480000.00", "408000");
    expect(check).toEqual({
      valid: true,
      haircut: "72000.00",
      haircutPct: 15,
      needsOwnerApproval: true,
    });
  });

  test("a small haircut doesn't", () => {
    const check = settlementCheck("480000.00", "450000");
    expect(check.valid && check.needsOwnerApproval).toBe(false);
  });

  test("rejects full payment, zero and malformed amounts", () => {
    expect(settlementCheck("480000.00", "480000").valid).toBe(false);
    expect(settlementCheck("480000.00", "0").valid).toBe(false);
    expect(settlementCheck("480000.00", "4,08,000").valid).toBe(false);
  });
});

describe("splitInstalments", () => {
  test("monthly from the first date, clamped at month end", () => {
    const parts = splitInstalments("165000.00", 3, "2026-08-31");
    expect(parts.map((p) => p.due_on)).toEqual(["2026-08-31", "2026-09-30", "2026-10-31"]);
    expect(parts.map((p) => p.amount)).toEqual(["55000.00", "55000.00", "55000.00"]);
  });

  test("the last instalment absorbs the paise", () => {
    const parts = splitInstalments("100000.00", 3, "2026-09-15");
    expect(parts.map((p) => p.amount)).toEqual(["33333.33", "33333.33", "33333.34"]);
    const sum = parts.reduce((s, p) => s + toPaise(p.amount), 0n);
    expect(sum).toBe(toPaise("100000.00"));
  });
});

describe("interestClaimGate", () => {
  test("contractual interest needs terms on the invoice", () => {
    const gate = interestClaimGate({
      basis: "contractual",
      termsOnInvoice: false,
      udyamRegistered: true,
      accountName: "Vertex Labs Pvt Ltd",
    });
    expect(gate.backed).toBe(false);
    if (!gate.backed) expect(gate.reason.includes("Vertex Labs Pvt Ltd")).toBe(true);
  });

  test("Section 16 needs a Udyam registration", () => {
    expect(
      interestClaimGate({
        basis: "msmed_s16",
        termsOnInvoice: false,
        udyamRegistered: true,
        accountName: "x",
      }).backed,
    ).toBe(true);
    expect(
      interestClaimGate({
        basis: "msmed_s16",
        termsOnInvoice: true,
        udyamRegistered: false,
        accountName: "x",
      }).backed,
    ).toBe(false);
  });
});

describe("fixtures agree with the rules", () => {
  const asOf = istDateOf(TERMS_AS_OF);

  test("every fixture parses against the contract", () => {
    expect(commercialTermsSchema.safeParse(commercialTermsFixture).success).toBe(true);
    for (const p of paymentPlansFixture) expect(paymentPlanSchema.safeParse(p).success).toBe(true);
  });

  test("the active plan's accrued interest is the Section 16 figure on INV-2104", () => {
    const accrual = invoiceInterest({
      resolved: indexAccountTerms(commercialTermsFixture).get(SUNDARAM_INV_2104.account_id),
      principal: SUNDARAM_INV_2104.principal,
      dueDate: SUNDARAM_INV_2104.due_date,
      asOf,
      bankRatePct: commercialTermsFixture.rates.bank_rate_pct,
    });
    expect(accrual?.amount).toBe(plan(PLAN_IDS.active).interest?.accrued);
  });

  test("interest stays off for an account that hasn't switched it on", () => {
    const accrual = invoiceInterest({
      resolved: indexAccountTerms(commercialTermsFixture).get(TERMS_ACCOUNT_IDS.kaveri),
      principal: "72000.00",
      dueDate: "2026-05-01",
      asOf,
      bankRatePct: 5.5,
    });
    expect(accrual).toBeNull();
  });

  test("the debit note's taxable value is the contractual interest it claims", () => {
    const note = taxDocumentsFixture.find((d) => d.number === "DN-0008");
    expect(note?.taxable).toBe("1997.26");
  });

  test("every tax document's parts sum to its total, GST within a paisa of 18%", () => {
    for (const doc of taxDocumentsFixture) {
      expect(toPaise(doc.taxable) + toPaise(doc.gst)).toBe(toPaise(doc.total));
      const expectedGst = Math.round(Number(toPaise(doc.taxable)) * 0.18);
      expect(Math.abs(Number(toPaise(doc.gst)) - expectedGst) <= 1).toBe(true);
    }
  });

  test("instalments sum to each plan's total", () => {
    for (const p of paymentPlansFixture) {
      const sum = p.instalments.reduce((s, row) => s + toPaise(row.amount), 0n);
      expect(sum).toBe(toPaise(p.total));
    }
  });

  test("planProgress reads the active plan as nothing paid, next due 31 Aug", () => {
    const progress = planProgress(plan(PLAN_IDS.active));
    expect(progress.paid).toBe("0.00");
    expect(progress.remaining).toBe("165000.00");
    expect(progress.next?.due_on).toBe("2026-08-31");
  });

  test("account balances match the Accounts list", () => {
    const listed = new Map(accountListItemsFixture.map((a) => [a.account_id, a.outstanding]));
    for (const terms of commercialTermsFixture.account_terms) {
      expect(listed.get(terms.account_id)).toBe(terms.outstanding);
    }
  });

  test("the bank rate's age is measured to the fixture's Monday", () => {
    expect(bankRateAgeDays(commercialTermsFixture.rates.bank_rate_as_of, asOf)).toBe(29);
  });
});
