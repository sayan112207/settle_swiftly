import { createFileRoute } from "@tanstack/react-router";

import { handleApi, json } from "@/lib/services/api.server";
import { buildAccountsList, parseAccountsListQuery } from "@/lib/services/accounts-api.server";

/** `GET /api/v1/accounts` — the accounts list with filters, sort and org totals. */
export const Route = createFileRoute("/api/v1/accounts/")({
  server: {
    handlers: {
      GET: ({ request }) =>
        handleApi(
          { code: "accounts_unavailable", message: "Couldn't load your accounts." },
          async () => {
            const query = parseAccountsListQuery(new URL(request.url));
            return json(await buildAccountsList(query));
          },
        ),
    },
  },
});
