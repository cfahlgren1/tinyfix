import type { Fix } from "tinyfix";

export type Segment = { key: string; text: string; fix?: undefined } | { key: string; text: string; fix: Fix };

/**
 * Splits the text into plain runs and fixed words, for drawing both lines from one pass. A fix that no longer matches
 * the text, because it was edited since the check, is left out until the next check comes back.
 */
export function segments(text: string, fixes: readonly Fix[]): Segment[] {
  const parts: Segment[] = [];
  let at = 0;
  for (const fix of fixes) {
    if (fix.from < at || text.slice(fix.from, fix.to) !== fix.original) continue;
    if (fix.from > at) parts.push({ key: `text-${at}`, text: text.slice(at, fix.from) });
    parts.push({ key: `fix-${fix.from}-${fix.original}-${fix.replacement}`, text: fix.original, fix });
    at = fix.to;
  }
  if (at < text.length) parts.push({ key: `text-${at}`, text: text.slice(at) });
  return parts;
}

/**
 * How much of the text is finished words. The word still being typed is left out, so "recie" isn't fixed to something
 * else before the person gets to the end of "recieve".
 */
export function finishedLength(text: string): number {
  if (/[\s.,!?;:)"”]$/.test(text)) return text.length;
  return text.search(/\S*$/);
}
