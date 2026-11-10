import type { ReactNode } from "react";

/** The ledger-lines-and-tick mark. `drawTick` lets the tick redraw on hover (nav logo). */
export function LogoMark({ size = 28, drawTick = false }: { size?: number; drawTick?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <path d="M6 6H38M6 14H30M6 22H36M6 30H26" fill="none" stroke="currentColor" strokeWidth="3" />
      <path
        className={drawTick ? "nt" : undefined}
        data-a={drawTick ? "N1" : undefined}
        data-in={drawTick ? "" : undefined}
        pathLength={1}
        d="M6 37L10 43L23 33.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinejoin="miter"
        strokeMiterlimit="10"
      />
    </svg>
  );
}

/** The two-word serif wordmark beside the logo mark. */
export function Wordmark() {
  return (
    <span className="wm">
      <span>Settle</span>
      <span>Swiftly</span>
    </span>
  );
}

/** The brand tick, used inline before text (plan features, chips). */
export function Tick() {
  return (
    <svg className="tk" viewBox="3 30 23 16" aria-hidden="true">
      <path d="M6 37L10 43L23 33.5" />
    </svg>
  );
}

/** The pointer that "clicks" Approve in the hero and the approval split. */
export function CursorArrow({
  className,
  ...rest
}: { className: string } & Record<string, unknown>) {
  return (
    <svg className={className} viewBox="0 0 20 24" {...rest}>
      <path d="M2 1.5L2 18.5L6.6 14.3L9.6 21.2L12.4 20L9.5 13.3L15.6 13.1Z" />
    </svg>
  );
}

/**
 * The rough-ink SVG filter stamps use. Rendered once per page (and once inside
 * each feature scene, under its own id) so the stamp texture has something to
 * reference.
 */
export function InkFilter({ id }: { id: string }) {
  return (
    <svg className="sr" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <filter id={id} x="-4%" y="-4%" width="108%" height="108%" colorInterpolationFilters="sRGB">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves={2}
            seed={11}
            result="n"
          />
          <feColorMatrix
            in="n"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.2 2.45"
            result="m"
          />
          <feComposite in="SourceGraphic" in2="m" operator="in" result="ink" />
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.05"
            numOctaves={2}
            seed={4}
            result="w"
          />
          <feDisplacementMap
            in="ink"
            in2="w"
            scale={2.2}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}

/**
 * A rubber stamp: double border, a big word and a mono date line.
 * `wide` is the 240-wide "ON THE LIST" variant; the default is the 200-wide PAID.
 */
export function StampSvg({
  word,
  date,
  filter,
  wide = false,
}: {
  word: string;
  date: ReactNode;
  filter: string;
  wide?: boolean;
}) {
  const w = wide ? 240 : 200;
  return (
    <svg className="stamp" viewBox={`0 0 ${w} 104`} aria-hidden="true">
      <g filter={`url(#${filter})`}>
        <rect
          x="3"
          y="3"
          width={w - 6}
          height="98"
          rx="4"
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
        />
        <rect
          x="11"
          y="11"
          width={w - 22}
          height="82"
          rx="2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <text className={wide ? "stw sm" : "stw"} x={w / 2} y={wide ? 56 : 60} textAnchor="middle">
          {word}
        </text>
        <text className="std" x={w / 2} y={wide ? 80 : 81} textAnchor="middle">
          {date}
        </text>
      </g>
    </svg>
  );
}
