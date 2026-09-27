import { XCircle } from "lucide-react";

interface ComingSoonNotificationProps {
  message: string;
  variant?: "inline" | "toast" | "badge";
  dismissible?: boolean;
  onDismiss?: () => void;
}

/** Placeholder notification for unimplemented features. Supports three variants: badge (minimal label), toast (warning box with dismiss), and inline (default card style). */
export function ComingSoonNotification({
  message,
  variant = "inline",
  dismissible = false,
  onDismiss,
}: ComingSoonNotificationProps) {
  if (variant === "badge") {
    return (
      <span className="inline-flex items-center gap-1 text-eyebrow font-semibold text-fg-muted uppercase tracking-[0.08em]">
        Coming soon
      </span>
    );
  }

  if (variant === "toast") {
    return (
      <div className="flex items-center gap-3 rounded-card border border-warn-edge bg-warn-tint px-4 py-3">
        <XCircle className="w-5 h-5 text-warn flex-shrink-0" />
        <p className="text-prose font-semibold text-warn flex-1">{message}</p>
        {dismissible && (
          <button
            onClick={onDismiss}
            className="text-warn hover:text-warn-hover flex-shrink-0"
            aria-label="Dismiss"
          >
            ✕
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-3 rounded-card border border-warn-edge bg-warn-tint">
      <XCircle className="w-5 h-5 text-warn flex-shrink-0" />
      <p className="text-prose font-semibold text-warn">{message}</p>
    </div>
  );
}
