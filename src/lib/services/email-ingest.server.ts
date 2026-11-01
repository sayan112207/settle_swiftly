/**
 * Pulls delivery events from the provider and turns them into contact state.
 *
 * A poller rather than a webhook receiver, because there is no webhook route
 * yet and `/activity/search` carries the same events. The table it fills is
 * shaped for either: when a webhook endpoint exists it inserts the same rows
 * with the same dedupe key, and nothing downstream changes.
 *
 * Safe to run twice, run late, or run overlapping with itself. The window is
 * deliberately re-read with an overlap and `email_callbacks`' unique index
 * throws the repeats away — which is cheaper and more honest than trying to
 * keep an exact cursor against a provider whose events arrive out of order.
 */

import { getAdminSupabase } from "@/lib/supabase/admin-client.server";
import type { Json } from "@/lib/supabase/types.gen";
import { fetchAllPages } from "@/lib/services/api.server";
import {
  classifyEvent,
  dedupeKeyFor,
  resolveDeliveryVerdict,
  type DeliveryHistoryEntry,
} from "@/lib/services/email-rules";
import { searchActivity } from "@/lib/services/smtp2go.server";

const PROVIDER = "smtp2go";

/**
 * How far back each run re-reads.
 *
 * Covers a missed run, a provider that backfills an event a few minutes late,
 * and clock skew between us and them. The cost of overlap is duplicate rows
 * the unique index rejects; the cost of too little is a bounce nobody sees.
 */
const OVERLAP_MINUTES = 30;

/** Page size. The provider pages with `continue_token`; pages do not overlap. */
const PAGE_LIMIT = 100;

/** Stops a runaway loop if the provider ever returns a non-advancing token. */
const MAX_PAGES = 50;

export type IngestResult = {
  fetched: number;
  inserted: number;
  linked: number;
  contactsUpdated: number;
  alertsRaised: number;
  swept: number;
};

/**
 * One ingest pass: fetch, store, link, judge, sweep.
 *
 * `now` is a parameter so a test can pin the window. Everything it reads from
 * the provider is bounded by that window.
 */
export async function ingestEmailActivity(now: Date = new Date()): Promise<IngestResult> {
  const supabase = getAdminSupabase();

  const since = await windowStart(supabase, now);
  const endDate = now.toISOString();

  // ---- fetch -------------------------------------------------------------
  const events = [];
  let continueToken: string | undefined;
  let complete = false;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await searchActivity({
      startDate: since,
      endDate,
      limit: PAGE_LIMIT,
      continueToken,
    });
    events.push(...result.events);
    if (!result.continueToken || result.events.length === 0) {
      complete = true;
      break;
    }
    continueToken = result.continueToken;
  }

  // Running out of pages is a failure, not a quiet truncation. Events come
  // newest first, so a capped run holds the recent end of the window and
  // misses the old end — and then storing them advances the next run's start
  // past the gap, losing it for good. The same trap as swallowing the window
  // query, reached from the other side.
  if (!complete) {
    throw new Error(
      `Delivery events did not fit in ${MAX_PAGES} pages of ${PAGE_LIMIT} from ${since}. ` +
        `Nothing was stored, so the window is still intact — widen the page cap or ` +
        `narrow the window and run again.`,
    );
  }

  // ---- store -------------------------------------------------------------
  // `ignoreDuplicates` makes the re-read window free: the unique index on
  // (provider, dedupe_key) decides what is new, not this code.
  const rows = events.map((event) => ({
    provider: PROVIDER,
    provider_message_id: event.email_id === "" ? null : event.email_id,
    event: event.event,
    to_email: event.recipient && event.recipient !== "*" ? event.recipient : (event.to ?? null),
    occurred_at: event.date,
    dedupe_key: dedupeKeyFor(PROVIDER, event),
    // Json by construction — it came back from `response.json()`. Zod's
    // passthrough output type cannot express an open object as Json, so the
    // cast states what the runtime already guarantees.
    payload: event as unknown as Json,
  }));

  let insertedIds: string[] = [];
  if (rows.length > 0) {
    const { data, error } = await supabase
      .from("email_callbacks")
      .upsert(rows, { onConflict: "provider,dedupe_key", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`Storing delivery events failed: ${error.message}`);
    insertedIds = (data ?? []).map((row) => row.id);
  }

  // ---- link --------------------------------------------------------------
  const { data: linked, error: linkError } = await supabase.rpc("email_callbacks_link");
  if (linkError) throw new Error(`Linking delivery events failed: ${linkError.message}`);

  // ---- alert -------------------------------------------------------------
  // Before judging: a hard bounce is news the user gets the same day (spec
  // §9). Read from the table, not from this run's inserts, so an event that
  // linked to its send only now, or whose alert failed to raise last run,
  // still gets one.
  const alertsRaised = await raiseBounceAlerts(supabase, new Date());

  // ---- judge -------------------------------------------------------------
  const contactsUpdated = await applyVerdicts(supabase);

  // ---- sweep -------------------------------------------------------------
  const { data: swept, error: sweepError } = await supabase.rpc(
    "email_callbacks_sweep_unmatched",
    {},
  );
  if (sweepError) throw new Error(`Sweeping unmatched events failed: ${sweepError.message}`);

  return {
    fetched: events.length,
    inserted: insertedIds.length,
    linked: linked ?? 0,
    contactsUpdated,
    alertsRaised,
    swept: swept ?? 0,
  };
}

/**
 * Where this run starts reading.
 *
 * The newest event already stored, less the overlap — not "when we last ran",
 * which would be a cursor to keep correct across crashes and redeploys. On an
 * empty table it falls back to the overlap window rather than the provider's
 * whole retention, so a first run cannot pull a year of history in one go.
 */
async function windowStart(
  supabase: ReturnType<typeof getAdminSupabase>,
  now: Date,
): Promise<string> {
  const { data, error } = await supabase
    .from("email_callbacks")
    .select("occurred_at")
    .eq("provider", PROVIDER)
    .not("occurred_at", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Thrown rather than absorbed, unlike the empty-table case below. A failed
  // query also yields no row, and treating the two the same would silently
  // narrow the window to the overlap — and then *keep* it narrow, because the
  // next run derives its window from the newest stored event, which this run
  // never advanced past. Events older than the overlap would be skipped for
  // good, with the run reporting success.
  if (error) throw new Error(`Reading the ingest window failed: ${error.message}`);

  const newest = data?.occurred_at ? new Date(data.occurred_at) : now;
  return new Date(newest.getTime() - OVERLAP_MINUTES * 60_000).toISOString();
}

/** `.in()` travels in the URL; keep each list well under any proxy's limit. */
const IN_CHUNK = 100;

/** How far back each run looks for hard bounces still owed an alert. */
const BOUNCE_ALERT_LOOKBACK_HOURS = 24;

/**
 * Raises an `address_bounced` alert for each linked hard bounce received in
 * the lookback window that no alert has answered yet.
 *
 * "Answered" means the contact has an alert of this kind created after the
 * event arrived — open, dismissed or resolved alike, so a dismissal or a
 * fixed address is never undone by the next run. Unlinked events are
 * skipped: with no send there is no contact to alert about.
 */
async function raiseBounceAlerts(
  supabase: ReturnType<typeof getAdminSupabase>,
  now: Date,
): Promise<number> {
  const since = new Date(now.getTime() - BOUNCE_ALERT_LOOKBACK_HOURS * 3_600_000).toISOString();
  const rows = await fetchAllPages((from, to) =>
    supabase
      .from("email_callbacks")
      .select(
        "id, event, payload, received_at, email_sends!inner(contact_id, reminder_id, to_email)",
      )
      .gte("received_at", since)
      .ilike("event", "%bounce%")
      .order("id")
      .range(from, to),
  );

  type Send = { contact_id: string | null; reminder_id: string | null; to_email: string };
  const bounces = rows.flatMap((row) => {
    const send = row.email_sends as unknown as Send;
    return classifyEvent(row.event) === "hard_bounce" && send.contact_id
      ? [{ ...row, send: { ...send, contact_id: send.contact_id } }]
      : [];
  });
  if (bounces.length === 0) return 0;

  // The latest alert of this kind per contact, whatever became of it.
  const contactIds = [...new Set(bounces.map((b) => b.send.contact_id))];
  const answeredAt = new Map<string, string>();
  for (let i = 0; i < contactIds.length; i += IN_CHUNK) {
    // Paged: a dropped row reads as an unanswered bounce, and would raise
    // again an alert the user already dismissed.
    const chunk = contactIds.slice(i, i + IN_CHUNK);
    const alerts = await fetchAllPages((from, to) =>
      supabase
        .from("chase_alerts")
        .select("contact_id, created_at")
        .eq("kind", "address_bounced")
        .in("contact_id", chunk)
        .order("id")
        .range(from, to),
    );
    for (const alert of alerts) {
      if (!alert.contact_id) continue;
      const prior = answeredAt.get(alert.contact_id);
      if (!prior || alert.created_at > prior) answeredAt.set(alert.contact_id, alert.created_at);
    }
  }

  let raised = 0;
  for (const bounce of bounces) {
    const answered = answeredAt.get(bounce.send.contact_id);
    if (answered && Date.parse(answered) >= Date.parse(bounce.received_at)) continue;

    const smtp = (bounce.payload as { smtp_response?: unknown } | null)?.smtp_response;
    const { data: isNew, error: raiseError } = await supabase.rpc("chase_alert_raise", {
      p_contact: bounce.send.contact_id,
      p_kind: "address_bounced",
      p_reason:
        typeof smtp === "string" && smtp.trim() !== ""
          ? `The mail server says this address doesn't exist: ${smtp.trim()}`
          : "The mail server says this address doesn't exist",
      p_to_email: bounce.send.to_email,
      ...(bounce.send.reminder_id ? { p_reminder: bounce.send.reminder_id } : {}),
    });
    if (raiseError) throw new Error(`Raising a bounce alert failed: ${raiseError.message}`);
    if (isNew) raised += 1;
    // One alert answers every bounce for this contact in the window.
    answeredAt.set(bounce.send.contact_id, now.toISOString());
  }
  return raised;
}

/**
 * Recomputes delivery state for every contact with unprocessed events.
 *
 * From the contact's whole stored history, not from the new events alone: the
 * soft-bounce rule counts a streak and a delivery resets it, so a verdict
 * built from one page would condemn an address whose earlier successes are
 * sitting in the same table.
 */
async function applyVerdicts(supabase: ReturnType<typeof getAdminSupabase>): Promise<number> {
  const { data: pending, error } = await supabase
    .from("email_callbacks")
    .select("id, send_id, email_sends!inner(contact_id)")
    .is("processed_at", null)
    .not("send_id", "is", null);
  if (error) throw new Error(`Reading pending events failed: ${error.message}`);

  // Contact → the callback ids this run is consuming for it.
  //
  // A linked send can still have no contact: `contact_id` is `on delete set
  // null`, so retiring a contact leaves its send history behind, and a
  // verification send we make ourselves never had one. Those callbacks can
  // never produce a verdict, and skipping them would leave them unprocessed
  // for ever — re-read by every run, growing without bound. The sweep retires
  // them instead; see `email_callbacks_sweep_unmatched`.
  const byContact = new Map<string, string[]>();
  for (const row of pending ?? []) {
    const send = row.email_sends as unknown as { contact_id: string | null } | null;
    const contactId = send?.contact_id;
    if (!contactId) continue;
    byContact.set(contactId, [...(byContact.get(contactId) ?? []), row.id]);
  }

  let updated = 0;
  for (const [contactId, callbackIds] of byContact) {
    const history = await contactHistory(supabase, contactId);
    const verdict = resolveDeliveryVerdict(history);

    const { error: applyError } = await supabase.rpc("email_delivery_apply", {
      p_contact: contactId,
      p_state: verdict.state,
      p_callback_ids: callbackIds,
      // Omitted rather than null when nothing has bounced: the function
      // coalesces a missing value to the column's current one.
      ...(verdict.lastBouncedAt ? { p_last_bounced: verdict.lastBouncedAt } : {}),
    });
    if (applyError) throw new Error(`Applying delivery state failed: ${applyError.message}`);
    updated += 1;
  }
  return updated;
}

/** Every stored event for one contact, oldest first, classified. */
async function contactHistory(
  supabase: ReturnType<typeof getAdminSupabase>,
  contactId: string,
): Promise<DeliveryHistoryEntry[]> {
  const { data, error } = await supabase
    .from("email_callbacks")
    .select("event, occurred_at, email_sends!inner(contact_id)")
    .eq("email_sends.contact_id", contactId)
    .not("occurred_at", "is", null)
    .order("occurred_at", { ascending: true });
  if (error) throw new Error(`Reading contact history failed: ${error.message}`);

  return (data ?? []).map((row) => ({
    outcome: classifyEvent(row.event),
    occurredAt: row.occurred_at as string,
  }));
}
