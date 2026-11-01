import { describe, expect, test } from "bun:test";

import { DEFAULT_CADENCE, DEFAULT_SEND_WINDOW, defaultSteps } from "@/lib/services/accounts-rules";
import {
  STEP_OFFSET_DAYS,
  dueToSend,
  holdReason,
  isOutstanding,
  isWindowDay,
  isWindowOpen,
  needsSend,
  outboxOverview,
  planInvoice,
  recipientOutcome,
  statusAfterSend,
  type PlanInput,
  type ReminderFacts,
  type SendAttempt,
} from "@/lib/services/chase-rules";

const TODAY = "2026-11-02"; // a Monday

/** A planner input with nothing on file: due today-`days`, default cadence, open window. */
function input(days: number, overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    today: TODAY,
    daysSinceAnchor: days,
    steps: defaultSteps(),
    hold: null,
    windowDay: true,
    reminders: [],
    ...overrides,
  };
}

/** A reminder row for step `step`, planned `age` days before TODAY. */
function reminder(
  step: number,
  status: ReminderFacts["status"],
  age: number,
  recipients: ReminderFacts["recipients"] = [
    { contactId: "p0", outcome: "accepted", reason: null },
  ],
): ReminderFacts {
  const planned = new Date(Date.parse(`${TODAY}T00:00:00Z`) - age * 86_400_000);
  return {
    id: `r${step}`,
    step,
    status,
    plannedOn: planned.toISOString().slice(0, 10),
    recipients,
  };
}

/** An `email_sends` row, `minute` minutes into the day, with the given events. */
function attempt(
  status: SendAttempt["status"],
  minute: number,
  events: SendAttempt["events"] = [],
  error: string | null = null,
): SendAttempt {
  return {
    status,
    createdAt: `2026-11-02T03:${String(minute).padStart(2, "0")}:00Z`,
    error,
    events,
  };
}

describe("STEP_OFFSET_DAYS", () => {
  test("has an offset for every default step, in ladder order", () => {
    const offsets = DEFAULT_CADENCE.map((step) => STEP_OFFSET_DAYS[step.key]);
    expect(offsets).toEqual([-3, 0, 7, 14, 30, 45]);
  });
});

describe("send window, in IST", () => {
  test("the default window opens at 09:00 IST, which is 03:30 UTC", () => {
    expect(isWindowOpen(DEFAULT_SEND_WINDOW, new Date("2026-11-02T03:30:00Z"))).toBe(true);
    expect(isWindowOpen(DEFAULT_SEND_WINDOW, new Date("2026-11-02T03:29:00Z"))).toBe(false);
  });

  test("closes at 18:00 IST, exclusive", () => {
    expect(isWindowOpen(DEFAULT_SEND_WINDOW, new Date("2026-11-02T12:29:00Z"))).toBe(true);
    expect(isWindowOpen(DEFAULT_SEND_WINDOW, new Date("2026-11-02T12:30:00Z"))).toBe(false);
  });

  // 20:00 UTC Friday is 01:30 IST Saturday — the weekday is India's, not UTC's.
  test("reads the weekday in IST", () => {
    const friday = { ...DEFAULT_SEND_WINDOW, opens_at: "00:00", closes_at: "23:59" };
    expect(isWindowOpen(friday, new Date("2026-11-06T20:00:00Z"))).toBe(false);
  });

  test("a weekend date is not a window day by default", () => {
    expect(isWindowDay(DEFAULT_SEND_WINDOW, "2026-11-01")).toBe(false);
    expect(isWindowDay(DEFAULT_SEND_WINDOW, "2026-11-02")).toBe(true);
  });
});

describe("holdReason", () => {
  const clean = { disputed: false, promisedDate: null, promisedAt: null };

  test("account gates come before the invoice's own", () => {
    expect(holdReason("paused", { ...clean, disputed: true }, TODAY)).toBe(
      "Chasing is paused for this account",
    );
  });

  test("a dispute or a live promise holds the invoice", () => {
    expect(holdReason("active", { ...clean, disputed: true }, TODAY)).toBe("Disputed");
    expect(
      holdReason(
        "active",
        { ...clean, promisedAt: "2026-10-30", promisedDate: "2026-11-05" },
        TODAY,
      ),
    ).toBe("Payment promised");
  });

  test("nothing holds an active, clean invoice", () => {
    expect(holdReason("active", clean, TODAY)).toBeNull();
  });
});

describe("recipientOutcome", () => {
  test("no attempt is unsent", () => {
    expect(recipientOutcome([]).outcome).toBe("unsent");
  });

  test("accepted with no news is done, not a failure", () => {
    expect(recipientOutcome([attempt("sent", 0)]).outcome).toBe("accepted");
  });

  test("a refusal is retried with the provider's words", () => {
    expect(recipientOutcome([attempt("failed", 0, [], "mailbox unavailable")])).toEqual({
      outcome: "retry",
      reason: "mailbox unavailable",
    });
  });

  test("a soft bounce after acceptance is retried", () => {
    const soft = [{ outcome: "soft_bounce" as const, occurredAt: "2026-11-02T03:05:00Z" }];
    expect(recipientOutcome([attempt("sent", 0, soft)]).outcome).toBe("retry");
  });

  test("a hard bounce is final", () => {
    const hard = [{ outcome: "hard_bounce" as const, occurredAt: "2026-11-02T03:05:00Z" }];
    expect(recipientOutcome([attempt("sent", 0, hard)]).outcome).toBe("hard_bounced");
  });

  test("a delivery on any attempt wins over a later failure", () => {
    const delivered = [{ outcome: "delivered" as const, occurredAt: "2026-11-02T03:05:00Z" }];
    expect(
      recipientOutcome([attempt("sent", 0, delivered), attempt("failed", 10, [], "timeout")])
        .outcome,
    ).toBe("delivered");
  });

  // The unknown-outcome case: the send threw, but a matching delivery event
  // turned up. Retrying would chase the customer twice.
  test("a hard bounce after an earlier delivery is the outcome that stands", () => {
    const delivered = [{ outcome: "delivered" as const, occurredAt: "2026-11-01T03:05:00Z" }];
    const bounced = [{ outcome: "hard_bounce" as const, occurredAt: "2026-11-02T03:05:00Z" }];
    expect(
      recipientOutcome([attempt("sent", 0, delivered), attempt("sent", 10, bounced)]).outcome,
    ).toBe("hard_bounced");
  });

  test("a failed send with a matched delivery counts as delivered", () => {
    const matched = [{ outcome: "delivered" as const, occurredAt: "2026-11-02T03:02:00Z" }];
    expect(recipientOutcome([attempt("failed", 0, matched, "timed out")]).outcome).toBe(
      "delivered",
    );
  });

  test("a row left queued by a dead run is retried", () => {
    expect(recipientOutcome([attempt("queued", 0)]).outcome).toBe("retry");
  });
});

describe("planInvoice — choosing a step", () => {
  test("an invoice first seen at +20 sends s4 and nothing before it", () => {
    expect(planInvoice(input(20))).toEqual([
      { type: "schedule", stepKey: "s4", stepNumber: 4, tone: "Standard", recipients: "p0p1" },
    ]);
  });

  // The `> watermark` clause: without it, s3 is "due and unsent" tomorrow and
  // the backlog arrives in reverse, one step a day.
  test("the skipped backlog stays skipped", () => {
    expect(planInvoice(input(21, { reminders: [reminder(4, "sent", 1)] }))).toEqual([]);
  });

  test("the next step fires when it comes due", () => {
    const actions = planInvoice(input(30, { reminders: [reminder(4, "sent", 10)] }));
    expect(actions).toEqual([
      { type: "schedule", stepKey: "s5", stepNumber: 5, tone: "Firm", recipients: "p0p1p2" },
    ]);
  });

  // ineligibleReason would call this "Not yet due" and s1 could never send.
  test("s1 goes three days before the due date", () => {
    expect(planInvoice(input(-3))[0]).toEqual({
      type: "schedule",
      stepKey: "s1",
      stepNumber: 1,
      tone: "Gentle",
      recipients: "p0",
    });
    expect(planInvoice(input(-4))).toEqual([]);
  });

  test("nothing new is planned on a day outside the window, or under a hold", () => {
    expect(planInvoice(input(20, { windowDay: false }))).toEqual([]);
    expect(planInvoice(input(20, { hold: "Disputed" }))).toEqual([]);
  });

  test("a step that cannot go by email is reported, never sent as email", () => {
    const steps = defaultSteps().map((s) =>
      s.key === "s5" ? { ...s, channel: "voice" as const } : s,
    );
    expect(planInvoice(input(30, { steps, reminders: [reminder(4, "sent", 10)] }))).toEqual([
      { type: "skip", stepKey: "s5", reason: "Voice calls aren't available yet" },
    ]);
  });
});

describe("planInvoice — retries", () => {
  const failingP0 = [{ contactId: "p0", outcome: "retry" as const, reason: "mailbox full" }];

  // Phase 1 before phase 2: s5 is due, but s4 never landed.
  test("an outstanding step is retried instead of advancing", () => {
    const actions = planInvoice(input(30, { reminders: [reminder(4, "failed", 2, failingP0)] }));
    expect(actions).toEqual([{ type: "retry", reminderId: "r4", status: "failed" }]);
  });

  test("a sent step that soft-bounced inside the week is reopened", () => {
    const sent = reminder(4, "sent", 2, failingP0);
    expect(isOutstanding(sent, TODAY)).toBe(true);
    expect(planInvoice(input(16, { reminders: [sent] }))).toEqual([
      { type: "retry", reminderId: "r4", status: "failed" },
    ]);
  });

  test("after seven days it gives up, alerts, and the ladder moves on", () => {
    const actions = planInvoice(input(30, { reminders: [reminder(4, "failed", 7, failingP0)] }));
    expect(actions).toEqual([
      {
        type: "give_up",
        reminderId: "r4",
        status: "cancelled",
        reason: "Not delivered after 7 days",
        failing: [{ contactId: "p0", reason: "mailbox full" }],
      },
      { type: "schedule", stepKey: "s5", stepNumber: 5, tone: "Firm", recipients: "p0p1p2" },
    ]);
  });

  test("giving up on a step somebody did receive keeps it sent", () => {
    const partial = reminder(5, "failed", 7, [
      { contactId: "p0", outcome: "delivered", reason: null },
      { contactId: "p1", outcome: "retry", reason: "mailbox full" },
    ]);
    const [action] = planInvoice(input(37, { reminders: [partial] }));
    expect(action?.type === "give_up" && action.status).toBe("sent");
  });

  test("a sent step older than the week is never reopened", () => {
    expect(isOutstanding(reminder(4, "sent", 7, failingP0), TODAY)).toBe(false);
  });

  // A hold is not a failure: nothing was tried, so nothing failed.
  test("a hold cancels an untried reminder quietly", () => {
    const untried = reminder(4, "scheduled", 0, [
      { contactId: "p0", outcome: "unsent", reason: null },
    ]);
    expect(planInvoice(input(16, { hold: "Disputed", reminders: [untried] }))).toEqual([
      { type: "cancel", reminderId: "r4", reason: "Disputed" },
    ]);
  });

  test("a hold leaves a reminder with failed attempts to wait out its week", () => {
    const actions = planInvoice(
      input(16, { hold: "Disputed", reminders: [reminder(4, "failed", 2, failingP0)] }),
    );
    expect(actions).toEqual([]);
  });
});

describe("sending", () => {
  const reachable = {
    isActive: true,
    doNotContact: false,
    email: "ap@acme.in",
    channelEmail: true,
  };

  test("only recipients who still need it and can still be reached are mailed", () => {
    expect(needsSend("unsent", reachable)).toBe(true);
    expect(needsSend("retry", reachable)).toBe(true);
    expect(needsSend("accepted", reachable)).toBe(false);
    expect(needsSend("hard_bounced", reachable)).toBe(false);
    expect(needsSend("unsent", { ...reachable, doNotContact: true })).toBe(false);
    expect(needsSend("unsent", { ...reachable, email: null })).toBe(false);
  });

  // 03:30Z is 09:00 IST on TODAY; 20:00Z the day before is 01:30 IST TODAY.
  test("a reminder already tried today waits for tomorrow", () => {
    expect(dueToSend(["2026-11-02T03:30:00Z"], TODAY)).toBe(false);
    expect(dueToSend(["2026-11-01T20:00:00Z"], TODAY)).toBe(false);
    expect(dueToSend(["2026-10-31T03:30:00Z"], TODAY)).toBe(true);
    expect(dueToSend([], TODAY)).toBe(true);
  });

  test("any failed send leaves the reminder failed", () => {
    expect(statusAfterSend([{ ok: true }, { ok: false }], false).status).toBe("failed");
    expect(statusAfterSend([{ ok: true }], false).status).toBe("sent");
  });

  test("with nobody left to send to, it is sent only if somebody got it", () => {
    expect(statusAfterSend([], true).status).toBe("sent");
    expect(statusAfterSend([], false).status).toBe("cancelled");
  });
});

describe("outboxOverview", () => {
  const to = (outcome: "unsent" | "accepted" | "delivered" | "hard_bounced" | "retry") => ({
    contact_id: "c",
    name: "P0",
    email: "ap@acme.in",
    outcome,
    reason: null,
  });

  test("today's counts read the queue; the week's read every send", () => {
    const overview = outboxOverview({
      today: TODAY,
      openAlerts: 2,
      reminders: [
        { status: "scheduled", scheduled_for: TODAY, recipients: [to("unsent")] },
        { status: "cancelled", scheduled_for: TODAY, recipients: [to("unsent")] },
        { status: "sent", scheduled_for: TODAY, recipients: [to("delivered"), to("accepted")] },
        { status: "sent", scheduled_for: "2026-10-30", recipients: [to("hard_bounced")] },
      ],
    });
    expect(overview).toEqual({
      queued_today: 1,
      sent_today: 1,
      cancelled_today: 1,
      sent_week: 2,
      recipients_week: 3,
      delivered_week: 1,
      bounced_week: 1,
      awaiting_week: 1,
      delivery_rate_pct: 50,
      open_alerts: 2,
    });
  });

  // Minutes after a send, everything is accepted and nothing reported yet.
  // That is not a 0% delivery rate.
  test("with no outcome known yet there is no rate, not a zero one", () => {
    expect(outboxOverview({ today: TODAY, openAlerts: 0, reminders: [] }).delivery_rate_pct).toBe(
      null,
    );
    const fresh = outboxOverview({
      today: TODAY,
      openAlerts: 0,
      reminders: [{ status: "sent", scheduled_for: TODAY, recipients: [to("accepted")] }],
    });
    expect(fresh.delivery_rate_pct).toBeNull();
    expect(fresh.awaiting_week).toBe(1);
  });
});
