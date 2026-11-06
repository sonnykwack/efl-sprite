// GECToR tags → the app's error taxonomy + a fixed Korean reason.
//
// The tag already says what kind of edit it is ($APPEND_the = missing article,
// $TRANSFORM_VERB_VB_VBZ = verb must agree with a 3rd-person singular subject, …), so the
// category is decided here by code, not guessed by a language model. Reasons are written
// "noun(English) + particle" (관사(the)가) so Korean particles stay correct for any word.

import type { ErrorCategory } from "./grammarGuide";
import type { GecEdit } from "./types";

export const ARTICLES = new Set(["a", "an", "the"]);
export const PREPOSITIONS = new Set([
  "in", "on", "at", "to", "for", "of", "with", "by", "from", "about", "into", "onto", "during",
  "until", "since", "over", "under", "between", "among", "through", "toward", "towards",
  "without", "within", "after", "before", "like", "as", "upon", "across", "against", "around",
]);
const AUX_PAIRS = [
  ["is", "are"], ["was", "were"], ["has", "have"], ["does", "do"], ["am", "are"], ["am", "is"],
  ["doesn't", "don't"], ["isn't", "aren't"], ["wasn't", "weren't"], ["hasn't", "haven't"],
];
const AUX = new Set(["is", "are", "was", "were", "am", "be", "been", "being", "has", "have", "had", "do", "does", "did", "will", "would", "can", "could"]);
const PUNCT = /^[.,;:!?'"()-]+$/;

const lower = (s: string) => s.toLowerCase();
const isAuxPair = (a: string, b: string) =>
  AUX_PAIRS.some(([x, y]) => (lower(a) === x && lower(b) === y) || (lower(a) === y && lower(b) === x));
const sameStem = (a: string, b: string) => {
  const x = lower(a), y = lower(b);
  return x.length >= 4 && y.length >= 4 && x.slice(0, 4) === y.slice(0, 4) && x !== y;
};

export interface MappedGec {
  category: ErrorCategory;
  why: string;
}

/** The first tag that is not a pure capitalization fix decides the category. */
function mainLabel(labels: string[]): string {
  return labels.find((l) => !l.startsWith("$TRANSFORM_CASE")) ?? labels[0] ?? "";
}

/** Words after which a noun must be plural ("two book" → "two books"). */
const PLURAL_CUES = new Set([
  "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "many", "several",
  "few", "these", "those", "both", "various", "numerous", "multiple", "some", "all", "most",
]);

/** The word just before `start` in the response (lower-case), if any. */
function prevWord(response: string | undefined, start: number): string {
  if (!response) return "";
  const m = /([A-Za-z0-9']+)\W*$/.exec(response.slice(0, start));
  return m ? m[1].toLowerCase() : "";
}

/**
 * `response` gives context: GECToR uses the verb transform VB→VBZ (+s) for nouns too, so
 * "two book → books" would otherwise be explained as subject–verb agreement.
 */
export function mapGecEdit(e: GecEdit, response?: string): MappedGec {
  const label = mainLabel(e.labels);
  const o = e.original.trim();
  const c = e.corrected.trim();
  const arrow = `${o || "(없음)"} → ${c || "(삭제)"}`;
  const before = prevWord(response, e.start);
  if ((label === "$TRANSFORM_VERB_VB_VBZ" || label === "$TRANSFORM_AGREEMENT_PLURAL") && (PLURAL_CUES.has(before) || /^\d+$/.test(before))) {
    return { category: "plural", why: `앞에 '${before}'가 있어서 명사를 복수형으로 써야 해요: ${arrow}` };
  }

  if (label.startsWith("$APPEND_")) {
    const w = label.slice("$APPEND_".length);
    if (ARTICLES.has(lower(w))) return { category: "article", why: `여기에는 관사(${w})가 필요해요.` };
    if (PREPOSITIONS.has(lower(w))) return { category: "preposition", why: `전치사(${w})가 빠졌어요.` };
    if (PUNCT.test(w)) return { category: w === "." || w === ";" ? "run_on" : "mechanics", why: `문장 부호(${w})가 필요해요.` };
    if (AUX.has(lower(w))) return { category: "verb_form", why: `동사(${w})가 빠졌어요. 문장에는 동사가 꼭 있어야 해요.` };
    return { category: "grammar_other", why: `빠진 단어가 있어요: ${w}` };
  }
  if (label.startsWith("$REPLACE_")) {
    const w = label.slice("$REPLACE_".length);
    const orig = o.split(/\s+/).pop() ?? o;
    if (ARTICLES.has(lower(w)) || ARTICLES.has(lower(orig))) return { category: "article", why: `관사를 바꿔야 해요: ${arrow}` };
    if (PREPOSITIONS.has(lower(w)) && PREPOSITIONS.has(lower(orig))) return { category: "preposition", why: `이 표현에 맞는 전치사는 따로 있어요: ${arrow}` };
    if (isAuxPair(orig, w)) return { category: "agreement", why: `주어의 수에 맞게 동사를 바꿔야 해요: ${arrow}` };
    if (AUX.has(lower(w)) || AUX.has(lower(orig))) return { category: "verb_form", why: `시제나 동사 형태가 맞지 않아요: ${arrow}` };
    if (PUNCT.test(w)) return { category: "mechanics", why: `문장 부호를 고쳐야 해요: ${arrow}` };
    if (sameStem(orig, w)) return { category: "word_form", why: `품사나 형태를 바꿔야 해요: ${arrow}` };
    return { category: "word_choice", why: `더 알맞은 단어가 있어요: ${arrow}` };
  }
  if (label.startsWith("$TRANSFORM_VERB_")) {
    const [from, to] = label.slice("$TRANSFORM_VERB_".length).split("_");
    const agreement = ["VB", "VBZ", "VBP"].includes(from) && ["VB", "VBZ", "VBP"].includes(to);
    return agreement
      ? { category: "agreement", why: `주어의 수에 맞게 동사를 바꿔야 해요: ${arrow}` }
      : { category: "verb_form", why: `시제나 동사 형태가 맞지 않아요: ${arrow}` };
  }
  if (label === "$TRANSFORM_AGREEMENT_PLURAL") return { category: "plural", why: `여기서는 복수형으로 써야 해요: ${arrow}` };
  if (label === "$TRANSFORM_AGREEMENT_SINGULAR") return { category: "plural", why: `여기서는 단수형으로 써야 해요: ${arrow}` };
  if (label === "$DELETE") {
    const w = o.split(/\s+/)[0] ?? o;
    if (ARTICLES.has(lower(w))) return { category: "article", why: `여기에는 관사(${w})가 필요 없어요.` };
    if (PREPOSITIONS.has(lower(w))) return { category: "preposition", why: `전치사(${w})가 필요 없어요.` };
    if (AUX.has(lower(w))) return { category: "verb_form", why: `동사(${w})가 한 번 더 들어갔어요.` };
    return { category: "grammar_other", why: `필요 없는 단어예요: ${w}` };
  }
  if (label.startsWith("$TRANSFORM_CASE") || label.startsWith("$MERGE_") || label === "$TRANSFORM_SPLIT_HYPHEN") {
    return { category: "mechanics", why: `대소문자·띄어쓰기를 고쳐야 해요: ${arrow}` };
  }
  return { category: "grammar_other", why: arrow };
}

/**
 * Display span for an edit. Pure deletions ("the" → "") read badly on their own, so the
 * following word is included as context: "the lecture" → "lecture".
 */
export function displaySpan(response: string, e: GecEdit): { start: number; end: number; quote: string; correction: string } {
  if (e.corrected.trim() !== "") {
    return { start: e.start, end: e.end, quote: response.slice(e.start, e.end), correction: e.corrected };
  }
  const after = /^\s*(\S+)/.exec(response.slice(e.end));
  if (after) {
    const end = e.end + after[0].length;
    return { start: e.start, end, quote: response.slice(e.start, end), correction: after[1] };
  }
  const before = /(\S+)\s*$/.exec(response.slice(0, e.start));
  if (before) {
    const start = e.start - before[0].length;
    return { start, end: e.end, quote: response.slice(start, e.end), correction: before[1] };
  }
  return { start: e.start, end: e.end, quote: response.slice(e.start, e.end), correction: "" };
}
