import type { AuthedUser, OrgSummary } from "@/lib/services/auth.service";

/** The Settings sections, in the order the sub-nav lists them. */
export const SETTINGS_SECTIONS = [
  { id: "sending", label: "Sending" },
  { id: "organisation", label: "Organisation" },
  { id: "entities", label: "Entities" },
  { id: "team", label: "Team" },
  { id: "chasing-defaults", label: "Chasing defaults" },
  { id: "notifications", label: "Notifications" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

/** One row of the Team table. */
export type TeamMember = {
  id: string;
  name: string;
  email: string | null;
  roleLabel: string;
  isYou: boolean;
};

/** What the Settings page renders, built from the signed-in user and active org. */
export type SettingsView = {
  orgName: string;
  canEdit: boolean;
  members: TeamMember[];
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

/** Display label for an org role; an unknown role is shown as-is rather than guessed. */
export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

/** Owners and admins may change org settings; the database policies say the same. */
export function canEditSettings(role: string): boolean {
  return role === "owner" || role === "admin";
}

/**
 * The page's view model. There is no endpoint for the team list yet, so the
 * only member we can show is the signed-in user.
 */
export function buildSettingsView(user: AuthedUser, org: OrgSummary): SettingsView {
  return {
    orgName: org.name,
    canEdit: canEditSettings(org.role),
    members: [
      {
        id: user.id,
        name: user.displayName.trim() || user.email || "You",
        email: user.email,
        roleLabel: roleLabel(org.role),
        isYou: true,
      },
    ],
  };
}
