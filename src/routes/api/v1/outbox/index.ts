import { createFileRoute } from "@tanstack/react-router";

import { handleApi, json } from "@/lib/services/api.server";
import { buildOutbox } from "@/lib/services/outbox-api.server";

/** `GET /api/v1/outbox` — today's queue, the week's sends, open alerts. See docs/chasing-scheduler-spec.md §10. */
export const Route = createFileRoute("/api/v1/outbox/")({
  server: {
    handlers: {
      GET: () =>
        handleApi(
          { code: "outbox_unavailable", message: "Couldn't load the outbox. Please try again." },
          async () => json(await buildOutbox()),
        ),
    },
  },
});
