// Deterministic checks for issues a TOEFL teacher flags in Korean learners' writing that
// the local LLM reliably misses (measured on sample AD-1 with Qwen2.5-3B and -7B):
// sentence fragments starting with "Because …", informal connectors ("so", sentence-initial
// "But/Also/And"), and vague words ("thing", "some", "a lot of", "very + adjective").
// Rules are instant, never hallucinate, and their quotes are always exact spans.

export type RuleKind = "sentence" | "register" | "word_choice";

export interface RuleIssue {
  kind: RuleKind;
  category: "fragment" | "register" | "word_choice";
  /** Fixed, sentence-specific reason in Korean. */
  why: string;
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
  // Only uncountable abstract nouns: "some pressure" → "a certain amount of pressure".
  // For countable nouns ("some discount") the right fix depends on meaning, so leave it to the LLM.
  {
    re: /\bsome (?:pressure|time|help|money|information|experience|advice|effort|stress|knowledge|freedom|support)\b/i,
    correction: (m) => `a certain amount of ${m.split(/\s+/)[1]}`,
  },
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

/**
 * Email register: demanding or blunt phrasing toward the recipient. ES-1 Email 2-B ("Hello
 * manager. … Please stop the construction … I want answer quickly.") got Organization & Tone
 * 4/5 from the 7B model; the teacher's main complaint was exactly this tone. Each hit is a
 * fact we can show, and their number caps the tone score (applyCaps).
 */
const TONE: { re: RegExp; rule: string; why: string; correction: (m: string) => string }[] = [
  {
    re: /^(?:Hello|Hi|Hey)[ ,]+(?:manager|sir|madam|teacher|professor|staff)\b[.,!]?/i,
    rule: "tone-greeting",
    why: "직함만 부르는 인사는 어색하고 무례하게 들릴 수 있어요. 공식 이메일은 'Dear + 직함/이름,'으로 시작해요.",
    correction: (m) => `Dear ${m.replace(/^(?:Hello|Hi|Hey)[ ,]+/i, "").replace(/[.,!]$/, "").replace(/^\w/, (c) => c.toUpperCase())},`,
  },
  {
    re: /\bI want (?:an? |the |your )?(?:answer|reply|response|refund|discount|solution|explanation)\b(?: (?:quickly|fast|soon|now|immediately))?/i,
    rule: "tone-want",
    why: "'I want …'은 요구하는 느낌이 강해요. 이메일에서는 'I would appreciate …'나 'Could you …?'처럼 정중하게 요청해요.",
    correction: () => "I would appreciate a reply at your earliest convenience",
  },
  {
    re: /\byou (?:must|have to|need to) /i,
    rule: "tone-must",
    why: "상대에게 'must / have to'로 지시하면 명령처럼 들려요. 'Could you please …?'로 부탁해 보세요.",
    correction: () => "could you please ",
  },
  {
    re: /(?:^|[.!?]\s+)(Please (?!let me know|find|see)\w+[^.!?]*)[.!]/,
    rule: "tone-please",
    why: "'Please + 동사' 명령문은 이메일에서 지시처럼 들릴 수 있어요. 'Could you please …?'나 'I would like to ask if …'로 바꾸면 더 정중해요.",
    correction: (m) => `Could you please ${m.replace(/^Please\s+/, "").replace(/[.!]$/, "")}?`,
  },
];

export function detectToneIssues(response: string): RuleIssue[] {
  const out: RuleIssue[] = [];
  for (const t of TONE) {
    const m = response.trim().match(t.re);
    if (!m) continue;
    const quote = (m[1] ?? m[0]).trim();
    out.push({ kind: "register", category: "register", why: t.why, quote, correction: t.correction(quote), rule: t.rule });
  }
  return out;
}

/** Run all rules over a written response (or a speaking transcript). */
export function detectRuleIssues(response: string, taskType?: string): RuleIssue[] {
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
        category: "fragment",
        why: `'${sub[1]} …'로 시작하는 문장에 주절이 없어요. 앞 문장의 이유를 설명하는 내용이므로 앞 문장과 하나로 이어야 해요.`,
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
        category: "register",
        why: `문장을 '${opener[1]}'로 시작하는 것은 말할 때의 표현이에요. 글에서는 '${OPENERS[opener[1]].replace(",", "")}'가 더 격식 있어요.`,
        quote: firstWords(s.text, 3),
        correction: `${OPENERS[opener[1]]} ${firstWords(s.text, 3).split(/\s+/).slice(1).join(" ").replace(/^,\s*/, "")}`,
        rule: "informal-opener",
      });
    }
  });

  // 3. ", so <word>" inside a sentence → "; therefore, <word>"
  const so = response.match(/, so (\w+)/);
  if (so) out.push({ kind: "register", category: "register", why: "결과를 잇는 'so'는 구어체 느낌이 강해요. 글에서는 'therefore'나 'as a result'가 더 적절해요.", quote: `so ${so[1]}`, correction: `therefore, ${so[1]}`, rule: "informal-so" });

  // 4. Vague words — first occurrence of each pattern only, to avoid noise.
  for (const v of VAGUE) {
    const m = response.match(v.re);
    if (!m) continue;
    // "this kind of thing" already covers the bare "thing" rule.
    if (/thing/i.test(m[0]) && out.some((o) => o.rule === "vague" && /thing/i.test(o.quote))) continue;
    out.push({ kind: "word_choice", category: "word_choice", why: `'${m[0]}'은(는) 뜻이 막연해요. 무엇을 가리키는지 구체적인 단어로 바꾸면 더 정확해져요.`, quote: m[0], correction: matchCase(m[0], v.correction(m[0])), rule: "vague" });
  }
  if (taskType === "email") out.push(...detectToneIssues(response));
  return out;
}
