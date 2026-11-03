import { describe, expect, test } from "bun:test";

import { retryOnJwtSkew } from "@/lib/supabase/jwt-skew-retry";

type Result = { error: { code: string } | null; data: string | null };

const skewed: Result = { error: { code: "PGRST303" }, data: null };
const errorOf = (r: Result) => r.error;

describe("retryOnJwtSkew", () => {
  test("retries exactly once on PGRST303 and returns the second result", async () => {
    const results: Result[] = [skewed, { error: null, data: "ok" }];
    let calls = 0;
    const out = await retryOnJwtSkew(async () => results[calls++] ?? skewed, errorOf, 0);
    expect(out).toEqual({ error: null, data: "ok" });
    expect(calls).toBe(2);
  });

  test("gives up after one retry if the skew persists", async () => {
    let calls = 0;
    const out = await retryOnJwtSkew(
      async () => {
        calls++;
        return skewed;
      },
      errorOf,
      0,
    );
    expect(out.error?.code).toBe("PGRST303");
    expect(calls).toBe(2);
  });

  test("does not retry other errors or success", async () => {
    const outcomes: Result[] = [
      { error: { code: "42501" }, data: null },
      { error: null, data: "ok" },
    ];
    for (const result of outcomes) {
      let calls = 0;
      await retryOnJwtSkew(
        async () => {
          calls++;
          return result;
        },
        errorOf,
        0,
      );
      expect(calls).toBe(1);
    }
  });
});
