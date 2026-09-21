import { useQuery } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AppButton } from "@/components/app/AppButton";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import { ContactForm } from "@/components/app/ContactForm";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCalendarDaysSince } from "@/lib/format";
import {
  useCreateAccountContact,
  useDeleteAccountContact,
  useUpdateAccountContact,
  useUpdateAccountEscalation,
} from "@/lib/queries/account-contacts";
import {
  channelBlockedReason,
  CONTACT_CHANNELS,
  type AccountContact,
  type AccountContacts,
  type ContactLanguage,
  type ContactTier,
  type CreateContactBody,
  type UpdateContactBody,
} from "@/lib/schemas/accounts";
import { fromContact, toUpdateBody, type ContactFormValues } from "@/lib/schemas/contact-form";
import { AccountsApiError, accountsQueryKeys, getAccountContacts } from "@/lib/services/accounts";
import { cn } from "@/lib/utils";

const TIERS: {
  id: ContactTier;
  heading: string;
  description: string;
}[] = [
  {
    id: "P0",
    heading: "P0 — PRIMARY",
    description: "Receives every reminder from day one",
  },
  {
    id: "P1",
    heading: "P1 — ESCALATION",
    description: "Joins the thread when an invoice ages",
  },
  {
    id: "P2",
    heading: "P2 — FINAL ESCALATION",
    description: "Last step before formal action",
  },
];

const LANGUAGE_OPTIONS: { value: ContactLanguage; label: string }[] = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
  { value: "mr", label: "Marathi" },
  { value: "gu", label: "Gujarati" },
  { value: "bn", label: "Bengali" },
  { value: "kn", label: "Kannada" },
];

type AccountContactsPanelProps = {
  accountId: string;
  /** Archived accounts: every control is disabled until the account is restored. */
  readOnly?: boolean;
  /** Open this tier's add-contact form on arrival (the `?add=` search param). */
  openAddFor?: ContactTier | undefined;
  /** Called once that form is submitted or dismissed, so the param can be dropped. */
  onAddFormClosed?: (() => void) | undefined;
};

/** The Contacts tab: the P0/P1/P2 ladder and escalation timing. `readOnly` disables every control. */
export function AccountContactsPanel({
  accountId,
  readOnly = false,
  openAddFor,
  onAddFormClosed,
}: AccountContactsPanelProps) {
  const contactsQuery = useQuery({
    queryKey: accountsQueryKeys.contacts(accountId),
    queryFn: () => getAccountContacts(accountId),
    retry: false,
  });

  const createContact = useCreateAccountContact(accountId);
  const updateContact = useUpdateAccountContact(accountId);
  const deleteContact = useDeleteAccountContact(accountId);
  const updateEscalation = useUpdateAccountEscalation(accountId);

  /**
   * Held from just before a mutation is fired until it settles.
   *
   * All three mutations send the rendered `data.updated_at` as `If-Match`, and
   * only the server can mint the next one — the optimistic update deliberately
   * does not invent it. So a second mutation fired against the same render
   * carries a token the server has already spent, and returns `stale_write`.
   *
   * A ref rather than state, because the gap this closes is shorter than a
   * render: blurring an escalation input fires its mutation, and the click that
   * caused the blur fires another before React has re-rendered anything as
   * disabled. `isPending` cannot see that; a ref set during the first event can.
   * The disabled props below are the visible half of the same rule, not the
   * enforcement.
   */
  const inFlight = useRef(false);

  function runExclusive(fire: (release: () => void) => void): void {
    if (inFlight.current) return;
    inFlight.current = true;
    fire(() => {
      inFlight.current = false;
    });
  }

  if (contactsQuery.isPending) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading contacts">
        <AppSkeleton className="h-32 w-full" />
        <AppSkeleton className="h-32 w-full" />
        <AppSkeleton className="h-32 w-full" />
      </div>
    );
  }

  if (contactsQuery.isError) {
    const message =
      contactsQuery.error instanceof AccountsApiError
        ? contactsQuery.error.message
        : "Couldn't load contacts.";
    return (
      <div className="flex flex-col items-start gap-3 py-6">
        <p className="text-body font-semibold text-fg">{message}</p>
        <AppButton
          variant="secondary"
          onClick={() => {
            void contactsQuery.refetch();
          }}
        >
          Retry
        </AppButton>
      </div>
    );
  }

  const data = contactsQuery.data;
  if (!data) return null;

  const mutating =
    createContact.isPending ||
    updateContact.isPending ||
    deleteContact.isPending ||
    updateEscalation.isPending;

  return (
    <div className="flex flex-col gap-4">
      {readOnly ? (
        <p className="text-prose font-normal text-fg-muted">
          Contacts are read-only while this account is archived.
        </p>
      ) : null}
      <ContactsLadder
        data={data}
        busy={mutating || readOnly}
        openAddFor={readOnly ? undefined : openAddFor}
        onAddFormClosed={onAddFormClosed}
        onUpdate={(contactId, body, done) => {
          runExclusive((release) =>
            updateContact.mutate(
              { contactId, body, ifMatch: data.updated_at },
              {
                onSuccess: () => done?.(),
                onSettled: release,
              },
            ),
          );
        }}
        onDelete={(contactId) => {
          runExclusive((release) =>
            deleteContact.mutate({ contactId, ifMatch: data.updated_at }, { onSettled: release }),
          );
        }}
        onCreate={(body, done) => {
          runExclusive((release) =>
            createContact.mutate(
              { body, ifMatch: data.updated_at },
              {
                onSuccess: () => done(),
                onSettled: release,
              },
            ),
          );
        }}
        onSaveEscalation={(body) => {
          runExclusive((release) =>
            updateEscalation.mutate({ body, ifMatch: data.updated_at }, { onSettled: release }),
          );
        }}
      />
    </div>
  );
}

/**
 * The three tier groups, each with its contacts and an add-contact form, plus
 * the escalation timing beneath. One add-form is open at a time: two would
 * both carry the same `If-Match` token, and the second to submit would be
 * refused as a stale write.
 */
function ContactsLadder({
  data,
  busy,
  openAddFor,
  onAddFormClosed,
  onUpdate,
  onDelete,
  onCreate,
  onSaveEscalation,
}: {
  data: AccountContacts;
  busy: boolean;
  openAddFor?: ContactTier | undefined;
  onAddFormClosed?: (() => void) | undefined;
  /** `done` closes the edit form; like `onCreate`, only on a server-accepted write. */
  onUpdate: (contactId: string, body: UpdateContactBody, done?: () => void) => void;
  onDelete: (contactId: string) => void;
  /** `done` closes the form; it runs only when the server accepted the contact. */
  onCreate: (body: CreateContactBody, done: () => void) => void;
  onSaveEscalation: (body: { p1_after_days: number; p2_after_days: number }) => void;
}) {
  /** Which tier's add-form is open, if any. One at a time. */
  const [addingTo, setAddingTo] = useState<ContactTier | null>(openAddFor ?? null);

  /**
   * Which contact's card has been swapped for an edit form, if any, and the
   * values that form was opened with.
   *
   * One write form open at a time, add included, for the reason the add forms
   * are already exclusive: every form on this panel submits with the same
   * `If-Match` token, and the second to submit would be refused as a stale
   * write after the user had filled it in.
   *
   * The snapshot is kept because the card behind the form keeps re-rendering
   * from the query: by submit time `contact` may be somebody else's newer copy,
   * and `toUpdateBody` has to diff against what this user was actually shown.
   */
  const [editing, setEditing] = useState<{ id: string; opened: ContactFormValues } | null>(null);

  /**
   * Saves an edit, sending only what this user changed.
   *
   * An edit that changed nothing closes without a write: the PATCH would be
   * empty, and the ladder would still bump its version and log a
   * `contact_edited` row saying nothing happened.
   */
  function saveEdit(contactId: string, opened: ContactFormValues, edited: CreateContactBody) {
    const patch = toUpdateBody(opened, edited);
    if (Object.keys(patch).length === 0) {
      setEditing(null);
      return;
    }
    onUpdate(contactId, patch, () => setEditing(null));
  }

  function openEditor(contact: AccountContact) {
    setAddingTo(null);
    onAddFormClosed?.();
    setEditing({ id: contact.contact_id, opened: fromContact(contact) });
  }

  // Arriving with `?add=` again — clicking the strip from another tab, or a
  // second link — must reopen the form even though the component stayed mounted.
  useEffect(() => {
    if (openAddFor) {
      setEditing(null);
      setAddingTo(openAddFor);
    }
  }, [openAddFor]);

  /** Closing always clears the search param, whoever opened the form. */
  function closeAddForm() {
    setAddingTo(null);
    onAddFormClosed?.();
  }
  const [p1Days, setP1Days] = useState(data.p1_after_days);
  const [p2Days, setP2Days] = useState(data.p2_after_days);
  const p1Ref = useRef(p1Days);
  const p2Ref = useRef(p2Days);

  useEffect(() => {
    setP1Days(data.p1_after_days);
    setP2Days(data.p2_after_days);
    p1Ref.current = data.p1_after_days;
    p2Ref.current = data.p2_after_days;
  }, [data.p1_after_days, data.p2_after_days]);

  const escalationInvalid = !isValidEscalationOrder(p1Days, p2Days);

  function trySaveEscalation(nextP1: number, nextP2: number) {
    if (!isValidEscalationOrder(nextP1, nextP2)) return;
    if (nextP1 === data.p1_after_days && nextP2 === data.p2_after_days) return;
    onSaveEscalation({ p1_after_days: nextP1, p2_after_days: nextP2 });
  }

  function setP1(next: number) {
    p1Ref.current = next;
    setP1Days(next);
  }

  function setP2(next: number) {
    p2Ref.current = next;
    setP2Days(next);
  }

  const hasUsableP0 = data.contacts.some((c) => c.tier === "P0" && !c.do_not_contact);
  const bouncedP0 = data.contacts.find(
    (c) => c.tier === "P0" && !c.do_not_contact && c.delivery_state === "bounced",
  );

  return (
    <div className="space-y-8">
      <div className="space-y-8">
        {TIERS.map((tier) => {
          const tierContacts = data.contacts.filter((c) => c.tier === tier.id);
          return (
            <section key={tier.id} className="space-y-3">
              <div>
                <h2 className="text-section font-bold tracking-tight text-fg">{tier.heading}</h2>
                <p className="mt-1 text-prose font-normal text-fg-muted">{tier.description}</p>
              </div>

              {tier.id === "P0" && bouncedP0 ? (
                <BounceWarningStrip
                  contact={bouncedP0}
                  busy={busy}
                  onAdd={() => {
                    setEditing(null);
                    setAddingTo("P0");
                  }}
                />
              ) : null}

              {tier.id === "P0" && !hasUsableP0 ? (
                <div className="rounded-card border border-danger-edge bg-danger-tint p-4">
                  <p className="text-body font-semibold text-fg">
                    No primary contact. This account can't be chased.
                  </p>
                  <div className="mt-3">
                    <AppButton
                      variant="primary"
                      disabled={busy}
                      onClick={() => {
                        setEditing(null);
                        setAddingTo("P0");
                      }}
                    >
                      Add a contact
                    </AppButton>
                  </div>
                </div>
              ) : null}

              <div className="space-y-3">
                {tierContacts.map((contact) =>
                  editing?.id === contact.contact_id ? (
                    <ContactForm
                      key={contact.contact_id}
                      tier={contact.tier}
                      initial={editing.opened}
                      busy={busy}
                      submitLabel="Save changes"
                      onCancel={() => setEditing(null)}
                      onSubmit={(values) => saveEdit(contact.contact_id, editing.opened, values)}
                    />
                  ) : (
                    <ContactCard
                      key={contact.contact_id}
                      contact={contact}
                      busy={busy}
                      onUpdate={onUpdate}
                      onDelete={onDelete}
                      onEdit={() => openEditor(contact)}
                    />
                  ),
                )}
              </div>

              {addingTo === tier.id ? (
                <ContactForm
                  tier={tier.id}
                  busy={busy}
                  onCancel={closeAddForm}
                  onSubmit={(body) => onCreate(body, closeAddForm)}
                />
              ) : (
                <AppButton
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setEditing(null);
                    setAddingTo(tier.id);
                  }}
                >
                  + Add contact
                </AppButton>
              )}
            </section>
          );
        })}
      </div>

      <div className="space-y-4 rounded-card bg-subtle p-5">
        <p className="text-body font-semibold text-fg">
          Bring in P1 after{" "}
          <label className="inline-flex items-center gap-2">
            <span className="sr-only">P1 after days overdue</span>
            <input
              type="number"
              min={1}
              max={365}
              value={Number.isFinite(p1Days) ? p1Days : ""}
              onChange={(event) => setP1(Number(event.target.value))}
              onBlur={() => trySaveEscalation(p1Ref.current, p2Ref.current)}
              disabled={busy}
              className="w-16 rounded-input border border-stroke bg-card px-2 py-1 text-body font-semibold text-fg tnum disabled:opacity-60"
            />
          </label>{" "}
          days overdue
        </p>
        <p className="text-body font-semibold text-fg">
          Bring in P2 after{" "}
          <label className="inline-flex items-center gap-2">
            <span className="sr-only">P2 after days overdue</span>
            <input
              type="number"
              min={1}
              max={365}
              value={Number.isFinite(p2Days) ? p2Days : ""}
              onChange={(event) => setP2(Number(event.target.value))}
              onBlur={() => trySaveEscalation(p1Ref.current, p2Ref.current)}
              disabled={busy}
              className="w-16 rounded-input border border-stroke bg-card px-2 py-1 text-body font-semibold text-fg tnum disabled:opacity-60"
            />
          </label>{" "}
          days overdue
        </p>
        {escalationInvalid ? (
          <p className="text-prose font-semibold text-danger">P2 must come after P1.</p>
        ) : null}

        <div role="status" className="text-prose font-normal text-fg-muted">
          {escalationPreview(data.contacts, p1Days, p2Days)}
        </div>
      </div>
    </div>
  );
}

/**
 * Shown when the usable P0's email is bouncing — the account looks chaseable
 * and is not, so the strip names who is failing and how long it has been.
 */
function BounceWarningStrip({
  contact,
  busy,
  onAdd,
}: {
  contact: AccountContact;
  busy: boolean;
  onAdd: () => void;
}) {
  const days = contact.last_bounced_at
    ? formatCalendarDaysSince(contact.last_bounced_at)
    : Number.NaN;
  const ago =
    Number.isFinite(days) && days >= 0
      ? days === 0
        ? "today"
        : days === 1
          ? "1 day ago"
          : `${days} days ago`
      : "recently";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-danger-edge bg-danger-tint px-4 py-3">
      <p className="text-body font-semibold text-fg">
        <span className="font-bold">{contact.name}'s email is bouncing.</span> Nothing has reached
        this account since {ago}.
      </p>
      {/* "Replace" is two operations: add someone reachable, then retire the
          bouncing one from its own card menu. This button does the first, and
          says so — the old label promised a flow that does not exist. */}
      <AppButton variant="secondary" disabled={busy} onClick={onAdd}>
        Add a working contact
      </AppButton>
    </div>
  );
}

/**
 * One saved contact: who they are, which tier they sit on, and every per-contact
 * switch. Editing their details is not inline here — the `⋯` menu swaps the
 * whole card for the contact form, so a name, an address and a phone number are
 * corrected in one submit rather than field by field.
 */
function ContactCard({
  contact,
  busy,
  onUpdate,
  onDelete,
  onEdit,
}: {
  contact: AccountContact;
  busy: boolean;
  onUpdate: (contactId: string, body: UpdateContactBody) => void;
  onDelete: (contactId: string) => void;
  /** Opens this contact's edit form. The ladder owns which one is open. */
  onEdit: () => void;
}) {
  const [dncReason, setDncReason] = useState(contact.dnc_reason ?? "");
  const missingDetail = missingChannelDetail(contact);

  return (
    <article className="rounded-card border border-hairline bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body font-semibold text-fg">
            {contact.name}
            {contact.designation ? (
              <span className="text-fg-muted"> · {contact.designation}</span>
            ) : null}
          </p>
          <p className="mt-1 text-prose font-normal text-fg-muted">
            {[contact.email, contact.phone].filter(Boolean).join(" · ")}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <label className="flex items-center gap-2 text-prose font-semibold text-fg-muted">
            <span className="sr-only">Tier for {contact.name}</span>
            <select
              aria-label={`Tier for ${contact.name}`}
              value={contact.tier}
              onChange={(event) =>
                onUpdate(contact.contact_id, {
                  tier: event.target.value as ContactTier,
                })
              }
              disabled={busy}
              className="rounded-input border border-stroke bg-card px-2 py-1 text-prose font-semibold text-fg disabled:opacity-60"
            >
              <option value="P0">P0</option>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
            </select>
          </label>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex size-8 items-center justify-center rounded-nav text-fg-soft hover:bg-hovered hover:text-fg"
                aria-label={`Actions for ${contact.name}`}
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="rounded-card border-hairline bg-card shadow-overlay"
            >
              <DropdownMenuItem
                disabled={busy}
                className="cursor-pointer text-body font-semibold focus:bg-hovered"
                onSelect={() => onEdit()}
              >
                Edit contact
              </DropdownMenuItem>
              {(["P0", "P1", "P2"] as const).map((tier) => (
                <DropdownMenuItem
                  key={tier}
                  disabled={busy || contact.tier === tier}
                  className="cursor-pointer text-body font-semibold focus:bg-hovered"
                  onSelect={() => onUpdate(contact.contact_id, { tier })}
                >
                  Move to {tier}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                disabled={busy}
                className="cursor-pointer text-body font-semibold text-danger focus:bg-hovered"
                onSelect={() => onDelete(contact.contact_id)}
              >
                Remove contact
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {CONTACT_CHANNELS.map((channel) => (
          <ChannelSwitch
            key={channel.key}
            label={channel.label}
            name={contact.name}
            busy={busy}
            checked={contact[channel.key]}
            // A channel already on stays switchable off whatever the contact is
            // missing — turning it off is the fix, so it can never be the thing
            // that is blocked.
            blockedReason={contact[channel.key] ? null : channelBlockedReason(contact, channel.key)}
            onCheckedChange={(checked) => onUpdate(contact.contact_id, { [channel.key]: checked })}
          />
        ))}
        <ChannelSwitch
          label="Always CC"
          name={contact.name}
          busy={busy}
          checked={contact.always_cc}
          onCheckedChange={(checked) => onUpdate(contact.contact_id, { always_cc: checked })}
        />
        <ChannelSwitch
          label="Do not contact"
          name={contact.name}
          busy={busy}
          checked={contact.do_not_contact}
          onCheckedChange={(checked) =>
            onUpdate(contact.contact_id, {
              do_not_contact: checked,
              dnc_reason: checked ? dncReason || "No reason given" : null,
            })
          }
        />
      </div>

      {missingDetail ? (
        <p className="mt-2 text-prose font-normal text-fg-muted">
          {missingDetail} Add one from <span className="font-semibold">Edit contact</span>.
        </p>
      ) : null}

      {contact.do_not_contact ? (
        <label className="mt-3 block text-prose font-semibold text-fg-muted">
          Reason
          <input
            value={dncReason}
            onChange={(event) => setDncReason(event.target.value)}
            onBlur={() =>
              onUpdate(contact.contact_id, {
                do_not_contact: true,
                dnc_reason: dncReason || "No reason given",
              })
            }
            disabled={busy}
            className="mt-1 w-full rounded-input border border-stroke bg-card px-3 py-2 text-body font-semibold text-fg disabled:opacity-60"
          />
        </label>
      ) : null}

      <label className="mt-3 flex items-center gap-2 text-prose font-semibold text-fg-muted">
        Language
        <select
          aria-label={`Language for ${contact.name}`}
          value={contact.language}
          onChange={(event) =>
            onUpdate(contact.contact_id, {
              language: event.target.value as ContactLanguage,
            })
          }
          disabled={busy}
          className="rounded-input border border-stroke bg-card px-2 py-1 text-prose font-semibold text-fg disabled:opacity-60"
        >
          {LANGUAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </article>
  );
}

/**
 * Why this contact's off channels can't be switched on, as one sentence, or
 * null when nothing is missing.
 *
 * `contacts_reachable` guarantees an email or a phone, so in practice only one
 * of the two can be absent — but both are composed here rather than assumed,
 * because this renders whatever the server sent.
 */
function missingChannelDetail(contact: AccountContact): string | null {
  const needs = (detail: "email" | "phone") =>
    CONTACT_CHANNELS.filter(
      (channel) =>
        channel.detail === detail &&
        !contact[channel.key] &&
        channelBlockedReason(contact, channel.key),
    ).map((channel) => channel.label);

  const parts: string[] = [];
  const needsEmail = needs("email");
  const needsPhone = needs("phone");
  if (needsEmail.length > 0) parts.push(`${listOf(needsEmail)} needs an address to send to.`);
  if (needsPhone.length > 0) {
    parts.push(`${listOf(needsPhone)} ${needsPhone.length > 1 ? "need" : "needs"} a phone number.`);
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

/** `["WhatsApp", "SMS"]` → `"WhatsApp and SMS"`. */
function listOf(labels: string[]): string {
  return labels.length > 1
    ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`
    : (labels[0] ?? "");
}

/**
 * One channel or per-contact flag, as a switch.
 *
 * `blockedReason` disables it rather than letting the click through: a channel
 * with nothing to send to is refused by the mock and by the
 * `contacts_channel_reachable` constraint, so allowing the toggle would buy a
 * round trip and a toast in place of an answer the card already has.
 */
function ChannelSwitch({
  label,
  name,
  checked,
  busy,
  blockedReason = null,
  onCheckedChange,
}: {
  label: string;
  name: string;
  checked: boolean;
  busy: boolean;
  /** Set when switching this channel on would queue reminders against nothing. */
  blockedReason?: string | null;
  onCheckedChange: (checked: boolean) => void;
}) {
  const blocked = blockedReason !== null;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${label} for ${name}`}
      // The card's own line below says the same thing for anyone who cannot
      // hover; `title` is the pointer shortcut, not the only explanation.
      title={blockedReason ?? undefined}
      disabled={busy || blocked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "rounded-pill px-2.5 py-1 text-pill font-semibold transition-colors duration-150 disabled:opacity-60",
        checked ? "bg-accent-tint text-accent" : "bg-alt text-fg-soft",
        blocked && "cursor-not-allowed",
      )}
    >
      {label}
    </button>
  );
}

function isValidEscalationOrder(p1Days: number, p2Days: number): boolean {
  return (
    Number.isInteger(p1Days) &&
    Number.isInteger(p2Days) &&
    p1Days >= 1 &&
    p1Days <= 365 &&
    p2Days >= 1 &&
    p2Days <= 365 &&
    p2Days > p1Days
  );
}

function escalationPreview(
  contacts: readonly AccountContact[],
  p1Days: number,
  p2Days: number,
): string {
  const p0 = contacts.find((c) => c.tier === "P0" && !c.do_not_contact);
  const p1 = contacts.find((c) => c.tier === "P1" && !c.do_not_contact);
  const p2 = contacts.find((c) => c.tier === "P2" && !c.do_not_contact);

  // Cumulative: P0 stays; later tiers "join" the same thread.
  const first = p0 ? previewName(p0.name) : "Primary";
  const parts = [`${first} gets the first reminder.`];
  if (p1 && Number.isFinite(p1Days)) {
    parts.push(`${previewName(p1.name)} joins at day ${p1Days}.`);
  }
  if (p2 && Number.isFinite(p2Days)) {
    parts.push(`${previewName(p2.name)} joins at day ${p2Days}.`);
  }
  return parts.join(" ");
}

/** Spec preview: "Rajat" / "Rajesh" / "Mr. Sharma". */
function previewName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const honorific = parts[0];
  if (honorific === "Mr." || honorific === "Mrs." || honorific === "Ms.") {
    return `${honorific} ${parts[parts.length - 1]}`;
  }
  return parts[0] ?? fullName;
}
