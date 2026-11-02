import { AppButton } from "@/components/app/AppButton";
import { featureErrorMessage, isFeatureRetryable } from "@/lib/services/feature-api";

/**
 * The failed-load state shared by the Legal, Matters and Commercial terms
 * screens.
 *
 * Two cases look different on purpose. An endpoint that isn't built yet says
 * "coming soon" in muted ink with no button — Retry would only fail again. A
 * real failure states what happened and offers Retry.
 */
export function QueryNotice({
  error,
  fallback,
  onRetry,
}: {
  error: unknown;
  fallback: string;
  onRetry: () => void;
}) {
  const message = featureErrorMessage(error, fallback);
  if (!isFeatureRetryable(error)) {
    return (
      <div className="rounded-card border border-hairline bg-card px-5 py-8 text-center">
        <p className="text-body font-semibold text-fg">{message}</p>
        <p className="mt-1 text-prose text-fg-soft">
          This screen is designed and waiting on its backend.
        </p>
      </div>
    );
  }
  return (
    <div role="alert" className="flex flex-col items-start gap-3 py-10">
      <p className="text-body font-semibold text-fg">{message}</p>
      <AppButton variant="secondary" onClick={onRetry}>
        Retry
      </AppButton>
    </div>
  );
}
