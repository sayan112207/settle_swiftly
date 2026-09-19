import { createFileRoute } from "@tanstack/react-router";

import { ApiError, handleApi, json } from "@/lib/services/api.server";
import { buildChaseQueue, chaseQueueLimitSchema } from "@/lib/services/dashboard-api.server";

/** `GET /api/v1/dashboard/chase-queue?limit=6` — ranked chaseable invoices. See docs/api-contract.md §3. */
export const Route = createFileRoute("/api/v1/dashboard/chase-queue")({
  server: {
    handlers: {
      GET: ({ request }) =>
        handleApi(
          { code: "queue_unavailable", message: "Couldn't load the chase queue." },
          async () => {
            const raw = new URL(request.url).searchParams.get("limit") ?? undefined;
            const limit = chaseQueueLimitSchema.safeParse(raw);
            if (!limit.success) {
              throw new ApiError(422, "invalid_limit", "Show between 1 and 50 invoices.");
            }
            return json(await buildChaseQueue(limit.data));
          },
        ),
    },
  },
});
