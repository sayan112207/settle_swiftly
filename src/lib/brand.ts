/**
 * The product's name in one place, so a rename is one edit rather than a
 * grep across every page title, heading and email subject.
 */

/** Used in prose: page titles, headings, transactional copy. */
export const PRODUCT_NAME = "Settle Swiftly";

/**
 * Used as the logo lockup in the header and footer.
 *
 * Identical to PRODUCT_NAME today, and deliberately separate: the wordmark is
 * a visual treatment that can be restyled or abbreviated without changing how
 * the product is referred to in sentences.
 */
export const WORDMARK = "Settle Swiftly";

/** Canonical origin; every absolute URL in page metadata is built from it. */
export const SITE_URL = "https://settleswiftly.com";

/** Browser chrome colour (address bar, manifest): the logo's green. */
export const THEME_COLOR = "#087A52";

/** Social preview image: absolute, because crawlers do not resolve relative URLs. */
export const OG_IMAGE_URL = `${SITE_URL}/og-image.png`;
export const OG_IMAGE_ALT = `${PRODUCT_NAME} — send the invoice, we chase the payment`;
