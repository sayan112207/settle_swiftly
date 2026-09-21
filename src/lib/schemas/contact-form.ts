import { z } from "zod";

import {
  blockedChannels,
  contactLanguageSchema,
  contactTierSchema,
  CONTACT_CHANNELS,
  type AccountContact,
  type CreateContactBody,
} from "@/lib/schemas/accounts";

/**
 * The add-contact form's own shape.
 *
 * Separate from `createContactBodySchema` because a form holds strings: an
 * untouched optional field is `""`, not `null`, and `z.string().email()` would
 * reject that before the user has done anything wrong. This validates what the
 * inputs actually contain; `toCreateBody` converts it to the wire shape.
 */
export const contactFormSchema = z
  .object({
    tier: contactTierSchema,
    name: z.string().trim().min(1, "Enter the contact's name.").max(200),
    designation: z.string().trim().max(200),
    email: z.string().trim(),
    phone: z.string().trim(),
    channel_email: z.boolean(),
    channel_whatsapp: z.boolean(),
    channel_sms: z.boolean(),
    always_cc: z.boolean(),
    language: contactLanguageSchema,
  })
  .superRefine((value, ctx) => {
    if (value.email !== "" && !z.string().email().safeParse(value.email).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "That doesn't look like an email address.",
      });
    }

    // `contacts_reachable` is a database check constraint: a contact with
    // neither an email nor a phone cannot be reached, so it cannot exist.
    // Caught here so the form says which field to fill rather than the server
    // refusing the whole submission.
    if (value.email === "" && value.phone === "") {
      const message = "Add an email address or a phone number.";
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["email"], message });
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["phone"], message });
    }

    // A contact reachable on no channel would be created and then never
    // written to, which looks like the product silently dropping them.
    if (!value.channel_email && !value.channel_whatsapp && !value.channel_sms) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["channel_email"],
        message: "Pick at least one channel to reach them on.",
      });
    }

    // Channels have to match what you can actually send to. Email on with no
    // address, or WhatsApp/SMS on with no number, is a reminder queued against
    // nothing. Anchored on the missing detail rather than the switch, because
    // filling the field in is the fix the form is asking for.
    for (const { key, reason } of blockedChannels(value)) {
      const spec = CONTACT_CHANNELS.find((c) => c.key === key);
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [spec?.detail ?? "email"],
        message: reason,
      });
    }
  });

export type ContactFormValues = z.infer<typeof contactFormSchema>;

export type ContactFieldErrors = Partial<Record<keyof ContactFormValues, string>>;

/** A blank contact: email on, because email is the channel every org has. */
export const EMPTY_CONTACT: ContactFormValues = {
  tier: "P0",
  name: "",
  designation: "",
  email: "",
  phone: "",
  channel_email: true,
  channel_whatsapp: false,
  channel_sms: false,
  always_cc: false,
  language: "en",
};

/**
 * A saved contact as form values, for the card's Edit contact form.
 *
 * `do_not_contact` and `dnc_reason` are deliberately not round-tripped: they
 * are not fields on this form, and the card owns them. Leaving them out of the
 * PATCH is what keeps an edit from silently un-silencing somebody.
 */
export function fromContact(contact: AccountContact): ContactFormValues {
  return {
    tier: contact.tier,
    name: contact.name,
    designation: contact.designation ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    channel_email: contact.channel_email,
    channel_whatsapp: contact.channel_whatsapp,
    channel_sms: contact.channel_sms,
    always_cc: contact.always_cc,
    language: contact.language,
  };
}

/**
 * Form values to the wire body. Blank optional text becomes `null` rather than
 * `""` — the column is nullable, and an empty string would render as a contact
 * who has an email address that happens to be nothing.
 */
export function toCreateBody(values: ContactFormValues): CreateContactBody {
  const blankToNull = (value: string) => (value.trim() === "" ? null : value.trim());
  return {
    tier: values.tier,
    name: values.name.trim(),
    designation: blankToNull(values.designation),
    email: blankToNull(values.email),
    phone: blankToNull(values.phone),
    channel_email: values.channel_email,
    channel_whatsapp: values.channel_whatsapp,
    channel_sms: values.channel_sms,
    always_cc: values.always_cc,
    language: values.language,
  };
}

/** First message per field, so one bad field does not bury the others. */
export function collectFieldErrors(error: z.ZodError): ContactFieldErrors {
  const next: ContactFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof ContactFormValues | undefined;
    if (key && !next[key]) next[key] = issue.message;
  }
  return next;
}

/**
 * Re-validates after an edit and returns the messages still worth showing.
 *
 * Clearing only the edited field is not enough here, because several of the
 * rules above are cross-field: "add an email address or a phone number" is
 * raised on `email` *and* `phone`, so typing an email would satisfy the rule
 * while the phone still carried the message. Turning a channel on or off moves
 * errors between fields the same way.
 *
 * Only fields that were already flagged can keep a message. Re-running the
 * whole schema on every keystroke would otherwise light up fields the user has
 * not reached yet and tell them off for an empty form they are still filling.
 */
export function refreshShownErrors(
  values: ContactFormValues,
  shown: ContactFieldErrors,
): ContactFieldErrors {
  const flagged = Object.keys(shown) as (keyof ContactFormValues)[];
  if (flagged.length === 0) return shown;

  const parsed = contactFormSchema.safeParse(values);
  if (parsed.success) return {};

  const fresh = collectFieldErrors(parsed.error);
  const next: ContactFieldErrors = {};
  for (const key of flagged) {
    const message = fresh[key];
    if (message) next[key] = message;
  }
  return next;
}
