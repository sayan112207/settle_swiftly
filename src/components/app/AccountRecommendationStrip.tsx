import { useRouter } from "@tanstack/react-router";
import { Clock } from "lucide-react";

import { AppButton } from "@/components/app/AppButton";
import type { AccountRecommendation } from "@/lib/schemas/accounts";

type AccountRecommendationStripProps = {
  recommendation: AccountRecommendation | null;
};

/**
 * Backend-composed action strip between aging and tabs. Renders the three
 * recommendation fields verbatim; when `null`, nothing mounts.
 */
export function AccountRecommendationStrip({ recommendation }: AccountRecommendationStripProps) {
  const router = useRouter();
  if (recommendation === null) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-hairline bg-card px-4 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Clock className="size-4 shrink-0 text-fg-muted" aria-hidden="true" focusable="false" />
        <p className="text-body font-semibold text-fg">{recommendation.sentence}</p>
      </div>
      <AppButton
        variant="secondary"
        className="shrink-0"
        onClick={() => {
          // Router rather than window.location: the href often points at the
          // page already open with different search, and a full document load
          // to reach it throws away the app and every cached query to land
          // where a search-param change would have done.
          //
          // Split first. `to` is a path, not a URL — handed the whole
          // `/app/accounts/{id}?tab=contacts&add=P0` it keeps the query as part
          // of the path and appends its own, producing a second `?` and a route
          // that matches nothing.
          const url = new URL(recommendation.action_href, window.location.origin);
          void router.navigate({
            to: url.pathname,
            search: Object.fromEntries(url.searchParams) as never,
          });
        }}
      >
        {recommendation.action_label}
      </AppButton>
    </div>
  );
}
