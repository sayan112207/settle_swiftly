import { createFileRoute } from "@tanstack/react-router";

import { handleApi, json, readJsonBody, requireIfMatch } from "@/lib/services/api.server";
import { pauseAccount, requireId } from "@/lib/services/accounts-api.server";

/** `POST /api/v1/accounts/{id}/pause` — needs a reason; `until` may not be past. */
export const Route = createFileRoute("/api/v1/accounts/$accountId/pause")({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handleApi(
          { code: "save_failed", message: "Couldn't save that change. Please try again." },
          async () => {
            const id = requireId(params.accountId);
            const ifMatch = requireIfMatch(request);
            return json(await pauseAccount(id, await readJsonBody(request), ifMatch));
          },
        ),
    },
  },
});
