import { createFileRoute } from "@tanstack/react-router";

import { ApiError, handleApi, json } from "@/lib/services/api.server";
import {
  activityLimitSchema,
  buildAccountActivity,
  requireId,
} from "@/lib/services/accounts-api.server";

/** `GET /api/v1/accounts/{id}/activity?limit=` — reverse chronological. */
export const Route = createFileRoute("/api/v1/accounts/$accountId/activity")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        handleApi(
          { code: "load_failed", message: "Couldn't load this account. Please try again." },
          async () => {
            const raw = new URL(request.url).searchParams.get("limit") ?? undefined;
            const limit = activityLimitSchema.safeParse(raw);
            if (!limit.success) {
              throw new ApiError(422, "invalid_limit", "Show between 1 and 200 entries.");
            }
            return json(await buildAccountActivity(requireId(params.accountId), limit.data));
          },
        ),
    },
  },
});
