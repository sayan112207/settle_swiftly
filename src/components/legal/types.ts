/** One block of a legal page: a heading, then paragraphs and/or a bulleted list. */
export type LegalSection = {
  /** Anchor id, also used as the heading id. */
  id: string;
  heading: string;
  paragraphs?: string[];
  items?: string[];
  /** Paragraphs shown after the list. */
  after?: string[];
};

/** A whole legal page as data, so the text lives apart from the layout. */
export type LegalDoc = {
  title: string;
  /** One line under the title. */
  summary: string;
  sections: LegalSection[];
};
