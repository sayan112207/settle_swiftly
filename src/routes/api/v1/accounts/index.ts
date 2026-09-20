import { createFileRoute } from "@tanstack/react-router";

import { handleApi, json, readJsonBody } from "@/lib/services/api.server";
import {
  buildAccountsList,
  ensureAccounts,
  parseAccountsListQuery,
} from "@/lib/services/accounts-api.server";

/**
 * `GET /api/v1/accounts` — the accounts list with filters, sort and org totals.
 * `POST` — resolve a batch of names to accounts, creating the new ones.
 *
 * No `If-Match` on the POST: the per-account mutations guard one row against a
 * concurrent edit, but creating accounts touches no existing row. A teammate
 * adding a different account in the meantime is not a conflict, and one adding
 * the *same* name is resolved by the unique index rather than by a 409.
 */
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
      POST: ({ request }) =>
        handleApi(
          { code: "save_failed", message: "Couldn't add that account. Please try again." },
          async () => {
            return json(await ensureAccounts(await readJsonBody(request)), 201);
          },
        ),
    },
  },
});
