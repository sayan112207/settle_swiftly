import { createFileRoute } from "@tanstack/react-router";

import { handleApi } from "@/lib/services/api.server";
import { dismissAlert } from "@/lib/services/outbox-api.server";

/** `POST /api/v1/outbox/alerts/{id}/dismiss` — the user saw it and chose not to act. */
export const Route = createFileRoute("/api/v1/outbox/alerts/$alertId/dismiss")({
  server: {
    handlers: {
      POST: ({ params }) =>
        handleApi(
          { code: "dismiss_failed", message: "Couldn't dismiss that alert. Please try again." },
          async () => {
            await dismissAlert(params.alertId);
            return new Response(null, { status: 204 });
          },
        ),
    },
  },
});
