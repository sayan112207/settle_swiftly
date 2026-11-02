import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useId, useState, type ReactNode } from "react";

import { AppButton } from "@/components/app/AppButton";
import { phraseMatches } from "@/lib/services/confirm-phrase";

/**
 * A confirmation that cannot be clicked through. The person types a phrase —
 * usually the account's name — before the confirm button enables.
 *
 * Used where an action can't be quietly undone: sending a matter to an
 * advocate, and offering a settlement above the approval threshold. A bare
 * "Are you sure?" gets dismissed on reflex; typing the name forces a read.
 */
type TypeToConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** The consequences, in plain sentences. */
  children: ReactNode;
  /** What must be typed, compared case-insensitively. */
  phrase: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
};

/** A modal whose confirm button enables only once `phrase` has been typed. */
export function TypeToConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  phrase,
  confirmLabel,
  busy = false,
  onConfirm,
}: TypeToConfirmDialogProps) {
  const inputId = useId();
  const [typed, setTyped] = useState("");
  const matches = phraseMatches(typed, phrase);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        // A reopened dialog starts empty: a phrase typed for one confirmation
        // must not pre-authorise the next.
        if (!next) setTyped("");
        onOpenChange(next);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-fg/35" />
        <DialogPrimitive.Content className="app-theme app-shell fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-card bg-card p-6 shadow-overlay">
          <DialogPrimitive.Title className="text-section font-bold tracking-tight text-fg">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description asChild>
            <div className="mt-3 space-y-2 text-body font-normal text-fg">{children}</div>
          </DialogPrimitive.Description>
          <label htmlFor={inputId} className="mt-5 block text-prose text-fg-soft">
            Type <strong className="font-semibold text-fg">{phrase}</strong> to confirm
          </label>
          <input
            id={inputId}
            type="text"
            autoComplete="off"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            className="field mt-2"
          />
          <div className="mt-6 flex justify-end gap-2">
            <DialogPrimitive.Close asChild>
              <AppButton variant="secondary">Cancel</AppButton>
            </DialogPrimitive.Close>
            <AppButton disabled={!matches} loading={busy} onClick={onConfirm}>
              {confirmLabel}
            </AppButton>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
