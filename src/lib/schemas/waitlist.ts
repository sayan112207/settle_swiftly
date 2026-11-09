import { z } from "zod";

/**
 * Early-access signup from the marketing site.
 *
 * Mirrors the database's own caps on `public.waitlist` (email ≤ 254, source ≤ 64)
 * so a bad value is turned away with a message rather than a constraint error.
 */
export const joinWaitlistSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter a work email, like name@company.com")
    .max(254, "That email is too long.")
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "Enter a work email, like name@company.com"),
  /** Which form it came from, e.g. "home-hero". */
  source: z.string().trim().max(64).optional(),
});

export type JoinWaitlistInput = z.infer<typeof joinWaitlistSchema>;
