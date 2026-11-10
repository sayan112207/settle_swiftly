import { COMPANY } from "./company";
import type { LegalDoc } from "./types";

/**
 * The refund numbers in one place. These are placeholder rules, in brackets so
 * they stand out on the page; change them here and the policy follows.
 */
export const REFUND_RULES = {
  /** Days after purchase in which an annual plan can be refunded. */
  annualRefundDays: "[7]",
  /** How long a refund takes to reach the original payment method. */
  refundBusinessDays: "[7–10]",
} as const;

/** Refund Policy text. The rules are placeholders for the business to confirm. */
export const REFUND: LegalDoc = {
  title: "Refund Policy",
  summary: "When you can get your money back, and how long it takes.",
  sections: [
    {
      id: "monthly",
      heading: "Monthly plans",
      paragraphs: [
        "You can cancel a monthly plan at any time. Cancelling stops the next charge. The current billing period is not refunded, and you keep access until it ends.",
      ],
    },
    {
      id: "annual",
      heading: "Annual plans",
      paragraphs: [
        `You can ask for a refund of an annual plan within ${REFUND_RULES.annualRefundDays} days of buying it. After that, annual plans are not refunded, but you keep access until the year ends.`,
      ],
    },
    {
      id: "legal-fee",
      heading: "Legal escalation fee",
      paragraphs: [
        "The per-matter legal escalation fee is not refundable once work on the matter has started. If you cancel before work starts, we refund it in full.",
      ],
    },
    {
      id: "how",
      heading: "How refunds are paid",
      paragraphs: [
        `Refunds go back to the original payment method within ${REFUND_RULES.refundBusinessDays} business days of approval. Your bank may take extra time to show it.`,
      ],
    },
    {
      id: "ask",
      heading: "How to ask",
      paragraphs: [
        `Email ${COMPANY.contactEmail} from your account email with your plan and the date you paid. This policy is part of our Terms of Service.`,
      ],
    },
  ],
};
