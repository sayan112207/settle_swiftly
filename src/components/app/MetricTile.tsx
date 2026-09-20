import { Link, type LinkProps } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

type MetricTileProps = {
  /**
   * Omitted by the "Needs your attention" cards in spec §4, which are the same
   * anatomy as a metric tile minus the label above the number.
   */
  eyebrow?: string;
  value: string;
  subline: string;
  /** The overdue tile carries its number in danger ink. */
  tone?: "default" | "danger";
} & Required<Pick<LinkProps, "to">> &
  Pick<LinkProps, "search">;

/**
 * Not a wrapper around `ui/card`: the whole tile has to be one anchor so the
 * entire card is the hit target and keyboard users land on it once. `Card` is a
 * div, and nesting a card inside a link would give a link wrapping a box rather
 * than a box that is a link.
 *
 * Eyebrow tracking is `tracking-widest` (0.1em) where the spec says 0.08em —
 * Tailwind's scale has no 0.08em step and `tracking-[0.08em]` would be a second
 * arbitrary value in a codebase that permits exactly one.
 */
export function MetricTile({
  eyebrow,
  value,
  subline,
  tone = "default",
  to,
  search,
}: MetricTileProps) {
  return (
    <Link
      to={to}
      // Spread rather than `search={search}`: under exactOptionalPropertyTypes
      // an explicit undefined is not the same as an absent prop, and Link's
      // search type does not admit undefined.
      {...(search === undefined ? {} : { search })}
      className="block rounded-card border border-hairline bg-card px-5 py-4 transition-colors duration-150 hover:bg-hovered"
    >
      {eyebrow ? (
        <span className="block text-eyebrow font-semibold tracking-widest text-fg-muted uppercase">
          {eyebrow}
        </span>
      ) : null}
      <span
        className={cn(
          // `tnum` is the tokens file's tabular-numerals hook. Tiles sit in a
          // row and their digits should line up across cards.
          // nowrap is the overflow test: ₹4,20,00,000.00 must stay on one line
          // and must not clip. Truncation would fail the spec; wrapping would
          // too. The tile is allowed to grow.
          "tnum block whitespace-nowrap text-metric font-bold tracking-tight",
          eyebrow && "mt-2",
          tone === "danger" ? "text-danger" : "text-fg",
        )}
      >
        {value}
      </span>
      <span className="mt-1 block text-prose font-normal text-fg-soft">{subline}</span>
    </Link>
  );
}
