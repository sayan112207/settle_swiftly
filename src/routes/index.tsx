import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { CursorGlow } from "@/components/landing/CursorGlow";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { Comparison } from "@/components/landing/Comparison";
import { ThreeSteps } from "@/components/landing/ThreeSteps";
import { ToneSelector } from "@/components/landing/ToneSelector";
import { Channels } from "@/components/landing/Channels";
import { Timeline } from "@/components/landing/Timeline";
import { Metrics } from "@/components/landing/Metrics";
import { ClientScores } from "@/components/landing/ClientScores";
import { Features } from "@/components/landing/Features";
import { Regions } from "@/components/landing/Regions";
import { Testimonials } from "@/components/landing/Testimonials";
import { Pricing } from "@/components/landing/Pricing";
import { Faq, faqs } from "@/components/landing/Faq";
import { FinalCta } from "@/components/landing/FinalCta";
import { Footer } from "@/components/landing/Footer";

const TITLE = "Settle Swiftly — Automated Invoicing & Payment Collection";
const DESCRIPTION =
  "Settle Swiftly sends invoices, automatically follows up with clients, and stops when you're paid. Automate payment reminders across email, WhatsApp and SMS.";
const OG_DESCRIPTION =
  "Send the invoice. We chase the payment. Automated reminders across email, WhatsApp and SMS.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "theme-color", content: "#F7F7F3" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: OG_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/og-image.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: OG_DESCRIPTION },
      { name: "twitter:image", content: "/og-image.png" },
    ],
    links: [{ rel: "canonical", href: "https://settleswiftly.com/" }],
  }),
  component: Landing,
});

/** Structured data (Organization, SoftwareApplication, FAQPage) for search engines. */
const jsonLd = () => [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Settle Swiftly",
    url: "https://settleswiftly.com/",
    description:
      "Automated invoicing and payment collection for freelancers, consultants, agencies and small businesses.",
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Settle Swiftly",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: DESCRIPTION,
    offers: [
      { "@type": "Offer", name: "Free", price: "0", priceCurrency: "INR" },
      { "@type": "Offer", name: "Pro", price: "799", priceCurrency: "INR" },
      { "@type": "Offer", name: "Business", price: "1999", priceCurrency: "INR" },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  },
];

function Landing() {
  const [countsStarted, setCountsStarted] = useState(false);

  return (
    <div className="relative overflow-x-hidden bg-page text-ink">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()) }}
      />
      <CursorGlow />
      <Nav />
      <main id="top">
        <Hero />
        <Comparison />
        <ThreeSteps />
        <ToneSelector />
        <Channels />
        <Timeline />
        <Metrics onEnter={() => setCountsStarted(true)} />
        <ClientScores />
        <Features countsStarted={countsStarted} />
        <Regions />
        <Testimonials />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
