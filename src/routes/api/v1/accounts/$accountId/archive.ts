import { createFileRoute } from "@tanstack/react-router";

import { handleApi, json, readJsonBody, requireIfMatch } from "@/lib/services/api.server";
import { archiveAccount, requireId } from "@/lib/services/accounts-api.server";

/** `POST /api/v1/accounts/{id}/archive` — admins only; re-checks the typed name. */
export const Route = createFileRoute("/api/v1/accounts/$accountId/archive")({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handleApi(
          { code: "save_failed", message: "Couldn't save that change. Please try again." },
          async () => {
            const id = requireId(params.accountId);
            const ifMatch = requireIfMatch(request);
            return json(await archiveAccount(id, await readJsonBody(request), ifMatch));
          },
        ),
    },
  },
});
