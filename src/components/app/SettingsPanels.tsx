import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";

import { AppButton } from "@/components/app/AppButton";
import { PRODUCT_NAME } from "@/lib/brand";
import type { SettingsView, TeamMember } from "@/lib/settings-view";
import { DEFAULT_SEND_WINDOW } from "@/lib/services/accounts-rules";
import { cn } from "@/lib/utils";

/** Tooltip for every control whose backend isn't built yet. */
const COMING_SOON = "Coming soon";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Amber notice shown above every panel when the viewer can't change settings. */
export function PermissionBanner() {
  return (
    <div
      role="status"
      className="rounded-card border border-warn-edge bg-warn-tint px-4 py-3 text-body font-semibold text-warn"
    >
      Only owners and admins can change these settings.
    </div>
  );
}

/** Panel heading with an optional one-line description. */
function PanelHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header>
      <h2 className="text-section font-bold tracking-tight text-fg">{title}</h2>
      {subtitle ? <p className="mt-1 text-prose text-fg-soft">{subtitle}</p> : null}
    </header>
  );
}

/** A titled block inside a panel. */
function Block({
  title,
  helper,
  children,
}: {
  title: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-body font-semibold text-fg">{title}</h3>
        {helper ? <p className="mt-1 text-prose text-fg-soft">{helper}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** A muted line explaining that something isn't built yet. */
function ComingSoonNote({ children }: { children: React.ReactNode }) {
  return <p className="text-prose text-fg-muted">{children}</p>;
}

/** A button for an action with no backend yet: disabled, with a tooltip saying so. */
function ComingSoonButton({
  label,
  variant = "secondary",
}: {
  label: string;
  variant?: "primary" | "secondary";
}) {
  return (
    <AppButton
      variant={variant}
      disabled
      title={COMING_SOON}
      aria-label={`${label} (coming soon)`}
      className="shrink-0 whitespace-nowrap"
    >
      {label}
    </AppButton>
  );
}

/** A switch card. Unbacked switches are disabled and show no value; locked ones are on for good. */
function SwitchCard({
  title,
  description,
  locked = false,
}: {
  title: string;
  description: string;
  locked?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-card border border-hairline bg-card p-5">
      <div className="flex items-start gap-2">
        {locked ? <Lock aria-hidden className="mt-1 size-3.5 shrink-0 text-fg-muted" /> : null}
        <div>
          <div className="text-body font-semibold text-fg">{title}</div>
          <p className="mt-1 text-prose text-fg-soft">{description}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={locked}
        aria-label={locked ? `${title} (always on)` : `${title} (coming soon)`}
        disabled
        title={locked ? "This can't be turned off." : COMING_SOON}
        className={cn(
          "relative h-[22px] w-10 shrink-0 rounded-full disabled:cursor-not-allowed",
          locked ? "bg-accent opacity-70" : "bg-alt opacity-60",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-[18px] rounded-full bg-card",
            locked ? "right-0.5" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}

/** Sending: mailbox, payment alerts, send window and safety. Only the defaults are real today. */
export function SendingPanel() {
  const sendDays: readonly string[] = DEFAULT_SEND_WINDOW.days;
  return (
    <div className="space-y-7">
      <PanelHeader
        title="Sending"
        subtitle="Control what mailbox chasing sends from and how alerts arrive."
      />

      <Block title="Connected mailbox">
        <div className="flex items-center justify-between gap-4 rounded-card border border-hairline bg-card p-5">
          <div>
            <div className="text-body font-semibold text-fg">No sending address connected.</div>
            <p className="mt-1 text-prose text-fg-soft">
              Connecting a mailbox is coming soon. We never send from a {PRODUCT_NAME} address on
              your behalf.
            </p>
          </div>
          <ComingSoonButton label="Connect Gmail" variant="primary" />
        </div>
      </Block>

      <Block
        title="Payment alerts"
        helper="Credits only. We never see debits, balances, or payroll."
      >
        <div className="flex items-center justify-between gap-4 rounded-card border border-hairline bg-card p-5">
          <p className="text-body text-fg">Bank credit alerts forward to a {PRODUCT_NAME} inbox.</p>
          <ComingSoonButton label="Set up forwarding" />
        </div>
      </Block>

      <Block title="Send window">
        <ul className="flex flex-wrap gap-2" aria-label="Days messages may send">
          {WEEKDAYS.map((day) => {
            const on = sendDays.includes(day);
            return (
              <li
                key={day}
                aria-label={`${day}: ${on ? "on" : "off"}`}
                // Plain string, not cn(): tailwind-merge would drop the size
                // class next to the colour class.
                className={`rounded-pill border px-3.5 py-2 text-prose font-semibold ${
                  on
                    ? "border-accent-edge bg-accent-tint text-accent"
                    : "border-stroke bg-card text-fg-soft"
                }`}
              >
                {day}
              </li>
            );
          })}
        </ul>
        <ComingSoonNote>
          Editing the organisation send window is coming soon. Each account can set its own from its
          Settings tab.
        </ComingSoonNote>
      </Block>

      <Block title="Safety">
        <div className="space-y-3">
          <SwitchCard
            title="Pause chasing on dispute"
            description="Automatically pause when a customer disputes an invoice."
          />
          <SwitchCard
            title="Require approval for first message"
            description="New recipients always get a manual review first."
          />
          <SwitchCard
            title="24-hour cooling-off before escalation"
            description="This can't be turned off."
            locked
          />
        </div>
      </Block>

      <ComingSoonButton label="Save changes" variant="primary" />
    </div>
  );
}

/** A labelled read-only field in the Organisation form. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-eyebrow font-semibold tracking-widest text-fg-muted uppercase">
      <span className="mb-2 block">{label}</span>
      {children}
    </label>
  );
}

/** Organisation: the real org name, read-only; every other detail is coming soon. */
export function OrganisationPanel({ orgName }: { orgName: string }) {
  return (
    <div className="space-y-6">
      <PanelHeader title="Organisation" />
      <div className="max-w-[420px] space-y-5">
        <Field label="Organisation name">
          <input
            className="field cursor-not-allowed font-semibold normal-case tracking-normal"
            value={orgName}
            readOnly
            aria-readonly
            title="Renaming is coming soon"
          />
        </Field>
        <ComingSoonNote>GSTIN, currency and registered address are coming soon.</ComingSoonNote>
        <Field label="GSTIN">
          <input className="field" disabled title={COMING_SOON} />
        </Field>
        <Field label="Currency">
          <select className="field" disabled title={COMING_SOON} />
        </Field>
        <Field label="Registered address">
          <textarea className="field" rows={3} disabled title={COMING_SOON} />
        </Field>
      </div>
      <ComingSoonButton label="Save changes" variant="primary" />
    </div>
  );
}

/** A written empty state for a section with nothing behind it yet. */
function EmptyPanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="space-y-6">
      <PanelHeader title={title} />
      <div className="rounded-card border border-hairline bg-card p-10 text-center">
        <p className="text-body font-semibold text-fg">{message}</p>
      </div>
    </div>
  );
}

/** Entities: no entities backend yet. */
export function EntitiesPanel() {
  return <EmptyPanel title="Entities" message="Multiple billing entities are coming soon." />;
}

/** Team: Name, Email, Role. Until a team endpoint exists the only row is the signed-in user. */
export function TeamPanel({ members }: { members: TeamMember[] }) {
  return (
    <div className="space-y-6">
      <PanelHeader title="Team" />
      <div className="overflow-x-auto rounded-card border border-hairline bg-card">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-hairline text-eyebrow font-semibold tracking-widest text-fg-muted uppercase">
              <th scope="col" className="px-5 py-3">
                Name
              </th>
              <th scope="col" className="px-5 py-3">
                Email
              </th>
              <th scope="col" className="px-5 py-3">
                Role
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b border-hairline last:border-b-0">
                <td className="px-5 py-3 text-body font-semibold text-fg">
                  {member.name}
                  {member.isYou ? <span className="font-normal text-fg-muted"> (you)</span> : null}
                </td>
                <td className="px-5 py-3 text-body text-fg-soft break-all">
                  {member.email ?? "—"}
                </td>
                <td className="px-5 py-3">
                  <select
                    className="field w-auto min-w-[11rem]"
                    value={member.roleLabel}
                    disabled
                    title={COMING_SOON}
                    aria-label={`Role for ${member.name} (changing roles is coming soon)`}
                  >
                    <option value={member.roleLabel}>{member.roleLabel}</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ComingSoonNote>Inviting teammates and changing roles is coming soon.</ComingSoonNote>
    </div>
  );
}

/** Chasing defaults live on the Chasing pages; this section only points there. */
export function ChasingDefaultsPanel() {
  return (
    <div className="space-y-4">
      <PanelHeader title="Chasing defaults" />
      <p className="text-body text-fg">
        The default cadence lives on the{" "}
        <Link to="/app/chasing" className="font-semibold text-accent hover:text-accent-hover">
          Chasing → Cadence tab
        </Link>
        .
      </p>
    </div>
  );
}

/** Notifications: no preferences backend yet. */
export function NotificationsPanel() {
  return <EmptyPanel title="Notifications" message="Notification preferences are coming soon." />;
}

/** Picks the panel for the active section. */
export function SettingsPanel({ section, view }: { section: string; view: SettingsView }) {
  switch (section) {
    case "organisation":
      return <OrganisationPanel orgName={view.orgName} />;
    case "entities":
      return <EntitiesPanel />;
    case "team":
      return <TeamPanel members={view.members} />;
    case "chasing-defaults":
      return <ChasingDefaultsPanel />;
    case "notifications":
      return <NotificationsPanel />;
    default:
      return <SendingPanel />;
  }
}
