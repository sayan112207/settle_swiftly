/**
 * Sending one reminder, and recording that it was sent.
 *
 * The write comes first and the send second, deliberately. A send the
 * database never heard of is an email the customer received and the ladder
 * will send again; a row for a send that then failed is visible, explained
 * and retryable. Between the two, the recoverable failure is the one to pick.
 */

import { getReminderSenderEmail } from "@/lib/env.server";
import { composeReminder, senderHeader, type ReminderContext } from "@/lib/services/reminder-copy";
import { sendEmail } from "@/lib/services/smtp2go.server";
import { getAdminSupabase } from "@/lib/supabase/admin-client.server";

export type SendReminderInput = {
  orgId: string;
  /** Null for a dry run or a preview; set for a real cadence step. */
  reminderId?: string | null;
  contactId: string;
  toEmail: string;
  context: ReminderContext;
};

export type SendReminderResult = {
  sendId: string;
  ok: boolean;
  providerMessageId: string | null;
  error: string | null;
};

/**
 * Composes, records, sends, then records what happened.
 *
 * The `email_sends` row is the join target for every delivery event that
 * follows: the ingester matches callbacks on `provider_message_id`, and a
 * bounce can only reach `contacts.delivery_state` through `contact_id` on
 * this row. Sending without writing it first would mean a bounce with
 * nothing to attach to.
 */
export async function sendReminder(input: SendReminderInput): Promise<SendReminderResult> {
  const supabase = getAdminSupabase();
  const message = composeReminder(input.context);
  const sender = senderHeader(input.context.orgName, getReminderSenderEmail());

  const { data: row, error: insertError } = await supabase
    .from("email_sends")
    .insert({
      org_id: input.orgId,
      purpose: "reminder",
      to_email: input.toEmail,
      subject: message.subject,
      contact_id: input.contactId,
      reminder_id: input.reminderId ?? null,
      status: "queued",
    })
    .select("id")
    .single();
  if (insertError || !row) {
    throw new Error(`Could not record the send: ${insertError?.message ?? "no row returned"}`);
  }

  const result = await sendEmail({
    sender,
    to: input.toEmail,
    subject: message.subject,
    textBody: message.textBody,
  });

  // `provider_message_id` is only ever set alongside `sent`, which is what the
  // `email_sends_sent_has_message_id` constraint insists on. A refusal stores
  // the provider's own words — they are the only explanation anyone will get.
  const patch = result.ok
    ? {
        status: "sent" as const,
        provider_message_id: result.providerMessageId,
        sent_at: new Date().toISOString(),
      }
    : { status: "failed" as const, error: result.error };

  const { error: updateError } = await supabase.from("email_sends").update(patch).eq("id", row.id);
  if (updateError) {
    throw new Error(`Sent, but could not record the outcome: ${updateError.message}`);
  }

  return {
    sendId: row.id,
    ok: result.ok,
    providerMessageId: result.ok ? result.providerMessageId : null,
    error: result.ok ? null : result.error,
  };
}
