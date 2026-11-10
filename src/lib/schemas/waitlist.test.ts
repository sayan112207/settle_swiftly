import { describe, expect, test } from "bun:test";

import { joinWaitlistSchema } from "./waitlist";

describe("joinWaitlistSchema", () => {
  test("accepts an email alone, trimmed", () => {
    const r = joinWaitlistSchema.parse({ email: "  priya@northline.in " });
    expect(r).toEqual({ email: "priya@northline.in" });
  });

  test("keeps a company, trimmed", () => {
    const r = joinWaitlistSchema.parse({ email: "a@b.co", company: "  Northline Creative " });
    expect(r.company).toBe("Northline Creative");
  });

  test("rejects a malformed email with the form's message", () => {
    const r = joinWaitlistSchema.safeParse({ email: "nope" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Enter a work email, like name@company.com");
  });

  test("caps company at the database's 200 characters", () => {
    expect(
      joinWaitlistSchema.safeParse({ email: "a@b.co", company: "x".repeat(200) }).success,
    ).toBe(true);
    expect(
      joinWaitlistSchema.safeParse({ email: "a@b.co", company: "x".repeat(201) }).success,
    ).toBe(false);
  });
});
