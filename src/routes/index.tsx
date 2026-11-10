import { createFileRoute } from "@tanstack/react-router";

import homeCss from "@/components/home/home.css?url";
import { FAQS } from "@/components/home/content";
import { HomePage, LOADER_SEEN_KEY } from "@/components/home/HomePage";
import { OG_IMAGE_ALT, OG_IMAGE_URL, SITE_URL } from "@/lib/brand";

const TITLE = "Settle Swiftly · Stop waiting to get paid";
const DESCRIPTION =
  "Collections software for businesses that sell on credit. Being built now. Enterprise teams first.";
const OG_DESCRIPTION =
  "Settle Swiftly chases your overdue invoices and stops the moment the money lands. You approve every message.";
/** The home page's night green, for the browser chrome while it is open. */
const NIGHT = "#06120E";

const FONTS =
  "https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@700;800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&family=Source+Serif+4:opsz,wght@8..60,600&display=swap";

/**
 * Runs before first paint: a visitor who has already seen the loader this
 * session never gets a flash of it.
 */
const LOADER_SEEN_SCRIPT = `try{if(sessionStorage.getItem(${JSON.stringify(LOADER_SEEN_KEY)}))document.documentElement.setAttribute("data-ss-seen","")}catch(e){}`;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "theme-color", content: NIGHT },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: OG_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/` },
      { property: "og:image", content: OG_IMAGE_URL },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: OG_IMAGE_ALT },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: OG_DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE_URL },
      { name: "twitter:image:alt", content: OG_IMAGE_ALT },
    ],
    links: [
      { rel: "canonical", href: `${SITE_URL}/` },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: FONTS },
      { rel: "stylesheet", href: homeCss },
    ],
    scripts: [{ children: LOADER_SEEN_SCRIPT }],
  }),
  component: Landing,
});

/** Structured data (Organization, FAQPage) for search engines. */
const jsonLd = () => [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Settle Swiftly",
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/icon-512.png`,
    description: DESCRIPTION,
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  },
];

/** The marketing home page (Home v6) plus its structured data. */
function Landing() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()) }}
      />
      <HomePage />
    </>
  );
}
