import type { ReactNode } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Truncation only bites when the column has a ceiling, so text columns opt in
 * to one. These are Tailwind's own sizing steps, not arbitrary widths.
 */
const MAX_WIDTH_CLASSES = {
  xs: "max-w-xs",
  sm: "max-w-sm",
  md: "max-w-md",
} as const;

type BaseColumn = {
  id: string;
  /**
   * Empty string means a genuinely unheaded column. Spec §9 requires the Chase
   * now table to announce exactly seven headers, so the action column's `<th>`
   * has to be empty rather than carrying hidden text.
   */
  header: string;
  /** `right` for money and counts, so digits line up under the header. */
  align?: "left" | "right";
  /** For action columns, where a visible header would be noise. */
  headerHidden?: boolean;
  /** A control in the header cell, e.g. select-all. Renders after the label. */
  headerCell?: () => ReactNode;
  /**
   * When set, the header label is a real `<button>` and the `<th>` gets
   * `aria-sort`. Used by Accounts (and any later sortable table).
   */
  ariaSort?: "none" | "ascending" | "descending" | "other";
  onHeaderClick?: () => void;
  /**
   * Lets this column's text wrap, and the table fit its container instead of
   * scrolling. For prose columns in half-width tables (Reports), where a
   * sideways scroll would hide the sentence the row exists to show.
   */
  wrap?: boolean;
};

type TextColumn<Row> = BaseColumn & {
  text: (row: Row) => string;
  truncateAt?: keyof typeof MAX_WIDTH_CLASSES;
  cell?: never;
};

type NodeColumn<Row> = BaseColumn & {
  cell: (row: Row) => ReactNode;
  text?: never;
  truncateAt?: never;
};

/**
 * A column is either plain text or a rendered node, never both. Text columns
 * get truncation and a `title` for free; node columns are for badges and
 * buttons, where truncating would be wrong.
 */
export type Column<Row> = TextColumn<Row> | NodeColumn<Row>;

type DataTableProps<Row> = {
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  isRowSelected?: (row: Row) => boolean;
};

/**
 * Wraps `ui/table`. The horizontal scroll container the spec asks for is the
 * primitive's own `overflow-auto` wrapper — adding a second one here would
 * nest two scrollers and the outer would never engage.
 *
 * Borders live on cells, not the row: `border-collapse` + `tr { border-b }` is
 * unreliable across browsers and was painting the header as a floating slab
 * when paired with `border-separate`.
 *
 * Row height is padding-driven: the spec names a `--row-h` token that the
 * tokens file does not define, so `py-3` stands in at 12px.
 */
export function DataTable<Row>({ columns, rows, rowKey, isRowSelected }: DataTableProps<Row>) {
  const fits = columns.some((column) => column.wrap);
  return (
    <Table className={cn("border-collapse", fits ? "w-full" : "min-w-max")}>
      <TableHeader>
        <TableRow className="border-0 hover:bg-transparent">
          {columns.map((column) => (
            <TableHead
              key={column.id}
              scope="col"
              aria-sort={column.ariaSort}
              className={cn(
                "h-auto border-b border-hairline bg-subtle px-3 py-3 text-eyebrow font-semibold tracking-widest text-fg-muted uppercase",
                column.align === "right" && "text-right",
              )}
            >
              {renderHeader(column)}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const selected = isRowSelected?.(row) ?? false;
          return (
            <TableRow
              key={rowKey(row)}
              // A selected row keeps its tint while hovered. Swapping to the
              // neutral hover would read as "this row is no longer selected".
              // Override ui/table's hover:bg-muted/50 (landing token) and
              // border-b on the row — borders sit on cells instead.
              className={cn(
                "border-0",
                selected ? "bg-accent-row hover:bg-accent-row" : "hover:bg-hovered",
              )}
            >
              {columns.map((column) => (
                <TableCell
                  key={column.id}
                  className={cn(
                    "border-b border-hairline px-3 py-3 text-body font-semibold text-fg",
                    column.wrap ? "min-w-40 whitespace-normal" : "whitespace-nowrap",
                    column.align === "right" && "text-right",
                  )}
                >
                  {renderCell(column, row)}
                </TableCell>
              ))}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function renderHeader<Row>(column: Column<Row>): ReactNode {
  if (column.onHeaderClick) {
    return (
      <button
        type="button"
        onClick={column.onHeaderClick}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-widest transition-colors duration-150 hover:text-fg",
          column.align === "right" && "w-full justify-end",
        )}
      >
        {column.header}
      </button>
    );
  }

  const label = column.headerHidden ? (
    // An empty header stays empty: a hidden label would add an eighth
    // announced column header where the spec allows seven.
    column.header ? (
      <span className="sr-only">{column.header}</span>
    ) : null
  ) : (
    column.header
  );

  if (!column.headerCell) return label;

  return (
    <>
      {label}
      {column.headerCell()}
    </>
  );
}

function renderCell<Row>(column: Column<Row>, row: Row): ReactNode {
  if (column.text) {
    const value = column.text(row);
    return (
      // `title` is unconditional: the tooltip should be there whether or not
      // this particular value happens to be long enough to clip today.
      <span
        title={value}
        className={cn("block truncate", column.truncateAt && MAX_WIDTH_CLASSES[column.truncateAt])}
      >
        {value}
      </span>
    );
  }
  return column.cell(row);
}
