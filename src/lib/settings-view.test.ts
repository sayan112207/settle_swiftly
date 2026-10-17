import { describe, expect, test } from "bun:test";

import { buildSettingsView, canEditSettings, roleLabel, SETTINGS_SECTIONS } from "./settings-view";

const user = { id: "u1", email: "priya@example.com", displayName: "Priya Nair", avatarUrl: null };
const org = { id: "o1", name: "Meridian Traders Co", role: "owner" };

describe("settings-view", () => {
  test("labels every org role and passes unknown roles through", () => {
    expect(roleLabel("owner")).toBe("Owner");
    expect(roleLabel("admin")).toBe("Admin");
    expect(roleLabel("member")).toBe("Member");
    expect(roleLabel("auditor")).toBe("auditor");
  });

  test("only owners and admins can edit", () => {
    expect(canEditSettings("owner")).toBe(true);
    expect(canEditSettings("admin")).toBe(true);
    expect(canEditSettings("member")).toBe(false);
    expect(canEditSettings("")).toBe(false);
  });

  test("builds the view from the signed-in user and org", () => {
    const view = buildSettingsView(user, { ...org, role: "member" });
    expect(view.orgName).toBe("Meridian Traders Co");
    expect(view.canEdit).toBe(false);
    expect(view.members).toEqual([
      {
        id: "u1",
        name: "Priya Nair",
        email: "priya@example.com",
        roleLabel: "Member",
        isYou: true,
      },
    ]);
  });

  test("falls back to the email, then 'You', when there is no display name", () => {
    expect(buildSettingsView({ ...user, displayName: "  " }, org).members[0]?.name).toBe(
      "priya@example.com",
    );
    expect(buildSettingsView({ ...user, displayName: "", email: null }, org).members[0]?.name).toBe(
      "You",
    );
  });

  test("lists the sections in the reference order", () => {
    expect(SETTINGS_SECTIONS.map((s) => s.label)).toEqual([
      "Sending",
      "Organisation",
      "Entities",
      "Team",
      "Chasing defaults",
      "Notifications",
    ]);
  });
});
