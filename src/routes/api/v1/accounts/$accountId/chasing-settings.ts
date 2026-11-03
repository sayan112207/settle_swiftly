import { createFileRoute } from "@tanstack/react-router";

import { handleApi, json, readJsonBody, requireIfMatch } from "@/lib/services/api.server";
import { requireId, updateChasingSettings } from "@/lib/services/accounts-api.server";

/** `PATCH /api/v1/accounts/{id}/chasing-settings` — admins only. Returns the account. */
export const Route = createFileRoute("/api/v1/accounts/$accountId/chasing-settings")({
  server: {
    handlers: {
      PATCH: ({ request, params }) =>
        handleApi(
          { code: "save_failed", message: "Couldn't save that change. Please try again." },
          async () => {
            const id = requireId(params.accountId);
            const ifMatch = requireIfMatch(request);
            return json(await updateChasingSettings(id, await readJsonBody(request), ifMatch));
          },
        ),
    },
  },
});
