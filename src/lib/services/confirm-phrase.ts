/**
 * Whether what someone typed matches the phrase a confirmation asks for.
 *
 * Case and surrounding whitespace are forgiven, and runs of inner whitespace
 * collapse, so "kaveri  &  sons " confirms "Kaveri & Sons". Nothing else is:
 * the point of typing the name is that it has been read. An empty or
 * whitespace-only expected phrase never matches.
 */
export function phraseMatches(typed: string, phrase: string): boolean {
  const normalise = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  const expected = normalise(phrase);
  return expected.length > 0 && normalise(typed) === expected;
}
