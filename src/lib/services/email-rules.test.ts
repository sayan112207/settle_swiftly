import { describe, expect, test } from "bun:test";

import { activityEventSchema } from "@/lib/schemas/email";
import {
  SOFT_BOUNCE_LIMIT,
  classifyEvent,
  dedupeKeyFor,
  resolveDeliveryVerdict,
  type DeliveryHistoryEntry,
} from "@/lib/services/email-rules";

/**
 * Captured verbatim from the live API on 11 Oct 2026, not hand-written: these
 * two events are one send each, and the pair below is the case that decided
 * the dedupe key.
 */
const DELIVERED = activityEventSchema.parse({
  email_id: "1xFva8-FnQW0hPoZQT-HJ7m",
  date: "2026-10-11T15:35:27Z",
  event: "delivered",
  recipient: "sayan112207@gmail.com",
  to: "sayan112207@gmail.com",
  smtp_response: "250 2.0.0 OK 1791732927 af79cd13be357-93ec6fa2fcfsi410427085a.321 - gsmtp",
});

const SOFT_BOUNCED = activityEventSchema.parse({
  email_id: "1xFvaQ-FnQW0hPoZdL-GvQ1",
  date: "2026-10-11T15:35:42Z",
  event: "soft-bounced",
  recipient: "bounce-test@settleswiftly.invalid",
  to: "bounce-test@settleswiftly.invalid",
  smtp_response: "550 unroutable domain: settleswiftly.invalid",
});

/** The `processed` twin of the bounce — same message, same second. */
const PROCESSED_TWIN = activityEventSchema.parse({
  email_id: "1xFvaQ-FnQW0hPoZdL-GvQ1",
  date: "2026-10-11T15:35:42Z",
  event: "processed",
});

describe("classifyEvent", () => {
  test("the two outcomes confirmed from live traffic", () => {
    expect(classifyEvent(DELIVERED.event)).toBe("delivered");
    expect(classifyEvent(SOFT_BOUNCED.event)).toBe("soft_bounce");
    expect(classifyEvent(PROCESSED_TWIN.event)).toBe("other");
  });

  test("`rejected` is our problem, never the recipient's", () => {
    // The one observed `rejected` was the provider refusing our own
    // unverified sender domain. The recipient was never contacted, so
    // counting it against them would make an account unchaseable over a
    // misconfiguration at our end.
    expect(classifyEvent("rejected")).toBe("sender_rejected");
  });

  test("an unseen event name lands in `other`, never throws", () => {
    // The provider's vocabulary is open and ingest must not fail on a word
    // nobody has met yet.
    expect(classifyEvent("quarantined-by-some-new-rule")).toBe("other");
  });

  test("hard and bare bounces are believed at once", () => {
    expect(classifyEvent("hard-bounced")).toBe("hard_bounce");
    expect(classifyEvent("bounced")).toBe("hard_bounce");
  });
});

describe("dedupeKeyFor", () => {
  test("separates two events of one send that share a timestamp", () => {
    // The case that forced `event` into the key: both are email_id
    // 1xFvaQ…, both at 15:35:42. Keying on (message, time) would have
    // silently dropped one of two real events.
    const bounce = dedupeKeyFor("smtp2go", SOFT_BOUNCED);
    const processed = dedupeKeyFor("smtp2go", PROCESSED_TWIN);
    expect(bounce === processed).toBe(false);
  });

  test("a re-poll of the same event produces the same key", () => {
    // Polling re-reads an overlapping window by design; this is what makes
    // that safe.
    expect(dedupeKeyFor("smtp2go", DELIVERED)).toBe(dedupeKeyFor("smtp2go", { ...DELIVERED }));
  });

  test("recipient keeps a multi-recipient message's events apart", () => {
    const a = dedupeKeyFor("smtp2go", { ...DELIVERED, recipient: "one@example.com" });
    const b = dedupeKeyFor("smtp2go", { ...DELIVERED, recipient: "two@example.com" });
    expect(a === b).toBe(false);
  });

  test("the key is namespaced by provider", () => {
    expect(dedupeKeyFor("smtp2go", DELIVERED) === dedupeKeyFor("other", DELIVERED)).toBe(false);
  });
});

describe("resolveDeliveryVerdict", () => {
  const at = (n: number, outcome: DeliveryHistoryEntry["outcome"]): DeliveryHistoryEntry => ({
    outcome,
    occurredAt: `2026-10-${String(10 + n).padStart(2, "0")}T00:00:00Z`,
  });

  test("no events means unverified, not bounced", () => {
    expect(resolveDeliveryVerdict([])).toEqual({ state: "unverified", lastBouncedAt: null });
  });

  test("one delivery verifies the address", () => {
    expect(resolveDeliveryVerdict([at(1, "delivered")]).state).toBe("verified");
  });

  test("a hard bounce is believed immediately", () => {
    const verdict = resolveDeliveryVerdict([at(1, "delivered"), at(2, "hard_bounce")]);
    expect(verdict.state).toBe("bounced");
    expect(verdict.lastBouncedAt).toBe("2026-10-12T00:00:00Z");
  });

  test("a single soft bounce does not silence a contact", () => {
    // The expensive error. A full mailbox on a Monday must not flip the
    // account to "Can't chase" — there is no state to climb back through.
    const verdict = resolveDeliveryVerdict([at(1, "soft_bounce")]);
    expect(verdict.state).toBe("unverified");
    expect(verdict.lastBouncedAt).toBe("2026-10-11T00:00:00Z");
  });

  test("soft bounces condemn an address only at the limit", () => {
    const below = Array.from({ length: SOFT_BOUNCE_LIMIT - 1 }, (_, i) => at(i + 1, "soft_bounce"));
    expect(resolveDeliveryVerdict(below).state).toBe("unverified");

    const atLimit = Array.from({ length: SOFT_BOUNCE_LIMIT }, (_, i) => at(i + 1, "soft_bounce"));
    expect(resolveDeliveryVerdict(atLimit).state).toBe("bounced");
  });

  test("a delivery resets the streak", () => {
    const verdict = resolveDeliveryVerdict([
      at(1, "soft_bounce"),
      at(2, "soft_bounce"),
      at(3, "delivered"),
      at(4, "soft_bounce"),
    ]);
    expect(verdict.state).toBe("verified");
  });

  test("sender rejections never count against the contact", () => {
    const verdict = resolveDeliveryVerdict([
      at(1, "sender_rejected"),
      at(2, "sender_rejected"),
      at(3, "sender_rejected"),
      at(4, "sender_rejected"),
    ]);
    expect(verdict.state).toBe("unverified");
    expect(verdict.lastBouncedAt).toBeNull();
  });

  test("events out of order are sorted before judging", () => {
    // Pages arrive newest-first, so the ingester cannot promise order.
    const verdict = resolveDeliveryVerdict([at(3, "delivered"), at(1, "hard_bounce")]);
    expect(verdict.state).toBe("verified");
  });
});
