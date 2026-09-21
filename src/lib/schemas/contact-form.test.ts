import { describe, expect, test } from "bun:test";

import {
  EMPTY_CONTACT,
  collectFieldErrors,
  contactFormSchema,
  refreshShownErrors,
  toCreateBody,
  toUpdateBody,
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
    // The message names the channel that is on, not the pair that could be:
    // it is the same rule the contact card's disabled toggles state.
    const whatsappNoPhone = errorsAfterSubmit({
      ...EMPTY_CONTACT,
      name: "Rajat",
      email: "rajat@example.com",
      channel_whatsapp: true,
    });
    expect(whatsappNoPhone.phone).toBe("WhatsApp needs a phone number.");

    const smsNoPhone = errorsAfterSubmit({
      ...EMPTY_CONTACT,
      name: "Rajat",
      email: "rajat@example.com",
      channel_sms: true,
    });
    expect(smsNoPhone.phone).toBe("SMS needs a phone number.");

    // Email is on by default, so a phone-only contact has to turn it off.
    const emailNoAddress = errorsAfterSubmit({
      ...EMPTY_CONTACT,
      name: "Rajat",
      phone: "+91 98765 43210",
    });
    expect(emailNoAddress.email).toBe("Email needs an address to send to.");
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

describe("toUpdateBody", () => {
  const opened: ContactFormValues = {
    ...EMPTY_CONTACT,
    tier: "P1",
    name: "Rajesh Kumar",
    designation: "Finance Manager",
    email: "rajesh@sharmatraders.com",
  };

  test("sends only the fields this user changed", () => {
    const edited = { ...opened, phone: "+91 99999 99999" };
    expect(toUpdateBody(opened, toCreateBody(edited))).toEqual({ phone: "+91 99999 99999" });
  });

  test("an edit that changed nothing is an empty patch", () => {
    // The caller closes the form on this rather than spending a write and an
    // activity row on saying nothing.
    expect(toUpdateBody(opened, toCreateBody(opened))).toEqual({});
  });

  test("a cleared optional field is sent as null, not left out", () => {
    // Absent means "leave alone" to both the RPC and the mock, so a designation
    // the user deleted has to travel as an explicit null.
    const edited = { ...opened, designation: "" };
    expect(toUpdateBody(opened, toCreateBody(edited))).toEqual({ designation: null });
  });

  test("never carries do_not_contact, whatever the form holds", () => {
    // The card owns silencing somebody. An edit that does not mention it cannot
    // un-silence them, which is why the form has no such field.
    const edited = { ...opened, name: "Rajesh K." };
    expect(Object.keys(toUpdateBody(opened, toCreateBody(edited)))).toEqual(["name"]);
  });
});
