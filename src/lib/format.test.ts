import { describe, expect, test } from "bun:test";

import { formatINR, isZeroMoney } from "@/lib/format";

describe("formatINR", () => {
  test("shows paise rather than rounding them away", () => {
    // The bug this pins: 125000.50 rendered as ₹1,25,001, which is a
    // different number from the one stored.
    expect(formatINR("125000.50")).toBe("₹1,25,000.50");
    expect(formatINR("9999.99")).toBe("₹9,999.99");
    expect(formatINR("0.01")).toBe("₹0.01");
  });

  test("pads whole amounts to two places so a money column stays aligned", () => {
    expect(formatINR("482000")).toBe("₹4,82,000.00");
    expect(formatINR("0")).toBe("₹0.00");
  });

  test("groups by lakh and crore, not by thousand", () => {
    expect(formatINR("1840000")).toBe("₹18,40,000.00");
    expect(formatINR("10000000")).toBe("₹1,00,00,000.00");
  });

  test("puts the sign outside the symbol, for credit notes and refunds", () => {
    expect(formatINR("-50000")).toBe("-₹50,000.00");
    expect(formatINR("-1234.05")).toBe("-₹1,234.05");
  });

  test("a malformed amount is an em dash, never ₹NaN or a false ₹0", () => {
    expect(formatINR("not money")).toBe("—");
    // Number("") is 0, not NaN — blank must not become ₹0.00.
    expect(formatINR("")).toBe("—");
    expect(formatINR("   ")).toBe("—");
  });
});

describe("isZeroMoney", () => {
  test("recognises the shapes Postgres numeric returns for zero", () => {
    expect(isZeroMoney("0")).toBe(true);
    expect(isZeroMoney("0.00")).toBe(true);
    expect(isZeroMoney("-0.00")).toBe(true);
    expect(isZeroMoney("0.01")).toBe(false);
  });
});
