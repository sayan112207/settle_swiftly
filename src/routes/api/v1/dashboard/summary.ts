import { createFileRoute } from "@tanstack/react-router";

import { handleApi, json } from "@/lib/services/api.server";
import { buildSummary } from "@/lib/services/dashboard-api.server";

/** `GET /api/v1/dashboard/summary` — tiles, aging and attention counts. See docs/api-contract.md §3. */
export const Route = createFileRoute("/api/v1/dashboard/summary")({
  server: {
    handlers: {
      GET: () =>
        handleApi(
          { code: "aggregates_unavailable", message: "Couldn't load your totals." },
          async () => json(await buildSummary()),
        ),
    },
  },
});
