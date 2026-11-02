import { describe, expect, test } from "bun:test";

import { ApiError } from "@/lib/services/api.server";
import { bearerToken, requireCronSecret, secretsMatch } from "@/lib/services/internal-auth.server";

const SECRET = "c0ffee".repeat(10);

/** A request to the poll endpoint with the given Authorization header, if any. */
function request(authorization?: string): Request {
  return new Request("https://app.test/api/v1/internal/email/poll", {
    method: "POST",
    headers: authorization === undefined ? {} : { authorization },
  });
}

describe("secretsMatch", () => {
  test("accepts the same secret", async () => {
    expect(await secretsMatch(SECRET, SECRET)).toBe(true);
  });

  test("rejects a secret that differs only in its last character", async () => {
    expect(await secretsMatch(`${SECRET.slice(0, -1)}f`, SECRET)).toBe(false);
  });

  // The case a raw byte loop gets wrong: a prefix of the right secret would
  // pass if the loop only ran over the shorter input.
  test("rejects a prefix of the secret", async () => {
    expect(await secretsMatch(SECRET.slice(0, 8), SECRET)).toBe(false);
  });

  test("rejects the empty string", async () => {
    expect(await secretsMatch("", SECRET)).toBe(false);
  });
});

describe("bearerToken", () => {
  test("reads the token from a Bearer header, case-insensitively", () => {
    expect(bearerToken(request(`Bearer ${SECRET}`))).toBe(SECRET);
    expect(bearerToken(request(`bearer ${SECRET}`))).toBe(SECRET);
  });

  test("is null without a header, with another scheme, or with no token", () => {
    expect(bearerToken(request())).toBeNull();
    expect(bearerToken(request(`Basic ${SECRET}`))).toBeNull();
    expect(bearerToken(request("Bearer "))).toBeNull();
  });
});

/** Runs `fn` with `CRON_SECRET` set to `value` (or unset), restoring it after. */
async function withServerSecret(value: string | undefined, fn: () => Promise<void>): Promise<void> {
  const previous = process.env["CRON_SECRET"];
  if (value === undefined) delete process.env["CRON_SECRET"];
  else process.env["CRON_SECRET"] = value;
  try {
    await fn();
  } finally {
    if (previous === undefined) delete process.env["CRON_SECRET"];
    else process.env["CRON_SECRET"] = previous;
  }
}

/** What `requireCronSecret` threw for this request, or undefined when it let it through. */
async function rejection(req: Request): Promise<unknown> {
  return requireCronSecret(req).then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
}

describe("requireCronSecret", () => {
  test("lets the right secret through", () =>
    withServerSecret(SECRET, async () => {
      expect(await rejection(request(`Bearer ${SECRET}`))).toBe(undefined);
    }));

  test("answers a wrong or missing secret with a 401", () =>
    withServerSecret(SECRET, async () => {
      for (const authorization of [undefined, "Bearer nope"]) {
        const error = await rejection(request(authorization));
        expect(error instanceof ApiError && error.status).toBe(401);
      }
    }));

  // An unset secret is a broken deployment, not a bad caller. A 401 here
  // would send whoever is debugging to look at Vault instead of the host.
  test("throws a plain error, not a 401, when the server has no secret", () =>
    withServerSecret(undefined, async () => {
      const error = await rejection(request(`Bearer ${SECRET}`));
      expect(error instanceof Error && !(error instanceof ApiError)).toBe(true);
    }));
});
