import { getPublicEnv } from "@/lib/env.public";
import { outboxCancelSchema, outboxSchema, type Outbox } from "@/lib/schemas/outbox";
import { outboxOverview } from "@/lib/services/chase-rules";
import { requestJson } from "@/lib/services/dashboard";

/**
 * Outbox data access (spec §10). Same rule as the dashboard service: the mock
 * and the network path both end at `schema.parse`, so a fixture that drifts
 * from the contract fails here the way a bad payload would.
 */

export const outboxQueryKey = ["outbox"] as const;

const MOCK_DELAY_MS = 400;

/** Resolves after `ms`, so mock mode shows its loading states. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `GET /api/v1/outbox` */
export async function getOutbox(): Promise<Outbox> {
  if (getPublicEnv().useMocks) {
    await delay(MOCK_DELAY_MS);
    return outboxSchema.parse(mockOutbox());
  }
  const body = await requestJson("/outbox", {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  return outboxSchema.parse(body);
}

/** `POST /api/v1/outbox/reminders/{id}/cancel` */
export async function cancelOutboxReminder(reminderId: string): Promise<void> {
  if (getPublicEnv().useMocks) {
    await delay(MOCK_DELAY_MS);
    updateMock((outbox) => {
      const reminder = outbox.today_queue.find((r) => r.id === reminderId);
      if (!reminder?.can_cancel) return;
      reminder.status = "cancelled";
      reminder.cancel_reason = "Cancelled from the Outbox";
      reminder.can_cancel = false;
    });
    return;
  }
  const body = await requestJson(`/outbox/reminders/${reminderId}/cancel`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  outboxCancelSchema.parse(body);
}

/** `POST /api/v1/outbox/alerts/{id}/dismiss` — answers 204, so there is no body to read. */
export async function dismissOutboxAlert(alertId: string): Promise<void> {
  if (getPublicEnv().useMocks) {
    await delay(MOCK_DELAY_MS);
    updateMock((outbox) => {
      outbox.alerts = outbox.alerts.filter((a) => a.id !== alertId);
    });
    return;
  }
  await requestJson(`/outbox/alerts/${alertId}/dismiss`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
}

/**
 * Mock mode's live copy of the fixture. Cancel and dismiss change it, so the
 * refetch after a mutation shows what the toast just said happened.
 */
let mockState: Outbox | null = null;

/** A copy of the mock state, seeded from the fixture on first use. */
function mockOutbox(): Outbox {
  mockState ??= structuredClone(outboxFixture);
  return structuredClone(mockState);
}

/** Applies a mock mutation and recounts the overview from the result. */
function updateMock(change: (outbox: Outbox) => void): void {
  const outbox = mockOutbox();
  change(outbox);
  outbox.overview = outboxOverview({
    today: outbox.today,
    reminders: [...outbox.today_queue, ...outbox.sent],
    openAlerts: outbox.alerts.length,
  });
  mockState = outbox;
}

const ACCOUNT = "4f1c2a8e-0b6d-4e1a-9c3f-2d7b5e8a1c01";

/** One queued, one sent, one alert: every sub-tab has something to show. */
const outboxFixture: Outbox = {
  today: "2026-11-02",
  overview: {
    queued_today: 1,
    sent_today: 0,
    cancelled_today: 0,
    sent_week: 1,
    recipients_week: 2,
    delivered_week: 1,
    bounced_week: 1,
    awaiting_week: 0,
    delivery_rate_pct: 50,
    open_alerts: 1,
  },
  today_queue: [
    {
      id: "9a0e7c1d-3b2f-4c5a-8e6d-1f2a3b4c5d01",
      invoice_id: "9a0e7c1d-3b2f-4c5a-8e6d-1f2a3b4c5e01",
      invoice_number: "INV-2088",
      account_id: ACCOUNT,
      account_name: "Meridian Foods",
      step: 4,
      tone: "Standard",
      status: "scheduled",
      cancel_reason: null,
      scheduled_for: "2026-11-02",
      sent_at: null,
      can_cancel: true,
      recipients: [
        {
          contact_id: "9a0e7c1d-3b2f-4c5a-8e6d-1f2a3b4c5f01",
          name: "Priya Nair",
          email: "priya@meridianfoods.in",
          outcome: "unsent",
          reason: null,
        },
      ],
    },
  ],
  sent: [
    {
      id: "9a0e7c1d-3b2f-4c5a-8e6d-1f2a3b4c5d02",
      invoice_id: "9a0e7c1d-3b2f-4c5a-8e6d-1f2a3b4c5e02",
      invoice_number: "INV-2041",
      account_id: ACCOUNT,
      account_name: "Meridian Foods",
      step: 5,
      tone: "Firm",
      status: "sent",
      cancel_reason: null,
      scheduled_for: "2026-10-30",
      sent_at: "2026-10-30T03:31:12Z",
      can_cancel: false,
      recipients: [
        {
          contact_id: "9a0e7c1d-3b2f-4c5a-8e6d-1f2a3b4c5f01",
          name: "Priya Nair",
          email: "priya@meridianfoods.in",
          outcome: "delivered",
          reason: null,
        },
        {
          contact_id: "9a0e7c1d-3b2f-4c5a-8e6d-1f2a3b4c5f02",
          name: "Arjun Mehta",
          email: "arjun@meridianfods.in",
          outcome: "hard_bounced",
          reason: "550 5.1.1 The email account that you tried to reach does not exist",
        },
      ],
    },
  ],
  alerts: [
    {
      id: "9a0e7c1d-3b2f-4c5a-8e6d-1f2a3b4c5a01",
      kind: "address_bounced",
      account_id: ACCOUNT,
      account_name: "Meridian Foods",
      contact_id: "9a0e7c1d-3b2f-4c5a-8e6d-1f2a3b4c5f02",
      contact_name: "Arjun Mehta",
      to_email: "arjun@meridianfods.in",
      invoice_number: "INV-2041",
      reason: "550 5.1.1 The email account that you tried to reach does not exist",
      created_at: "2026-10-30T03:33:40Z",
    },
  ],
};
