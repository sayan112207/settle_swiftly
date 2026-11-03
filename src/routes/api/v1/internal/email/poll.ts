import { createFileRoute } from "@tanstack/react-router";

import { ingestEmailActivity } from "@/lib/services/email-ingest.server";
import { handleApi, json } from "@/lib/services/api.server";
import { requireCronSecret } from "@/lib/services/internal-auth.server";

/**
 * `POST /api/v1/internal/email/poll` — pulls delivery events from the provider
 * and applies them to contacts. Called by the `email-poll` cron job every 15
 * minutes; see `supabase/migrations/20261101120000_cron_jobs.sql`.
 *
 * Safe to call by hand, twice, or overlapping with the cron: the ingester
 * re-reads an overlapping window and the database discards the repeats.
 */
export const Route = createFileRoute("/api/v1/internal/email/poll")({
  server: {
    handlers: {
      POST: ({ request }) =>
        handleApi(
          { code: "ingest_failed", message: "The delivery-event ingest failed." },
          async () => {
            await requireCronSecret(request);
            return json(await ingestEmailActivity());
          },
        ),
    },
  },
});
