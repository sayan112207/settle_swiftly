import { describe, expect, test } from "bun:test";

import { cn } from "./utils";

describe("cn", () => {
  test("keeps a custom size token next to a colour", () => {
    expect(cn("text-body font-semibold", "text-white")).toBe("text-body font-semibold text-white");
    expect(cn("text-pill", "text-accent")).toBe("text-pill text-accent");
  });

  test("a later size still replaces an earlier one", () => {
    expect(cn("text-body", "text-prose")).toBe("text-prose");
    expect(cn("text-sm", "text-eyebrow")).toBe("text-eyebrow");
  });

  test("a later colour still replaces an earlier one", () => {
    expect(cn("text-fg", "text-white")).toBe("text-white");
  });
});
