// Deterministic checks for issues a TOEFL teacher flags in Korean learners' writing that
// the local LLM reliably misses (measured on sample AD-1 with Qwen2.5-3B and -7B):
// sentence fragments starting with "Because …", informal connectors ("so", sentence-initial
// "But/Also/And"), and vague words ("thing", "some", "a lot of", "very + adjective").
// Rules are instant, never hallucinate, and their quotes are always exact spans.

export type RuleKind = "sentence" | "register" | "word_choice";

export interface RuleIssue {
  kind: RuleKind;
  /** Exact text from the response. */
  quote: string;
  correction: string;
  rule: string;
}

interface Sentence {
  text: string;
  start: number;
}

function sentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  const re = /[^.!?]+[.!?]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const lead = m[0].length - m[0].trimStart().length;
    const s = m[0].trim();
    if (s) out.push({ text: s, start: m.index + lead });
  }
  return out;
}

const SUBORDINATORS = /^(Because|Although|Though|Since|While|Whereas|Unless)\b/;
const OPENERS: Record<string, string> = {
  So: "Therefore,",
  But: "However,",
  Also: "In addition,",
  And: "Moreover,",
};
const VAGUE: { re: RegExp; correction: (m: string) => string }[] = [
  { re: /\b(?:this|that) kind of thing\b/i, correction: () => "this kind of situation" },
  { re: /\bthings?\b/i, correction: (m) => (m.toLowerCase().endsWith("s") ? "aspects / issues" : "aspect / issue") },
  { re: /\bstuff\b/i, correction: () => "materials / things (be specific)" },
  { re: /\ba lot of\b/i, correction: () => "many / much / a great deal of" },
  { re: /\bsome (?=[a-z]+\b)(?!of\b|people\b|students\b)[a-z]+/i, correction: (m) => `a certain amount of ${m.split(/\s+/)[1]}` },
  { re: /\bvery (?:good|bad|hard|easy|important|big|small|difficult)\b/i, correction: (m) => STRONG[m.split(/\s+/)[1].toLowerCase()] ?? m },
];
const STRONG: Record<string, string> = {
  good: "excellent", bad: "terrible", hard: "extremely difficult", easy: "effortless",
  important: "crucial", big: "enormous", small: "tiny", difficult: "extremely difficult",
};

const firstWords = (s: string, n: number) => s.split(/\s+/).slice(0, n).join(" ");
const matchCase = (orig: string, fix: string) =>
  /^[A-Z]/.test(orig) ? fix.charAt(0).toUpperCase() + fix.slice(1) : fix;
const PREPOSITIONS = /^(in|on|at|for|with|during|after|before|from|by|of|to|about)\b/i;

/**
 * Heuristic fragment test for a sentence starting with a subordinator.
 * "Because it rained, we stayed home."            → OK (clause, comma, main clause)
 * "Because the lecture was long."                 → fragment (no comma → no main clause)
 * "Because in classroom, the professor can …."    → fragment (only a prepositional phrase
 *                                                    before the comma, so what follows is
 *                                                    still part of the because-clause)
 */
function isFragment(sentence: string, subordinator: string): boolean {
  const rest = sentence.slice(subordinator.length).trim();
  const comma = rest.indexOf(",");
  if (comma < 0) return true;
  return PREPOSITIONS.test(rest.slice(0, comma).trim());
}

/** Run all rules over a written response (or a speaking transcript). */
export function detectRuleIssues(response: string): RuleIssue[] {
  const out: RuleIssue[] = [];
  const sents = sentences(response);

  sents.forEach((s, idx) => {
    // 1. Fragment: subordinate clause standing alone ("Because in classroom, the professor …"
    //    is fine only if a main clause follows a comma; the classic error is no main clause,
    //    or — as in AD-1 — the reason is cut off from the claim it explains).
    const sub = s.text.match(SUBORDINATORS);
    if (sub && idx > 0 && isFragment(s.text, sub[1])) {
      const prev = sents[idx - 1].text.replace(/[.!?]+$/, "");
      const prevTail = prev.split(/\s+/).slice(-3).join(" ");
      const head = firstWords(s.text, 4);
      out.push({
        kind: "sentence",
        quote: `${prevTail}. ${head}`,
        correction: `${prevTail} ${sub[1].toLowerCase()} ${head.split(/\s+/).slice(1).join(" ")}`,
        rule: "fragment",
      });
    }
    // 2. Informal sentence opener.
    const opener = s.text.match(/^(So|But|Also|And)\b,?/);
    if (opener) {
      out.push({
        kind: "register",
        quote: firstWords(s.text, 3),
        correction: `${OPENERS[opener[1]]} ${firstWords(s.text, 3).split(/\s+/).slice(1).join(" ").replace(/^,\s*/, "")}`,
        rule: "informal-opener",
      });
    }
  });

  // 3. ", so <word>" inside a sentence → "; therefore, <word>"
  const so = response.match(/, so (\w+)/);
  if (so) out.push({ kind: "register", quote: `so ${so[1]}`, correction: `therefore, ${so[1]}`, rule: "informal-so" });

  // 4. Vague words — first occurrence of each pattern only, to avoid noise.
  for (const v of VAGUE) {
    const m = response.match(v.re);
    if (!m) continue;
    // "this kind of thing" already covers the bare "thing" rule.
    if (/thing/i.test(m[0]) && out.some((o) => o.rule === "vague" && /thing/i.test(o.quote))) continue;
    out.push({ kind: "word_choice", quote: m[0], correction: matchCase(m[0], v.correction(m[0])), rule: "vague" });
  }
  return out;
}
