import { describe, expect, test } from "bun:test";

import { phraseMatches } from "@/lib/services/confirm-phrase";

describe("phraseMatches", () => {
  test("forgives case and surrounding whitespace", () => {
    expect(phraseMatches("  kaveri & sons ", "Kaveri & Sons")).toBe(true);
  });

  test("collapses runs of inner whitespace", () => {
    expect(phraseMatches("Kaveri   &  Sons", "Kaveri & Sons")).toBe(true);
  });

  test("rejects a partial phrase", () => {
    expect(phraseMatches("Kaveri", "Kaveri & Sons")).toBe(false);
  });

  test("an empty phrase never confirms", () => {
    expect(phraseMatches("", "")).toBe(false);
    expect(phraseMatches("   ", "  ")).toBe(false);
  });
});
