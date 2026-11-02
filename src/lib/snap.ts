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
}

/**
 * Find the span of `response` most similar to `quote` (word-level edit distance over
 * windows of similar length). Accept if similarity ≥ `threshold`.
 */
export function snapQuote(quote: string, response: string, threshold = 0.6): SnapResult {
  const q = normalizeWords(quote);
  const toks = tokenize(response);
  if (q.length === 0 || toks.length === 0) return { text: quote, similarity: 0, exact: false, found: false };

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
  if (best.sim < threshold) return { text: quote, similarity: best.sim, exact: false, found: false };
  const text = response.slice(toks[best.i].start, toks[best.i + best.len - 1].end);
  return { text, similarity: best.sim, exact: best.sim === 1, found: true };
}
