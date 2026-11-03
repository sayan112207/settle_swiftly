import { createFileRoute } from "@tanstack/react-router";

import { handleApi, json, readJsonBody, requireIfMatch } from "@/lib/services/api.server";
import { deleteContact, requireId, updateContact } from "@/lib/services/accounts-api.server";

/** `PATCH` or `DELETE` one contact. Both need `If-Match` and return the full ladder. */
export const Route = createFileRoute("/api/v1/accounts/$accountId/contacts/$contactId")({
  server: {
    handlers: {
      PATCH: ({ request, params }) =>
        handleApi(
          { code: "save_failed", message: "Couldn't save that change. Please try again." },
          async () => {
            const id = requireId(params.accountId);
            const contactId = requireId(params.contactId, "contact");
            const ifMatch = requireIfMatch(request);
            return json(await updateContact(id, contactId, await readJsonBody(request), ifMatch));
          },
        ),
      DELETE: ({ request, params }) =>
        handleApi(
          { code: "save_failed", message: "Couldn't save that change. Please try again." },
          async () => {
            const id = requireId(params.accountId);
            const contactId = requireId(params.contactId, "contact");
            return json(await deleteContact(id, contactId, requireIfMatch(request)));
          },
        ),
    },
  },
});
