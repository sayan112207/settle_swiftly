import { useQuery } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AppButton } from "@/components/app/AppButton";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCalendarDaysSince } from "@/lib/format";
import {
  useDeleteAccountContact,
  useUpdateAccountContact,
  useUpdateAccountEscalation,
} from "@/lib/queries/account-contacts";
import type {
  AccountContact,
  AccountContacts,
  ContactLanguage,
  ContactTier,
  UpdateContactBody,
} from "@/lib/schemas/accounts";
import { AccountsApiError, accountsQueryKeys, getAccountContacts } from "@/lib/services/accounts";
import { cn } from "@/lib/utils";

/**
 * Controls whose flow does not exist yet are disabled rather than left live.
 * An enabled button that does nothing reads as a broken app, not a pending one.
 */
const ADD_CONTACT_PENDING = "Adding and replacing contacts is not in this build yet.";

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
};

/** The Contacts tab: the P0/P1/P2 ladder and escalation timing. `readOnly` disables every control. */
export function AccountContactsPanel({ accountId, readOnly = false }: AccountContactsPanelProps) {
  const contactsQuery = useQuery({
    queryKey: accountsQueryKeys.contacts(accountId),
    queryFn: () => getAccountContacts(accountId),
    retry: false,
  });

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

  const mutating = updateContact.isPending || deleteContact.isPending || updateEscalation.isPending;

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
        onUpdate={(contactId, body) => {
          runExclusive((release) =>
            updateContact.mutate(
              { contactId, body, ifMatch: data.updated_at },
              { onSettled: release },
            ),
          );
        }}
        onDelete={(contactId) => {
          runExclusive((release) =>
            deleteContact.mutate({ contactId, ifMatch: data.updated_at }, { onSettled: release }),
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

function ContactsLadder({
  data,
  busy,
  onUpdate,
  onDelete,
  onSaveEscalation,
}: {
  data: AccountContacts;
  busy: boolean;
  onUpdate: (contactId: string, body: UpdateContactBody) => void;
  onDelete: (contactId: string) => void;
  onSaveEscalation: (body: { p1_after_days: number; p2_after_days: number }) => void;
}) {
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

              {tier.id === "P0" && bouncedP0 ? <BounceWarningStrip contact={bouncedP0} /> : null}

              {tier.id === "P0" && !hasUsableP0 ? (
                <div className="rounded-card border border-danger-edge bg-danger-tint p-4">
                  <p className="text-body font-semibold text-fg">
                    No primary contact. This account can't be chased.
                  </p>
                  <div className="mt-3">
                    <AppButton variant="primary" disabled title={ADD_CONTACT_PENDING}>
                      Add a contact
                    </AppButton>
                  </div>
                </div>
              ) : null}

              <div className="space-y-3">
                {tierContacts.map((contact) => (
                  <ContactCard
                    key={contact.contact_id}
                    contact={contact}
                    busy={busy}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                  />
                ))}
              </div>

              <AppButton variant="secondary" disabled title={ADD_CONTACT_PENDING}>
                + Add contact
              </AppButton>
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

function BounceWarningStrip({ contact }: { contact: AccountContact }) {
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
      <AppButton variant="secondary" disabled title={ADD_CONTACT_PENDING}>
        Replace contact
      </AppButton>
    </div>
  );
}

function ContactCard({
  contact,
  busy,
  onUpdate,
  onDelete,
}: {
  contact: AccountContact;
  busy: boolean;
  onUpdate: (contactId: string, body: UpdateContactBody) => void;
  onDelete: (contactId: string) => void;
}) {
  const [dncReason, setDncReason] = useState(contact.dnc_reason ?? "");

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
        <ChannelSwitch
          label="Email"
          name={contact.name}
          busy={busy}
          checked={contact.channel_email}
          onCheckedChange={(checked) => onUpdate(contact.contact_id, { channel_email: checked })}
        />
        <ChannelSwitch
          label="WhatsApp"
          name={contact.name}
          busy={busy}
          checked={contact.channel_whatsapp}
          onCheckedChange={(checked) => onUpdate(contact.contact_id, { channel_whatsapp: checked })}
        />
        <ChannelSwitch
          label="SMS"
          name={contact.name}
          busy={busy}
          checked={contact.channel_sms}
          onCheckedChange={(checked) => onUpdate(contact.contact_id, { channel_sms: checked })}
        />
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

function ChannelSwitch({
  label,
  name,
  checked,
  busy,
  onCheckedChange,
}: {
  label: string;
  name: string;
  checked: boolean;
  busy: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${label} for ${name}`}
      disabled={busy}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "rounded-pill px-2.5 py-1 text-pill font-semibold transition-colors duration-150 disabled:opacity-60",
        checked ? "bg-accent-tint text-accent" : "bg-alt text-fg-soft",
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
