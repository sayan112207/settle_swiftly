import type { DsoPoint } from "@/lib/schemas/reports";
import {
  dsoBarHeights,
  dsoTrend,
  formatMonthLong,
  formatMonthShort,
} from "@/lib/services/reports-rules";
import { formatDays } from "@/lib/format";
import { cn } from "@/lib/utils";

const TREND_CLASSES = {
  good: "text-accent",
  bad: "text-danger",
  neutral: "text-fg-soft",
} as const;

/**
 * Current DSO beside a month-by-month bar chart.
 *
 * The bars and their labels are decorative and hidden from assistive tech; the
 * `sr-only` table carries the same figures, as the aging bar does. The current
 * month is the only bar in the accent colour — the eye should land on "now".
 */
export function DsoChart({ series }: { series: readonly DsoPoint[] }) {
  const heights = dsoBarHeights(series);
  const trend = dsoTrend(series);
  const current = series[series.length - 1];
  const lastIndex = series.length - 1;

  return (
    <div className="flex items-center gap-8 rounded-card border border-hairline bg-card p-6">
      <table className="sr-only">
        <caption>DSO by month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">DSO (days)</th>
          </tr>
        </thead>
        <tbody>
          {series.map((point) => (
            <tr key={point.month}>
              <td>{formatMonthLong(point.month)}</td>
              <td>{point.days}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="w-40 flex-none">
        <div className="text-eyebrow font-semibold tracking-widest text-fg-muted uppercase">
          Current DSO
        </div>
        <div className="tnum mt-1.5 text-metric font-bold tracking-tight text-fg">
          {current === undefined ? "—" : formatDays(current.days)}
        </div>
        <div className={cn("mt-1.5 text-prose font-semibold", TREND_CLASSES[trend.tone])}>
          {trend.label}
        </div>
      </div>

      <div className="flex-1" aria-hidden="true">
        <div className="flex h-26 items-end gap-5 border-b border-hairline pb-2">
          {series.map((point, index) => (
            <div
              key={point.month}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
            >
              <div
                className={cn(
                  "tnum text-eyebrow font-semibold",
                  index === lastIndex ? "text-accent" : "text-fg-muted",
                )}
              >
                {point.days}
              </div>
              <div
                className={cn(
                  "w-full max-w-8 flex-none rounded-t",
                  index === lastIndex ? "bg-accent-line" : "bg-stroke",
                )}
                style={{ height: `${heights[index] ?? 0}px` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-5">
          {series.map((point) => (
            <div key={point.month} className="flex-1 text-center text-eyebrow text-fg-muted">
              {formatMonthShort(point.month)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
