import { createFileRoute } from "@tanstack/react-router";

import { handleApi, json, readOptionalJsonBody, validationError } from "@/lib/services/api.server";
import { sendChases, runScopeSchema } from "@/lib/services/chase-scheduler.server";
import { requireCronSecret } from "@/lib/services/internal-auth.server";

/**
 * `POST /api/v1/internal/chase/send` — sends what the 8 o'clock plan queued,
 * for accounts whose window is open now. Called hourly from 09:00 to 19:00 IST
 * by the `chase-send` cron job; see docs/chasing-scheduler-spec.md §8.
 *
 * Safe to overlap with itself: each reminder is claimed before it is sent.
 * Answers 500 when any reminder errored, with the summary in the body.
 */
export const Route = createFileRoute("/api/v1/internal/chase/send")({
  server: {
    handlers: {
      POST: ({ request }) =>
        handleApi(
          { code: "send_failed", message: "Sending today's reminders failed." },
          async () => {
            await requireCronSecret(request);
            const scope = runScopeSchema.safeParse(await readOptionalJsonBody(request));
            if (!scope.success) throw validationError(scope.error);
            const result = await sendChases(new Date(), scope.data);
            return json(result, result.errors.length > 0 ? 500 : 200);
          },
        ),
    },
  },
});
