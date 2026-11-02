import { createFileRoute } from "@tanstack/react-router";

import { ApiError, handleApi, json } from "@/lib/services/api.server";
import { cancelReminder } from "@/lib/services/outbox-api.server";

/** `POST /api/v1/outbox/reminders/{id}/cancel` — stops one of today's reminders before it sends. */
export const Route = createFileRoute("/api/v1/outbox/reminders/$reminderId/cancel")({
  server: {
    handlers: {
      POST: ({ params }) =>
        handleApi(
          { code: "cancel_failed", message: "Couldn't cancel that reminder. Please try again." },
          async () => {
            if (!(await cancelReminder(params.reminderId))) {
              throw new ApiError(
                409,
                "not_cancellable",
                "That reminder is being sent right now, or has already been sent or cancelled.",
              );
            }
            return json({ cancelled: true });
          },
        ),
    },
  },
});
