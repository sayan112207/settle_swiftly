import { createFileRoute } from "@tanstack/react-router";

import homeCss from "@/components/home/home.css?url";
import { LegalLayout } from "@/components/legal/LegalLayout";
import { TERMS } from "@/components/legal/terms.content";
import { SITE_URL } from "@/lib/brand";

const TITLE = "Terms of Service · Settle Swiftly";
const DESCRIPTION =
  "The terms for using Settle Swiftly, invoice tracking and payment follow-ups for Indian MSMEs.";

const FONTS =
  "https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@700;800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&family=Source+Serif+4:opsz,wght@8..60,600&display=swap";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "theme-color", content: "#06120E" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/terms` },
    ],
    links: [
      { rel: "canonical", href: `${SITE_URL}/terms` },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: FONTS },
      { rel: "stylesheet", href: homeCss },
    ],
  }),
  component: Page,
});

/** The Terms of Service page. */
function Page() {
  return <LegalLayout doc={TERMS} />;
}
