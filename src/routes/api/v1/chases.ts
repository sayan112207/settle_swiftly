import { createFileRoute } from "@tanstack/react-router";

import { ApiError, handleApi, json } from "@/lib/services/api.server";
import { chaseRequestBodySchema, requestChases } from "@/lib/services/dashboard-api.server";

/**
 * `POST /api/v1/chases` — queues chases for the given invoices after
 * re-checking each one server side. 202: recorded, not yet sent.
 */
export const Route = createFileRoute("/api/v1/chases")({
  server: {
    handlers: {
      POST: ({ request }) =>
        handleApi(
          { code: "chase_failed", message: "Couldn't queue these chases. Please try again." },
          async () => {
            const body: unknown = await request.json().catch(() => undefined);
            const parsed = chaseRequestBodySchema.safeParse(body);
            if (!parsed.success) {
              throw new ApiError(422, "invalid_request", "Pick at least one invoice to chase.");
            }
            return json(await requestChases(parsed.data.invoice_ids), 202);
          },
        ),
    },
  },
});
