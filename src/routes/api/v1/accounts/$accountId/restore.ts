import { createFileRoute } from "@tanstack/react-router";

import { handleApi, json, requireIfMatch } from "@/lib/services/api.server";
import { requireId, restoreAccount } from "@/lib/services/accounts-api.server";

/** `POST /api/v1/accounts/{id}/restore` — admins only; un-archives the account. */
export const Route = createFileRoute("/api/v1/accounts/$accountId/restore")({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handleApi(
          { code: "save_failed", message: "Couldn't save that change. Please try again." },
          async () => {
            const id = requireId(params.accountId);
            return json(await restoreAccount(id, requireIfMatch(request)));
          },
        ),
    },
  },
});
