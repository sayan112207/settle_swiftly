import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The 480px right-hand panel from the system brief: full height, hairline left
 * edge, page behind dimmed. Radix Dialog gives it the modal semantics the
 * brief asks for — focus trapped inside, Escape closes, focus returns to the
 * control that opened it.
 *
 * Radix portals the panel to `<body>`, outside `AppShell`, so the panel
 * re-establishes the shell itself: `app-theme` on the content box (for the
 * green accent) and `app-shell` on an inner wrapper (for the focus outline,
 * tabular numerals and `.field` inputs). The wrapper's background is cleared
 * inline because `.app-shell` sets an unlayered page background that would
 * otherwise beat the panel's own `bg-card`.
 */
type SidePanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Visible heading, and the dialog's accessible name. */
  title: ReactNode;
  /** Under the title; announced as the dialog's description. */
  description?: ReactNode;
  /** Pinned to the bottom, outside the scrolling body. */
  footer?: ReactNode;
  children: ReactNode;
};

/**
 * Clears what `.app-shell` paints so an inner wrapper inherits the panel's
 * own surface. Exported for the other app dialogs that portal to `<body>`.
 */
export const SHELL_RESET = { background: "transparent", color: "inherit" } as const;

/** A right-hand modal panel for inspecting or acting on one record. */
export function SidePanel({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
}: SidePanelProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-fg/30" />
        <DialogPrimitive.Content
          className={cn(
            "app-theme fixed inset-y-0 right-0 z-50 w-full border-l border-hairline bg-card shadow-overlay sm:w-120",
          )}
        >
          <div className="app-shell flex h-full flex-col" style={SHELL_RESET}>
            <header className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-5">
              <div className="min-w-0">
                <DialogPrimitive.Title className="text-section font-bold tracking-tight text-fg">
                  {title}
                </DialogPrimitive.Title>
                {description ? (
                  <DialogPrimitive.Description className="mt-1 text-prose text-fg-soft">
                    {description}
                  </DialogPrimitive.Description>
                ) : (
                  // Radix warns when a dialog has no description; an empty one
                  // would be announced as blank, so mark it explicitly absent.
                  <DialogPrimitive.Description className="sr-only">
                    {title}
                  </DialogPrimitive.Description>
                )}
              </div>
              <DialogPrimitive.Close
                aria-label="Close"
                className="shrink-0 cursor-pointer rounded-nav p-1.5 text-fg-muted transition-colors hover:bg-hovered hover:text-fg"
              >
                <X className="size-4" aria-hidden="true" />
              </DialogPrimitive.Close>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
            {footer ? (
              <footer className="border-t border-hairline bg-subtle px-5 py-4">{footer}</footer>
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
