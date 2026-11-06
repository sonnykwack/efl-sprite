// Clean-up of corrections before the student sees them.
//
// Seen on ES-1 Email 2-A (2026-11-06, 7B + GECToR):
//  - LLM item quoting two sentences ("… after 8 a.m. If it is not possible, could you let us
//    use study room in the") to insert one article → unreadable, generic explanation.
//  - LLM deletions of correct words ("I can't sleep again" → drop "again"; "when I study at
//    night" → drop "at night") — meaning edits, not errors.
//  - Categories that do not match the edit ("again" labelled 전치사; adding "the" labelled
//    품사·어형).
//  - The grammar model's adjacent edits shown separately: "is → has" and "a → been" (one
//    change: "there is a construction" → "there has been construction"), the second
//    explained as an article change.

import { alignWords } from "./accuracy";
import { ARTICLES, PREPOSITIONS, mapGecEdit } from "./gecMap";
import type { ErrorCategory } from "./grammarGuide";
import { tokenize } from "./snap";
import type { GecEdit } from "./types";

export interface Tidied {
  start: number;
  end: number;
  quote: string;
  correction: string;
  category: ErrorCategory;
}

/**
 * Narrow a located LLM correction to the words that actually change (plus one word of context
 * on each side), fix its category when the change is only articles / only prepositions, and
 * reject it (null) when it is a multi-sentence span or — if the grammar model ran — a pure
 * deletion (the grammar model handles real extra words such as "I am disagree").
 */
export function tidyLlmCorrection(
  response: string,
  e: { start: number; end: number; correction: string; category: ErrorCategory },
  opts: { gecRan: boolean },
): Tidied | null {
  if (e.start < 0) return null;
  // Same tokenizer on both sides, so "a.m." splits the same way in quote and correction.
  let toks = tokenize(response.slice(e.start, e.end)).map((t) => ({ ...t, start: t.start + e.start, end: t.end + e.start }));
  const ctoks = tokenize(e.correction);
  if (toks.length === 0 || ctoks.length === 0) return null;
  toks = extendToCorrection(response, toks, ctoks.map((t) => t.norm));
  const qn = toks.map((t) => t.norm);
  const cn = ctoks.map((t) => t.norm);
  let p = 0;
  while (p < qn.length && p < cn.length && qn[p] === cn[p]) p++;
  let s = 0;
  while (s < qn.length - p && s < cn.length - p && qn[qn.length - 1 - s] === cn[cn.length - 1 - s]) s++;
  const deleted = qn.slice(p, qn.length - s);
  const inserted = cn.slice(p, cn.length - s);
  if (deleted.length === 0 && inserted.length === 0) return null; // no change at all
  if (inserted.length === 0 && opts.gecRan) return null;

  // One word of context on each side.
  const qa = Math.max(0, p - 1);
  const qb = Math.min(qn.length, qn.length - s + 1);
  const ca = Math.max(0, p - 1);
  const cb = Math.min(cn.length, cn.length - s + 1);
  const start = toks[qa].start;
  const end = toks[qb - 1].end;
  const quote = response.slice(start, end);
  if (/[.!?]\s/.test(quote)) return null; // still spans a sentence boundary

  // Words that really change, by alignment ("use study room in" → "use the study room in the"
  // changes only two articles, although prefix/suffix trimming keeps the middle).
  const changed = alignWords(deleted, inserted).flatMap((o) => (o.op === "ok" ? [] : o.op === "sub" ? [o.ref, o.hyp] : o.op === "del" ? [o.ref] : [o.hyp]));
  let category = e.category;
  if (changed.every((w) => ARTICLES.has(w))) category = "article";
  else if (changed.every((w) => PREPOSITIONS.has(w))) category = "preposition";
  else if (category === "article" || category === "preposition") category = "word_choice";
  const correction = e.correction.slice(ctoks[ca].start, ctoks[cb - 1].end);
  return { start, end, quote, correction, category };
}

type Tok = ReturnType<typeof tokenize>[number];

/**
 * The snapped quote is sometimes SHORTER than what the correction rewrites (seen 2026-11-06:
 * quote "match", correction "match their interests, and" while the response continues
 * "match their interests, such as …"). Trimming then marks "match" as the error and shows the
 * following words as insertions. Extend the span over the next words of the same sentence by
 * the amount that best aligns with the correction, so the real change ("such" → "and") is
 * what gets underlined. Exported for tests.
 */
export function extendToCorrection(response: string, toks: Tok[], corr: string[]): Tok[] {
  const extra = corr.length - toks.length;
  if (extra <= 0) return toks;
  const last = toks[toks.length - 1];
  const after = tokenize(response.slice(last.end)).map((t) => ({ ...t, start: t.start + last.end, end: t.end + last.end }));
  const next: Tok[] = [];
  let prevEnd = last.end;
  for (const t of after) {
    if (next.length >= extra + 2 || /[.!?]/.test(response.slice(prevEnd, t.start))) break;
    next.push(t);
    prevEnd = t.end;
  }
  const cost = (k: number) =>
    alignWords([...toks, ...next.slice(0, k)].map((t) => t.norm), corr).filter((o) => o.op !== "ok").length;
  let best = 0;
  let bestCost = cost(0);
  for (let k = 1; k <= next.length; k++) {
    const c = cost(k);
    if (c < bestCost) [best, bestCost] = [k, c];
  }
  return best ? [...toks, ...next.slice(0, best)] : toks;
}

/** Category priority when adjacent grammar-model edits are shown as one. */
const PRIORITY: ErrorCategory[] = [
  "verb_form", "agreement", "plural", "word_form", "possessive", "preposition", "article",
  "word_choice", "run_on", "mechanics", "grammar_other",
];

/**
 * Join grammar-model edits on directly adjacent words (only whitespace between them, both
 * replace/transform a word — no pure insertions or deletions): "is" + "a" → "is a" → "has been".
 * The original per-word edits stay available in `parts` for the category decision.
 */
export function joinAdjacentGec(edits: GecEdit[], response: string): (GecEdit & { parts?: GecEdit[] })[] {
  const isReplace = (g: GecEdit) => g.original.trim() !== "" && g.corrected.trim() !== "" && !g.labels.some((l) => l.startsWith("$APPEND_"));
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  const out: (GecEdit & { parts?: GecEdit[] })[] = [];
  for (const g of sorted) {
    const last = out[out.length - 1];
    const lastParts = last?.parts ?? (last ? [last] : []);
    if (
      last &&
      lastParts.length < 3 &&
      isReplace(g) &&
      lastParts.every(isReplace) &&
      /^\s+$/.test(response.slice(last.end, g.start))
    ) {
      out[out.length - 1] = {
        start: last.start,
        end: g.end,
        original: response.slice(last.start, g.end),
        corrected: `${last.corrected.trim()} ${g.corrected.trim()}`,
        labels: [...last.labels, ...g.labels],
        parts: [...lastParts, g],
      };
    } else {
      out.push({ ...g });
    }
  }
  return out;
}

/** Category + reason for a (possibly joined) grammar-model edit. */
export function mapJoinedGec(g: GecEdit & { parts?: GecEdit[] }, response: string): { category: ErrorCategory; why: string } {
  if (!g.parts) return mapGecEdit(g, response);
  const cats = g.parts.map((p) => mapGecEdit(p, response).category);
  const category = PRIORITY.find((c) => cats.includes(c)) ?? cats[0];
  const arrow = `${g.original.trim()} → ${g.corrected.trim()}`;
  const why =
    category === "verb_form"
      ? `시제나 동사 형태가 맞지 않아요: ${arrow}`
      : category === "agreement"
        ? `주어의 수에 맞게 고쳐야 해요: ${arrow}`
        : `이 부분을 함께 고쳐야 해요: ${arrow}`;
  return { category, why };
}
