import { createFileRoute } from "@tanstack/react-router";

import { handleApi, json } from "@/lib/services/api.server";
import { buildAccountDetail, requireId } from "@/lib/services/accounts-api.server";

/** `GET /api/v1/accounts/{id}` — header, aging, chase status and settings. */
export const Route = createFileRoute("/api/v1/accounts/$accountId/")({
  server: {
    handlers: {
      GET: ({ params }) =>
        handleApi(
          { code: "load_failed", message: "Couldn't load this account. Please try again." },
          async () => {
            return json(await buildAccountDetail(requireId(params.accountId)));
          },
        ),
    },
  },
});
