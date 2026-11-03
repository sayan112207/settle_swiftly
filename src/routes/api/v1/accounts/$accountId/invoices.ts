import { createFileRoute } from "@tanstack/react-router";

import { handleApi, json } from "@/lib/services/api.server";
import { buildAccountInvoices, requireId } from "@/lib/services/accounts-api.server";

/** `GET /api/v1/accounts/{id}/invoices` — open invoices grouped by aging bucket. */
export const Route = createFileRoute("/api/v1/accounts/$accountId/invoices")({
  server: {
    handlers: {
      GET: ({ params }) =>
        handleApi(
          { code: "load_failed", message: "Couldn't load this account. Please try again." },
          async () => {
            return json(await buildAccountInvoices(requireId(params.accountId)));
          },
        ),
    },
  },
});
