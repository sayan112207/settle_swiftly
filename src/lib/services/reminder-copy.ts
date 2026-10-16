/**
 * The words a reminder actually goes out with.
 *
 * Pure, like `accounts-rules.ts`: no clock, no network, no database. The
 * caller supplies the facts; this decides the sentence. That is what makes
 * the copy testable, and it is the reason the cadence preview and the real
 * send can never drift — both call this.
 *
 * The voice ladder is the product's, taken from the tone demo on the landing
 * page rather than invented here:
 *
 *   Gentle   "Hi Priya — just a quick reminder that invoice #0042 is due."
 *   Standard "Hi Priya, invoice #0042 is now overdue. You can pay here."
 *   Firm     "Invoice #0042 is 14 days overdue. Please arrange payment today."
 *
 * Note what escalates and what does not. Gentle greets with a dash, Standard
 * with a comma and the word overdue, Firm drops the greeting entirely and
 * gives an instruction. None of them threaten, none use exclamation marks,
 * and none mention consequences the product cannot carry out. These are
 * invoices to customers a business wants to keep.
 */

import { formatINR, formatShortDate } from "@/lib/format";
import type { CadenceTone, ContactLanguage } from "@/lib/schemas/accounts";

/** Everything a reminder needs to know. All of it already exists on the row. */
export type ReminderContext = {
  /** The business doing the chasing. Also the From name on the email. */
  orgName: string;
  /** Who it is addressed to. */
  contactName: string;
  /** The customer being chased — used when the contact is not the debtor. */
  accountName: string;
  invoiceNumber: string;
  /** Money string, e.g. `"482000.00"`. Formatted here, never upstream. */
  amount: string;
  dueDate: string;
  /** Negative before the due date, positive after. */
  daysOverdue: number;
  tone: CadenceTone;
  /** Only `en` is written. See `REMINDER_LANGUAGES`. */
  language: ContactLanguage;
};

export type ReminderMessage = {
  subject: string;
  textBody: string;
};

/**
 * Languages this module can actually write.
 *
 * Deliberately just English. `contactLanguageSchema` offers eight, and
 * machine-translating collections copy into the other seven would be the
 * wrong kind of complete: register carries most of the meaning when asking
 * for money, and a mistranslated Firm reminder is a damaged customer
 * relationship, not a typo. The other seven want a native speaker, and until
 * then falling back to English is the honest failure.
 */
export const REMINDER_LANGUAGES: readonly ContactLanguage[] = ["en"];

/** `1 day`, `45 days`. Collections copy that says "1 days" reads as unattended. */
function days(n: number): string {
  return `${n} ${n === 1 ? "day" : "days"}`;
}

/**
 * Where the invoice stands relative to its due date.
 *
 * Every tone branches on this, and none may use the word *overdue* outside
 * `late`. The default cadence puts Standard on the "Due date" step, so
 * assuming lateness would tell a customer their invoice is overdue on the day
 * it falls due — a false statement, to someone who has not yet done anything
 * wrong, sent by the product whose whole claim is that it chases without
 * damaging the relationship.
 */
type Timing = "upcoming" | "due_today" | "late";

/** `daysOverdue` to the three states the copy branches on. */
function timingOf(daysOverdue: number): Timing {
  if (daysOverdue > 0) return "late";
  return daysOverdue === 0 ? "due_today" : "upcoming";
}

/** First name only, matching how the escalation preview already addresses people. */
function firstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const honorific = parts[0];
  if (honorific === "Mr." || honorific === "Mrs." || honorific === "Ms.") {
    return `${honorific} ${parts[parts.length - 1]}`;
  }
  return parts[0] ?? fullName;
}

/**
 * The subject line.
 *
 * Carries the invoice number in every tone, because the recipient's accounts
 * inbox is sorted and searched by it — a subject without it makes the message
 * harder to action, whatever it says.
 */
export function reminderSubject(ctx: ReminderContext): string {
  const { invoiceNumber, orgName, daysOverdue, tone } = ctx;
  const timing = timingOf(daysOverdue);
  const due = formatShortDate(ctx.dueDate);

  if (tone === "Gentle") {
    return timing === "late"
      ? `Invoice ${invoiceNumber} from ${orgName}`
      : `Invoice ${invoiceNumber} from ${orgName} — due ${timing === "due_today" ? "today" : due}`;
  }
  if (tone === "Standard") {
    if (timing === "late") return `Invoice ${invoiceNumber} is overdue — ${orgName}`;
    if (timing === "due_today") return `Invoice ${invoiceNumber} is due today — ${orgName}`;
    return `Invoice ${invoiceNumber} is due ${due} — ${orgName}`;
  }
  if (timing === "late") return `Invoice ${invoiceNumber} — ${days(daysOverdue)} overdue`;
  return `Invoice ${invoiceNumber} — due ${timing === "due_today" ? "today" : due}`;
}

/**
 * The body, as plain text.
 *
 * Plain text and not HTML: these go to accounts inboxes behind corporate
 * filters, where a styled template is the thing that gets quarantined. The
 * message is four short lines and a signature; there is nothing HTML would
 * add except a reason to distrust it.
 */
export function reminderBody(ctx: ReminderContext): string {
  const { orgName, accountName, invoiceNumber, daysOverdue, tone } = ctx;
  const amount = formatINR(ctx.amount);
  const due = formatShortDate(ctx.dueDate);
  const name = firstName(ctx.contactName);

  // Each tone is written out rather than assembled from fragments. Collections
  // copy lives or dies on how it reads as a whole sentence, and a template
  // that interpolates "overdue"/"due" into one skeleton produces the stilted
  // half-English that makes a reminder look automated.
  const timing = timingOf(daysOverdue);

  if (tone === "Gentle") {
    const when =
      timing === "late"
        ? `was due on ${due}`
        : timing === "due_today"
          ? `is due today`
          : `is due on ${due}`;
    const opening = `just a quick reminder that invoice ${invoiceNumber} for ${amount} ${when}.`;
    return [
      `Hi ${name} — ${opening}`,
      ``,
      `If it is already on its way, please ignore this. If anything is unclear about the invoice, reply here and we will sort it out.`,
      ``,
      `Thank you,`,
      orgName,
    ].join("\n");
  }

  if (tone === "Standard") {
    const position =
      timing === "late"
        ? `Invoice ${invoiceNumber} for ${amount} was due on ${due} and is now ${days(daysOverdue)} overdue.`
        : timing === "due_today"
          ? `Invoice ${invoiceNumber} for ${amount} is due today.`
          : `Invoice ${invoiceNumber} for ${amount} is due on ${due}.`;
    const ask =
      timing === "late"
        ? `Could you let us know when it will be paid?`
        : `Could you confirm it is scheduled for payment?`;
    return [
      `Hi ${name},`,
      ``,
      position,
      ``,
      `${ask} If there is a problem with the invoice, or it is waiting on something at your end, reply here and we will help.`,
      ``,
      `Thank you,`,
      orgName,
    ].join("\n");
  }

  // Firm drops the greeting, states the position, and asks for one thing.
  // It names the account rather than the person: at this point the message is
  // to the company, and the individual should not feel personally accused.
  const firmPosition =
    timing === "late"
      ? [
          `Invoice ${invoiceNumber} for ${amount} is ${days(daysOverdue)} overdue.`,
          ``,
          `It was due on ${due} and remains unpaid. Please arrange payment, or tell us today when it will be made.`,
        ]
      : [
          `Invoice ${invoiceNumber} for ${amount} is due ${timing === "due_today" ? "today" : `on ${due}`}.`,
          ``,
          `Please arrange payment by the due date, or tell us today when it will be made.`,
        ];
  return [
    ...firmPosition,
    ``,
    `If this invoice is disputed, reply with the details and we will put chasing on hold while it is resolved.`,
    ``,
    `${orgName}`,
    `Re: ${accountName}`,
  ].join("\n");
}

/** Subject and body together — what the sender hands the provider. */
export function composeReminder(ctx: ReminderContext): ReminderMessage {
  return { subject: reminderSubject(ctx), textBody: reminderBody(ctx) };
}

/**
 * The `sender` field, RFC 5322 style: `Org Name <address>`.
 *
 * The From *name* is the org, never the product. The customer owes this
 * business money and has never heard of the tool chasing on its behalf — a
 * reminder that arrives from anyone else reads as a collections agency, which
 * is precisely the relationship the product is built to avoid.
 *
 * A quoted display name, because an unquoted one containing a comma or a dot
 * — "Sharma Traders Pvt. Ltd" — is parsed as two addresses. Embedded quotes
 * are stripped rather than escaped: a business name containing one is far
 * less likely than a header this mangles.
 */
export function senderHeader(orgName: string, address: string): string {
  const display = orgName.replace(/["\\]/g, "").trim();
  return display === "" ? address : `"${display}" <${address}>`;
}
