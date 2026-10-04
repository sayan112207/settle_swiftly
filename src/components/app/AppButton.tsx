import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The app's button.
 *
 * Written rather than wrapped, which is the one place this file departs from
 * "reuse `ui/button`". Two concrete blockers, not a preference:
 *
 *   1. The primitive's base carries `[&_svg]:size-4`. That selector is more
 *      specific than a class on the icon itself, so it would force the loading
 *      spinner to 16px when the spec calls for 14px.
 *   2. Its `ghost` variant hard-codes `hover:bg-accent hover:text-accent-foreground`.
 *      Inside `.app-theme`, accent is brand green rather than shadcn's neutral
 *      grey, so every variant would need both hover properties neutralised.
 *
 * Overriding those is more work and more fragile than 40 lines here, which is
 * the escape hatch the UI rules describe. `ui/button` is untouched.
 */

type AppButtonVariant = "primary" | "secondary" | "text" | "destructive";

const VARIANT_CLASSES: Record<AppButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover",
  secondary: "border border-stroke bg-card text-fg hover:bg-hovered",
  // Spec §5's row Chase button: no background, no border, hover shifts the ink.
  text: "rounded-nav px-2 py-1 text-accent hover:text-accent-hover",
  // No `danger-hover` token exists, so this cannot darken on hover the way
  // primary does. Flagged rather than invented — adding a token is a design
  // decision, and the tokens file says not to add one.
  destructive: "bg-danger text-white",
};

type AppButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AppButtonVariant;
  loading?: boolean;
  children: ReactNode;
};

/** The app's button in one of four variants, with a loading state that keeps its width. */
export function AppButton({
  variant = "primary",
  loading = false,
  disabled = false,
  type = "button",
  className,
  children,
  ...props
}: AppButtonProps) {
  return (
    <button
      // Defaulted rather than fixed. The default is still "button", because an
      // unspecified button inside a form submits it — but a form's own submit
      // button has to be able to say so. Pinning this to "button" silently
      // broke the one form that used AppButton to submit: the click did
      // nothing, and nothing anywhere said why.
      type={type}
      // A loading button must not be clickable twice, so the disabled state is
      // derived rather than left to the caller to remember.
      disabled={disabled || loading}
      aria-busy={loading}
      className={cn(
        "relative inline-flex cursor-pointer items-center justify-center gap-2 rounded-pill px-4 py-2 text-body font-semibold transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    >
      {/* The label keeps its box while loading, so the button cannot resize
          mid-action and shift whatever sits next to it. `invisible` rather than
          conditional rendering is what preserves the width. */}
      <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>
        {children}
      </span>
      {loading ? <Spinner /> : null}
    </button>
  );
}

/**
 * 14px exactly — `size-3.5` is 3.5 × 4px, not an arbitrary value.
 *
 * Reduced-motion users get no rotation: the tokens file kills animation inside
 * `.app-shell`. `aria-busy` on the button is what actually conveys the state.
 */
function Spinner() {
  return (
    <svg
      className="absolute size-3.5 animate-spin"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path
        d="M14.5 8A6.5 6.5 0 0 0 8 1.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
