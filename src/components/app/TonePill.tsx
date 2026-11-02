import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The app's four pill tones, from the system brief. Every pill carries text:
 * colour is never the only signal.
 *
 * A plain span rather than `ui/badge`, for the same reason as
 * `AccountStatusBadge`: the landing badge's border and radius would box the
 * cell.
 */
export type PillTone = "neutral" | "green" | "warn" | "danger" | "ink";

const TONE_CLASSES: Record<PillTone, string> = {
  neutral: "bg-alt text-fg-soft",
  green: "bg-accent-tint text-accent",
  warn: "bg-warn-tint text-warn",
  danger: "bg-danger-tint text-danger",
  // "Next" in a schedule: the one pill that reads as current rather than state.
  ink: "bg-alt text-fg",
};

/** A rounded label in one of the system's tones. */
export function TonePill({
  tone = "neutral",
  className,
  children,
}: {
  tone?: PillTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-pill font-semibold whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
