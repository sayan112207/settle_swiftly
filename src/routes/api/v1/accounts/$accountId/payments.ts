import { createFileRoute } from "@tanstack/react-router";

import { handleApi, json } from "@/lib/services/api.server";
import { buildAccountPayments, requireId } from "@/lib/services/accounts-api.server";

/** `GET /api/v1/accounts/{id}/payments` — payments, allocations and stats. */
export const Route = createFileRoute("/api/v1/accounts/$accountId/payments")({
  server: {
    handlers: {
      GET: ({ params }) =>
        handleApi(
          { code: "load_failed", message: "Couldn't load this account. Please try again." },
          async () => {
            return json(await buildAccountPayments(requireId(params.accountId)));
          },
        ),
    },
  },
});
