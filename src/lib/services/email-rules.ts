/**
 * Email delivery rules, as pure functions over provider events.
 *
 * Like `accounts-rules.ts`, nothing here reads the clock, the network or the
 * database. The ingester supplies events; this decides what they mean.
 */

import type { ActivityEvent } from "@/lib/schemas/email";

/** What a provider event means for the address it was about. */
export type DeliveryOutcome =
  /** Reached the recipient's server. */
  | "delivered"
  /** The address is wrong or gone. Believe it immediately. */
  | "hard_bounce"
  /** Refused for now — full mailbox, greylisting, unroutable domain. */
  | "soft_bounce"
  /** Our problem, not the recipient's. Never counted against a contact. */
  | "sender_rejected"
  /** Queued, opened, clicked — no bearing on whether the address works. */
  | "other";

/**
 * Classifies one event.
 *
 * Matched on substrings rather than an enum because the provider's vocabulary
 * is open: `soft-bounced` and `delivered` are confirmed from live traffic,
 * `hard-bounced` is not, and an event nobody has seen yet must land in
 * `other` rather than throw during ingest.
 *
 * `rejected` is deliberately not a bounce. The one we have observed was the
 * provider refusing *our* unverified sender domain — the recipient was never
 * contacted, and marking them bounced would make an account unchaseable
 * because of a misconfiguration at our end.
 */
export function classifyEvent(event: string): DeliveryOutcome {
  const name = event.trim().toLowerCase();
  if (name === "delivered") return "delivered";
  if (name.includes("hard") && name.includes("bounce")) return "hard_bounce";
  if (name.includes("soft") && name.includes("bounce")) return "soft_bounce";
  // Bare "bounced", if it ever appears, is treated as hard: an unqualified
  // bounce is more likely a dead address than a transient refusal.
  if (name.includes("bounce")) return "hard_bounce";
  if (name === "rejected") return "sender_rejected";
  return "other";
}

/**
 * How many consecutive soft bounces mean the address is actually dead.
 *
 * The asymmetry is deliberate. A wrong `bounced` is the expensive error: it
 * flips the account to "Can't chase", and `contacts.delivery_state` has no
 * "failing intermittently" value to climb back through. A full mailbox on a
 * Monday must not silence a customer.
 */
export const SOFT_BOUNCE_LIMIT = 3;

/**
 * What makes an event distinct, for the unique index on `email_callbacks`.
 *
 * SMTP2GO supplies no event id — verified against the live API, whose events
 * carry only `email_id`, `date`, `event` and `recipient`. All four parts are
 * needed here: one send emits `processed` and `soft-bounced` sharing an
 * `email_id` *and* a timestamp to the second, and a multi-recipient message
 * repeats every event per recipient.
 *
 * Stable string, not a hash: it is read by humans debugging a duplicate, and
 * a hash would hide which of the four parts differed.
 */
export function dedupeKeyFor(provider: string, event: ActivityEvent): string {
  const recipient = (event.recipient ?? event.to ?? "").trim().toLowerCase();
  return [provider, event.email_id, event.event.trim().toLowerCase(), recipient, event.date].join(
    "|",
  );
}

/** A stored event, in the shape the state rule needs. */
export type DeliveryHistoryEntry = {
  outcome: DeliveryOutcome;
  occurredAt: string;
};

/** What the ladder should record for a contact after an event stream. */
export type DeliveryVerdict = {
  state: "verified" | "unverified" | "bounced";
  lastBouncedAt: string | null;
};

/**
 * The delivery state an address has earned, from its events in time order.
 *
 * A delivery resets everything: whatever was failing before, mail is landing
 * now, so the soft-bounce streak starts again from zero. A hard bounce is
 * believed at once. Soft bounces only condemn an address once
 * `SOFT_BOUNCE_LIMIT` of them have run without a delivery in between.
 *
 * `lastBouncedAt` tracks the most recent bounce of any kind, because the
 * bounce strip's "nothing has reached this account since…" is about when
 * delivery started failing, not about when we gave up.
 */
export function resolveDeliveryVerdict(history: readonly DeliveryHistoryEntry[]): DeliveryVerdict {
  const ordered = [...history].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  let state: DeliveryVerdict["state"] = "unverified";
  let lastBouncedAt: string | null = null;
  let softStreak = 0;

  for (const entry of ordered) {
    switch (entry.outcome) {
      case "delivered":
        state = "verified";
        softStreak = 0;
        break;
      case "hard_bounce":
        state = "bounced";
        lastBouncedAt = entry.occurredAt;
        softStreak = 0;
        break;
      case "soft_bounce":
        lastBouncedAt = entry.occurredAt;
        softStreak += 1;
        if (softStreak >= SOFT_BOUNCE_LIMIT) state = "bounced";
        break;
      case "sender_rejected":
      case "other":
        break;
    }
  }

  return { state, lastBouncedAt };
}
