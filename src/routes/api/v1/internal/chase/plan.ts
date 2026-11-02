import { createFileRoute } from "@tanstack/react-router";

import { handleApi, json, readOptionalJsonBody, validationError } from "@/lib/services/api.server";
import { planChases, runScopeSchema } from "@/lib/services/chase-scheduler.server";
import { requireCronSecret } from "@/lib/services/internal-auth.server";

/**
 * `POST /api/v1/internal/chase/plan` — writes today's reminder queue and
 * sends nothing. Called at 08:00 IST by the `chase-plan` cron job; see
 * docs/chasing-scheduler-spec.md §8.
 *
 * Answers 500 when any invoice could not be planned, with the run's summary
 * still in the body: the other invoices were planned, and the status is what
 * `net._http_response` shows whoever is checking on the job.
 */
export const Route = createFileRoute("/api/v1/internal/chase/plan")({
  server: {
    handlers: {
      POST: ({ request }) =>
        handleApi(
          { code: "plan_failed", message: "Planning today's reminders failed." },
          async () => {
            await requireCronSecret(request);
            const scope = runScopeSchema.safeParse(await readOptionalJsonBody(request));
            if (!scope.success) throw validationError(scope.error);
            const result = await planChases(new Date(), scope.data);
            return json(result, result.errors.length > 0 ? 500 : 200);
          },
        ),
    },
  },
});
