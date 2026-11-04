// Quote snapping: LLMs often "quote" a student's sentence in an already-corrected form
// ("many of us were confused" for "many of us was confused"). We locate the most similar
// span of the student's actual response and show THAT, so feedback always cites the
// student's own words. Exact-match grounding is still reported separately.

import { alignWords, normalizeWords } from "./accuracy";

interface Token {
  norm: string;
  start: number;
  end: number;
}

/** Word tokens with character offsets into the original text. */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const re = /[A-Za-z0-9'’]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const norm = normalizeWords(m[0])[0];
    if (norm) out.push({ norm, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

export interface SnapResult {
  /** Exact original text from the response (or the input quote if nothing similar enough). */
  text: string;
  /** Word-level similarity 0–1 of the best window. */
  similarity: number;
  /** True if the quote already matched exactly. */
  exact: boolean;
  found: boolean;
  /** Character span in the response (−1 if not found). */
  start: number;
  end: number;
}

/**
 * A window can spill over a sentence boundary ("… students face. Also"). Drop a dangling
 * piece of ≤ 2 words at either end so quotes read as clean phrases.
 */
function trimToSentence(text: string, start: number): { text: string; start: number } {
  const parts = text.split(/(?<=[.!?])\s+/);
  if (parts.length < 2) return { text, start };
  let first = 0;
  let last = parts.length - 1;
  if (parts[last].split(/\s+/).length <= 2) last--;
  if (first < last && parts[first].split(/\s+/).length <= 2) first++;
  const kept = parts.slice(first, last + 1).join(" ");
  const offset = text.indexOf(parts[first]);
  return { text: kept, start: start + Math.max(offset, 0) };
}

/**
 * Find the span of `response` most similar to `quote` (word-level edit distance over
 * windows of similar length). Accept if similarity ≥ `threshold`.
 */
export function snapQuote(quote: string, response: string, threshold = 0.6): SnapResult {
  const q = normalizeWords(quote);
  const toks = tokenize(response);
  const none = (similarity: number): SnapResult => ({ text: quote, similarity, exact: false, found: false, start: -1, end: -1 });
  if (q.length === 0 || toks.length === 0) return none(0);

  let best = { sim: 0, i: 0, len: 0 };
  const minLen = Math.max(1, q.length - 2);
  const maxLen = Math.min(toks.length, q.length + 2);
  for (let len = minLen; len <= maxLen; len++) {
    for (let i = 0; i + len <= toks.length; i++) {
      const window = toks.slice(i, i + len).map((t) => t.norm);
      const errors = alignWords(q, window).filter((o) => o.op !== "ok").length;
      const sim = 1 - errors / Math.max(q.length, len);
      if (sim > best.sim) best = { sim, i, len };
      if (sim === 1) break;
    }
    if (best.sim === 1) break;
  }
  if (best.sim < threshold) return none(best.sim);
  const raw = response.slice(toks[best.i].start, toks[best.i + best.len - 1].end);
  const t = trimToSentence(raw, toks[best.i].start);
  return { text: t.text, similarity: best.sim, exact: best.sim === 1, found: true, start: t.start, end: t.start + t.text.length };
}
