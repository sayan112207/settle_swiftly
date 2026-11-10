import { COMPANY } from "./company";
import type { LegalDoc } from "./types";

/** Terms of Service text. A first draft: a lawyer reviews it before release. */
export const TERMS: LegalDoc = {
  title: "Terms of Service",
  summary:
    "The rules for using Settle Swiftly, in plain English. Please read them before you create an account.",
  sections: [
    {
      id: "service",
      heading: "What Settle Swiftly is",
      paragraphs: [
        `Settle Swiftly is a software service run by ${COMPANY.legalName} ("we", "us"), of ${COMPANY.address}. It helps Indian micro, small and medium businesses (MSMEs) track their invoices and follow up on late payments.`,
        "By creating an account or using the service you agree to these terms. If you do not agree, please do not use it.",
      ],
    },
    {
      id: "eligibility",
      heading: "Who can use it",
      items: [
        "You are using Settle Swiftly for a business, not for personal or household use.",
        "You are at least 18 years old.",
        "If you sign up for a company, you have the authority to bind that company to these terms.",
      ],
    },
    {
      id: "account",
      heading: "Your account",
      paragraphs: [
        "You are responsible for your account and for everything done through it. Keep your sign-in details safe, give us accurate information, and tell us quickly if you think someone else has got into your account.",
      ],
    },
    {
      id: "acceptable-use",
      heading: "Acceptable use",
      paragraphs: ["Please do not use Settle Swiftly to:"],
      items: [
        "send messages that are false, threatening, harassing or abusive to anyone, including a customer who owes you money;",
        "chase amounts you know are not owed;",
        "break any law, including laws on data protection, spam and debt recovery;",
        "upload data you have no right to use;",
        "attack, overload, reverse-engineer or try to get around the security of the service.",
      ],
      after: ["We may suspend an account that breaks these rules."],
    },
    {
      id: "your-data",
      heading: "Your data stays yours",
      paragraphs: [
        "The invoices, client details and other information you put into Settle Swiftly belong to you. You give us permission to store and process them only so we can run the service for you, as described in our Privacy Policy.",
        "You are responsible for having the right to share your clients' details with us and to contact them.",
      ],
    },
    {
      id: "not-advice",
      heading: "A tool, not advice",
      paragraphs: [
        "Settle Swiftly is a software tool. It is not a law firm, a chartered accountant or a tax adviser, and nothing in it is legal, tax or financial advice. Calculations such as late-payment interest are estimates to help you; check them before you rely on them.",
      ],
    },
    {
      id: "legal-escalation",
      heading: "Legal escalation features",
      paragraphs: [
        "Some features help you prepare legal steps, for example a notice under section 16 of the MSMED Act, 2006. These are drafting aids only. They do not replace an advocate.",
        "Where an advocate is involved, the advocate is an independent professional who is not our employee and who bills you directly. Decide for yourself, with your advocate, whether and how to send any notice.",
      ],
    },
    {
      id: "availability",
      heading: "Availability",
      paragraphs: [
        "We work to keep Settle Swiftly running, but we do not promise it will always be available or free of errors. We may change, pause or remove features, and we may take the service down for maintenance. There is no uptime guarantee.",
      ],
    },
    {
      id: "liability",
      heading: "Limit of our liability",
      paragraphs: [
        "To the extent the law allows, we are not liable for indirect or consequential loss, lost profit, lost business or lost data. Our total liability to you for any claim about the service is limited to the amount you paid us in the 12 months before the claim arose.",
        "Nothing in these terms limits liability that cannot be limited by law.",
      ],
    },
    {
      id: "termination",
      heading: "Ending your use",
      paragraphs: [
        "You can stop using Settle Swiftly and close your account at any time. We can suspend or end your access if you break these terms or if we have to by law. Refunds on ending are covered by our Refund Policy. After your account closes, we handle your data as set out in our Privacy Policy.",
      ],
    },
    {
      id: "law",
      heading: "Governing law",
      paragraphs: [
        `These terms are governed by the laws of India. The courts at ${COMPANY.jurisdictionCity} have exclusive jurisdiction over any dispute about them.`,
      ],
    },
    {
      id: "changes",
      heading: "Changes to these terms",
      paragraphs: [
        "We may update these terms. When we make a material change we will tell you, for example by email or inside the product, before it takes effect. If you keep using the service after that, you accept the new terms.",
      ],
    },
    {
      id: "contact",
      heading: "Contact",
      paragraphs: [`Questions about these terms: ${COMPANY.contactEmail}.`],
    },
  ],
};
