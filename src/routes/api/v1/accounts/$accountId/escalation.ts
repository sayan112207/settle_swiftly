import { createFileRoute } from "@tanstack/react-router";

import { handleApi, json, readJsonBody, requireIfMatch } from "@/lib/services/api.server";
import { requireId, updateEscalation } from "@/lib/services/accounts-api.server";

/** `PATCH /api/v1/accounts/{id}/escalation` — P1/P2 timing. Returns the ladder. */
export const Route = createFileRoute("/api/v1/accounts/$accountId/escalation")({
  server: {
    handlers: {
      PATCH: ({ request, params }) =>
        handleApi(
          { code: "save_failed", message: "Couldn't save that change. Please try again." },
          async () => {
            const id = requireId(params.accountId);
            const ifMatch = requireIfMatch(request);
            return json(await updateEscalation(id, await readJsonBody(request), ifMatch));
          },
        ),
    },
  },
});
