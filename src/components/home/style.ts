import type { CSSProperties } from "react";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Today as the stamps print it: 09 NOV 2026. */
export function stampDate(d = new Date()): string {
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Shorthand for the CSS custom properties the motion classes read. */
export function vars(v: Record<string, string | number>): CSSProperties {
  return v as CSSProperties;
}
