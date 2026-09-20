import { describe, expect, test } from "bun:test";

import {
  EMPTY_CONTACT,
  collectFieldErrors,
  contactFormSchema,
  refreshShownErrors,
  type ContactFormValues,
} from "@/lib/schemas/contact-form";

/** The errors the form would be showing right after a failed submit. */
function errorsAfterSubmit(values: ContactFormValues) {
  const parsed = contactFormSchema.safeParse(values);
  return parsed.success ? {} : collectFieldErrors(parsed.error);
}

describe("refreshShownErrors", () => {
  test("clears the partner field of a cross-field rule", () => {
    // "Add an email address or a phone number" is raised on both fields, so
    // clearing only the edited one would leave the phone still complaining
    // about a rule the email has just satisfied.
    const blank: ContactFormValues = { ...EMPTY_CONTACT, name: "Rajat" };
    const shown = errorsAfterSubmit(blank);
    expect(shown.email).toBe("Add an email address or a phone number.");
    expect(shown.phone).toBe("Add an email address or a phone number.");

    const next = { ...blank, email: "rajat@example.com" };
    expect(refreshShownErrors(next, shown)).toEqual({});
  });

  test("keeps a message that is still true", () => {
    const values: ContactFormValues = { ...EMPTY_CONTACT, name: "", email: "rajat@example.com" };
    const shown = errorsAfterSubmit(values);
    expect(shown.name).toBeDefined();

    // Editing the email does not excuse the missing name.
    const next = { ...values, email: "other@example.com" };
    expect(refreshShownErrors(next, shown).name).toBe(shown.name);
  });

  test("never flags a field the user has not been told about yet", () => {
    // Only `name` was flagged. Clearing it must not surface the unreachable
    // -contact error on email and phone while they are still typing.
    const values: ContactFormValues = { ...EMPTY_CONTACT, name: "" };
    const shown = { name: "Enter the contact's name." };
    const next = { ...values, name: "Rajat" };

    expect(refreshShownErrors(next, shown)).toEqual({});
  });

  test("an untouched form shows nothing", () => {
    expect(refreshShownErrors(EMPTY_CONTACT, {})).toEqual({});
  });
});

describe("contactFormSchema", () => {
  test("a contact with neither email nor phone cannot exist", () => {
    // Mirrors the `contacts_reachable` check constraint.
    const errors = errorsAfterSubmit({ ...EMPTY_CONTACT, name: "Rajat" });
    expect(errors.email).toBe("Add an email address or a phone number.");
  });

  test("a channel switched on needs the address it sends to", () => {
    const whatsappNoPhone = errorsAfterSubmit({
      ...EMPTY_CONTACT,
      name: "Rajat",
      email: "rajat@example.com",
      channel_whatsapp: true,
    });
    expect(whatsappNoPhone.phone).toBe("WhatsApp or SMS is on, so a phone number is needed.");
  });

  test("every channel off is refused", () => {
    const noChannel = errorsAfterSubmit({
      ...EMPTY_CONTACT,
      name: "Rajat",
      email: "rajat@example.com",
      channel_email: false,
    });
    expect(noChannel.channel_email).toBe("Pick at least one channel to reach them on.");
  });
});
