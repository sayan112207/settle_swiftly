import type { ContactLanguage } from "@/lib/schemas/accounts";

/**
 * The eight languages a reminder can go out in (accounts-spec §Contact card).
 *
 * Shared rather than duplicated: the contact card and the add-contact form both
 * render this list, and a language that appears in one but not the other is a
 * contact you can create but not edit back.
 */
export const CONTACT_LANGUAGES: { value: ContactLanguage; label: string }[] = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
  { value: "mr", label: "Marathi" },
  { value: "gu", label: "Gujarati" },
  { value: "bn", label: "Bengali" },
  { value: "kn", label: "Kannada" },
];
