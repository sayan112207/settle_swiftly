import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { OG_IMAGE_URL, SITE_URL, THEME_COLOR } from "./brand";

const PUBLIC = fileURLToPath(new URL("../../public", import.meta.url));

describe("brand metadata", () => {
  test("social image URL is absolute and points at the site", () => {
    expect(OG_IMAGE_URL.startsWith(`${SITE_URL}/`)).toBe(true);
  });

  test("every asset the page head and manifest reference exists in public/", () => {
    const manifest = JSON.parse(readFileSync(join(PUBLIC, "site.webmanifest"), "utf8"));
    const referenced = [
      "favicon.ico",
      "favicon.svg",
      "apple-touch-icon.png",
      "og-image.png",
      ...manifest.icons.map((i: { src: string }) => i.src.replace(/^\//, "")),
    ];
    for (const file of referenced) {
      expect([file, existsSync(join(PUBLIC, file))]).toEqual([file, true]);
    }
  });

  test("manifest theme colour matches the head theme colour", () => {
    const manifest = JSON.parse(readFileSync(join(PUBLIC, "site.webmanifest"), "utf8"));
    expect(manifest.theme_color).toBe(THEME_COLOR);
  });
});
