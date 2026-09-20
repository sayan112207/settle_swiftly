import { useState, type FormEvent } from "react";

import { AppButton } from "@/components/app/AppButton";
import { CONTACT_LANGUAGES } from "@/lib/contact-languages";
import {
  EMPTY_CONTACT,
  collectFieldErrors,
  contactFormSchema,
  toCreateBody,
  type ContactFieldErrors,
  type ContactFormValues,
} from "@/lib/schemas/contact-form";
import type { ContactTier, CreateContactBody } from "@/lib/schemas/accounts";
import { cn } from "@/lib/utils";

const TIER_OPTIONS: { value: ContactTier; label: string }[] = [
  { value: "P0", label: "P0 — Primary" },
  { value: "P1", label: "P1 — Escalation" },
  { value: "P2", label: "P2 — Final escalation" },
];

/**
 * Everything needed to add a contact, in one pass — controlled by the caller
 * and with no `<form>` of its own.
 *
 * Channels and language are here rather than left to the contact card
 * afterwards: which address a reminder goes out on is part of deciding who this
 * person is, and making someone add a contact and then immediately reopen it to
 * say "WhatsApp, in Hindi" is two trips for one decision.
 *
 * `Do not contact` is the one card control deliberately absent. It marks
 * somebody who has asked not to be chased, which happens to an existing contact
 * later — creating one already silenced would leave the required reason field
 * asking why you are adding them at all.
 *
 * No `<form>` of its own because the new-account screen renders these inside
 * its own form, next to the account name, and a nested `<form>` is invalid HTML
 * that browsers resolve by dropping the inner one — the fields would render and
 * never submit.
 */
export function ContactFields({
  values,
  errors,
  busy,
  autoFocus = false,
  onChange,
}: {
  values: ContactFormValues;
  errors: ContactFieldErrors;
  busy: boolean;
  /** Off by default: the new-account screen focuses its own name field first. */
  autoFocus?: boolean;
  onChange: <K extends keyof ContactFormValues>(key: K, value: ContactFormValues[K]) => void;
}) {
  const set = onChange;
  const name = values.name.trim() || "this contact";
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <Labelled label="Tier" error={errors.tier}>
          <select
            value={values.tier}
            onChange={(e) => set("tier", e.target.value as ContactTier)}
            disabled={busy}
            className="field"
          >
            {TIER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Labelled>

        <Labelled label="Name" error={errors.name}>
          <input
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            disabled={busy}
            autoFocus={autoFocus}
            placeholder="Rajat Mehta"
            aria-invalid={Boolean(errors.name)}
            className="field"
          />
        </Labelled>

        <Labelled label="Designation (optional)" error={errors.designation}>
          <input
            value={values.designation}
            onChange={(e) => set("designation", e.target.value)}
            disabled={busy}
            placeholder="Accounts Executive"
            className="field"
          />
        </Labelled>

        <Labelled label="Language" error={errors.language}>
          <select
            value={values.language}
            onChange={(e) => set("language", e.target.value as ContactFormValues["language"])}
            disabled={busy}
            className="field"
          >
            {CONTACT_LANGUAGES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Labelled>

        <Labelled label="Email" error={errors.email}>
          <input
            type="email"
            value={values.email}
            onChange={(e) => set("email", e.target.value)}
            disabled={busy}
            placeholder="rajat@sharmatraders.com"
            aria-invalid={Boolean(errors.email)}
            className="field"
          />
        </Labelled>

        <Labelled label="Phone" error={errors.phone}>
          <input
            type="tel"
            value={values.phone}
            onChange={(e) => set("phone", e.target.value)}
            disabled={busy}
            placeholder="+91 98765 43210"
            aria-invalid={Boolean(errors.phone)}
            className="field"
          />
        </Labelled>
      </div>

      <p className="text-prose text-fg-soft">
        An email address or a phone number — at least one, or there is no way to reach them.
      </p>

      <fieldset>
        <legend className="text-eyebrow font-semibold tracking-widest text-fg-muted uppercase">
          Reminders go out on
        </legend>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Toggle
            label="Email"
            name={name}
            checked={values.channel_email}
            busy={busy}
            onChange={(next) => set("channel_email", next)}
          />
          <Toggle
            label="WhatsApp"
            name={name}
            checked={values.channel_whatsapp}
            busy={busy}
            onChange={(next) => set("channel_whatsapp", next)}
          />
          <Toggle
            label="SMS"
            name={name}
            checked={values.channel_sms}
            busy={busy}
            onChange={(next) => set("channel_sms", next)}
          />
          <span className="mx-1 h-4 w-px bg-hairline" aria-hidden="true" />
          <Toggle
            label="Always CC"
            name={name}
            checked={values.always_cc}
            busy={busy}
            onChange={(next) => set("always_cc", next)}
          />
        </div>
        {errors.channel_email ? (
          <p role="alert" className="mt-2 text-prose text-danger">
            {errors.channel_email}
          </p>
        ) : null}
      </fieldset>
    </>
  );
}

/**
 * Everything needed to add a contact, in one pass, as a standalone form.
 *
 * Used by the Contacts tab, where adding a contact is the whole interaction.
 * The new-account screen composes `ContactFields` into its own form instead.
 */
export function ContactForm({
  tier,
  busy = false,
  submitLabel = "Add contact",
  onSubmit,
  onCancel,
}: {
  /** The tier group this form was opened from; still editable in the form. */
  tier: ContactTier;
  busy?: boolean;
  submitLabel?: string;
  onSubmit: (body: CreateContactBody) => void;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<ContactFormValues>({ ...EMPTY_CONTACT, tier });
  const [errors, setErrors] = useState<ContactFieldErrors>({});

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = contactFormSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(collectFieldErrors(parsed.error));
      return;
    }
    onSubmit(toCreateBody(parsed.data));
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-card border border-hairline bg-card p-5"
      aria-label="Add a contact"
    >
      <ContactFields
        values={values}
        errors={errors}
        busy={busy}
        autoFocus
        onChange={(key, value) => {
          setValues((current) => ({ ...current, [key]: value }));
          setErrors((current) => ({ ...current, [key]: undefined }));
        }}
      />
      <div className="flex justify-end gap-3">
        {onCancel ? (
          <AppButton variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </AppButton>
        ) : null}
        <AppButton type="submit" loading={busy}>
          {submitLabel}
        </AppButton>
      </div>
    </form>
  );
}

/** A form field with its label above and its validation message below. */
function Labelled({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-eyebrow font-semibold tracking-widest text-fg-muted uppercase">
      <span className="mb-2 block">{label}</span>
      {children}
      {error ? (
        <p role="alert" className="mt-1 text-prose font-normal text-danger normal-case">
          {error}
        </p>
      ) : null}
    </label>
  );
}

/** A channel or Always-CC switch, matching the contact card's own toggles. */
function Toggle({
  label,
  name,
  checked,
  busy,
  onChange,
}: {
  label: string;
  name: string;
  checked: boolean;
  busy: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${label} for ${name}`}
      disabled={busy}
      onClick={() => onChange(!checked)}
      className={cn(
        "rounded-pill px-2.5 py-1 text-pill font-semibold transition-colors duration-150 disabled:opacity-60",
        checked ? "bg-accent-tint text-accent" : "bg-alt text-fg-soft",
      )}
    >
      {label}
    </button>
  );
}
