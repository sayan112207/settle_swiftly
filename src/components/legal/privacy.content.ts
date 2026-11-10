import { COMPANY } from "./company";
import type { LegalDoc } from "./types";

/** Privacy Policy text, written to follow the DPDP Act 2023. A first draft for legal review. */
export const PRIVACY: LegalDoc = {
  title: "Privacy Policy",
  summary:
    "What personal data Settle Swiftly collects, why, who helps us handle it, and the choices you have.",
  sections: [
    {
      id: "who",
      heading: "Who we are",
      paragraphs: [
        `${COMPANY.legalName}, of ${COMPANY.address}, runs Settle Swiftly. For the personal data described here, we decide why and how it is used (what the Digital Personal Data Protection Act, 2023 calls a "Data Fiduciary").`,
      ],
    },
    {
      id: "collect",
      heading: "What we collect",
      items: [
        "Account details: your email address and name.",
        "Business and invoice data you enter or import: your business details, invoices, amounts, due dates and payment records.",
        "Client contact details you add: the names, emails and phone numbers of the people you bill.",
        "Waitlist details: the email address and company name you give on the early-access form.",
        "Basic technical logs: for example IP address, browser type, and the time and result of requests, kept to run and secure the service.",
      ],
    },
    {
      id: "why",
      heading: "Why we use it, and our lawful basis",
      paragraphs: ["We use personal data to:"],
      items: [
        "create and run your account and deliver the service you asked for (service delivery);",
        "send messages you approve to your clients, and transactional emails to you (service delivery);",
        "write to you about your place on the waitlist (your consent);",
        "keep the service secure and fix problems (service delivery).",
      ],
      after: [
        "We rely on your consent and on what is needed to deliver the service. You can withdraw consent at any time; it will not affect what was done before. If you add your clients' details, you must have a proper basis to share them with us.",
      ],
    },
    {
      id: "processors",
      heading: "Who helps us handle your data",
      paragraphs: [
        "We use these providers to run Settle Swiftly. They process data on our behalf:",
      ],
      items: [
        "Supabase: our database and sign-in.",
        "Cloudflare: hosting.",
        "Our email provider: transactional email.",
        "Google: only if you choose to sign in with Google.",
        "A payment gateway: to be confirmed. We do not store card data ourselves.",
      ],
      after: ["We will update this list when it changes."],
    },
    {
      id: "retention",
      heading: "How long we keep it",
      paragraphs: [
        "We keep your data while your account is open and for as long as needed to provide the service, meet legal duties and settle disputes. You can ask us to delete your data at any time, and we will do so unless the law requires us to keep some of it.",
      ],
    },
    {
      id: "rights",
      heading: "Your rights",
      items: [
        "Access: ask for a summary of the personal data we hold about you.",
        "Correction: ask us to fix data that is wrong or incomplete.",
        "Erasure: ask us to delete your data.",
        "Grievance: complain to us, and if you are not satisfied, to the Data Protection Board of India.",
      ],
      after: [`To use any of these rights, write to ${COMPANY.contactEmail}.`],
    },
    {
      id: "security",
      heading: "Security",
      paragraphs: [
        "We use reasonable technical and organisational measures to protect your data, such as encrypted connections and access controls. No system is perfectly secure, so we cannot promise absolute protection.",
      ],
    },
    {
      id: "no-sale",
      heading: "We do not sell your data",
      paragraphs: ["We do not sell your personal data, and we do not share it for advertising."],
    },
    {
      id: "cookies",
      heading: "Cookies",
      paragraphs: [
        "We use only essential cookies and similar storage, which keep you signed in and the site working. We do not use advertising or tracking cookies.",
      ],
    },
    {
      id: "children",
      heading: "Children",
      paragraphs: [
        "Settle Swiftly is for businesses and is not aimed at children. We do not knowingly collect data from anyone under 18.",
      ],
    },
    {
      id: "grievance",
      heading: "Grievance Officer",
      paragraphs: [
        `Name: ${COMPANY.grievanceOfficerName}`,
        `Email: ${COMPANY.grievanceEmail}`,
        `Address: ${COMPANY.address}`,
      ],
    },
    {
      id: "changes",
      heading: "Changes to this policy",
      paragraphs: [
        "We may update this policy. We will tell you about material changes before they take effect.",
      ],
    },
  ],
};
