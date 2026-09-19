import { createFileRoute } from "@tanstack/react-router";

import { handleApi, json, readJsonBody, requireIfMatch } from "@/lib/services/api.server";
import { buildAccountContacts, createContact, requireId } from "@/lib/services/accounts-api.server";

/** `GET` the contact ladder, or `POST` a new contact. Mutations need `If-Match`. */
export const Route = createFileRoute("/api/v1/accounts/$accountId/contacts/")({
  server: {
    handlers: {
      GET: ({ params }) =>
        handleApi(
          { code: "load_failed", message: "Couldn't load this account. Please try again." },
          async () => {
            return json(await buildAccountContacts(requireId(params.accountId)));
          },
        ),
      POST: ({ request, params }) =>
        handleApi(
          { code: "save_failed", message: "Couldn't save that change. Please try again." },
          async () => {
            const id = requireId(params.accountId);
            const ifMatch = requireIfMatch(request);
            return json(await createContact(id, await readJsonBody(request), ifMatch));
          },
        ),
    },
  },
});
