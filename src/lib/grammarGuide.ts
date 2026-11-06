// Error taxonomy + curated Korean explanations.
//
// Why curated: a 7B model writing free-form grammar explanations produces plausible but
// sometimes wrong rules. Instead the model only CLASSIFIES each correction into this fixed
// taxonomy (plus a one-line, sentence-specific "why"); the principle shown to the student
// comes from this file, written for Korean EFL learners and reviewable by the teacher.

import { alignWords } from "./accuracy";

export type ErrorCategory =
  | "agreement"
  | "article"
  | "plural"
  | "verb_form"
  | "preposition"
  | "word_form"
  | "possessive"
  | "fragment"
  | "run_on"
  | "register"
  | "word_choice"
  | "mechanics"
  | "grammar_other";

/** Display group (colour + short label). */
export type ErrorKind = "grammar" | "sentence" | "word_choice" | "register";

export const CATEGORIES: ErrorCategory[] = [
  "agreement", "article", "plural", "verb_form", "preposition", "word_form",
  "possessive", "fragment", "run_on", "register", "word_choice", "mechanics", "grammar_other",
];

export interface CategoryInfo {
  kind: ErrorKind;
  /** Short Korean label shown on the chip. */
  label: string;
  /** English name given to the model in the prompt. */
  en: string;
  /** The grammar principle, in Korean, for the student. */
  principle: string;
  /** Short correct examples (generic — never taken from evaluation texts). */
  examples: string[];
}

export const GUIDE: Record<ErrorCategory, CategoryInfo> = {
  agreement: {
    kind: "grammar",
    label: "수 일치",
    en: "subject–verb agreement",
    principle:
      "주어와 동사의 수를 맞춰야 해요. 주어가 복수(students, many of us)이면 복수 동사(are, were, have)를, 3인칭 단수(he, she, the city)이면 현재 시제 동사에 -s를 붙여요.",
    examples: ["The students are ready.", "She takes the bus every day."],
  },
  article: {
    kind: "grammar",
    label: "관사",
    en: "article (a/an/the)",
    principle:
      "셀 수 있는 단수 명사 앞에는 a/an이나 the가 필요해요. 처음 말하는 하나는 a/an, 서로 이미 아는 특정한 대상은 the를 써요. 셀 수 없는 명사(information, noise)에는 a를 쓰지 않아요.",
    examples: ["I watched a video instead of the lecture.", "There is construction next to the building."],
  },
  plural: {
    kind: "grammar",
    label: "단수·복수",
    en: "singular/plural noun",
    principle:
      "셀 수 있는 명사가 여럿이거나 그 종류 전체를 말할 때는 복수형을 써요. 'many, several, a few' 뒤에도 복수형이 와요.",
    examples: ["Online courses are popular.", "many students"],
  },
  verb_form: {
    kind: "grammar",
    label: "시제·동사 형태",
    en: "verb tense or form",
    principle:
      "일이 일어난 시점에 맞는 시제를 써요. 이미 끝난 일은 과거형(changed, helped), 과거부터 지금까지 이어지는 일은 현재완료(has been, have had)를 써요. 조동사(can, will) 뒤에는 동사원형이 와요.",
    examples: ["My manager changed my schedule.", "It has been noisy for two weeks."],
  },
  preposition: {
    kind: "grammar",
    label: "전치사",
    en: "preposition",
    principle:
      "단어마다 함께 쓰는 전치사가 정해져 있어요. 층은 on(on my floor), 집에서는 at home, 마감 시점은 by(by Friday), 계속되는 기간은 until을 써요.",
    examples: ["I live on the third floor.", "Please send it by Wednesday."],
  },
  word_form: {
    kind: "grammar",
    label: "품사·어형",
    en: "word form (part of speech, comparative)",
    principle:
      "문장 속 역할에 맞는 형태를 써야 해요. 명사 자리에는 명사, 동사를 꾸밀 때는 부사를 써요. 짧은 형용사의 비교급은 -er(easier, cheaper)이고 more를 함께 쓰지 않아요.",
    examples: ["She explained it with easier examples.", "I strongly disagree."],
  },
  possessive: {
    kind: "grammar",
    label: "소유격",
    en: "possessive",
    principle:
      "'누구의'를 나타낼 때 단수 명사는 's(my friend's opinion), -s로 끝나는 복수 명사는 '만(students' faces) 붙여요.",
    examples: ["the teacher's comment", "the students' faces"],
  },
  fragment: {
    kind: "sentence",
    label: "불완전한 문장",
    en: "sentence fragment",
    principle:
      "Because, Although, Since로 시작하는 절은 혼자서 문장이 될 수 없어요(주절이 없음). 앞 문장과 이어서 '…, because …'로 쓰거나, 뒤에 주절을 붙여 완전한 문장으로 만들어요.",
    examples: ["Classes are better because teachers can see students.", "Because it rained, we stayed home."],
  },
  run_on: {
    kind: "sentence",
    label: "문장 연결",
    en: "run-on sentence / comma splice",
    principle:
      "완전한 문장 두 개를 쉼표만으로 이으면 안 돼요. 마침표로 나누거나, and·but·so 같은 접속사나 세미콜론(;)으로 연결해요.",
    examples: ["I was tired; therefore, I went home early."],
  },
  register: {
    kind: "register",
    label: "격식·어조",
    en: "register / tone",
    principle:
      "학술적인 글이나 공식 이메일에서는 구어체 연결어 대신 격식 있는 표현을 써요(So → Therefore, But → However, Also → In addition). 요청할 때는 명령보다 정중한 표현(Could you…? I would appreciate it if…)이 자연스러워요.",
    examples: ["Therefore, I believe…", "Could you let me know by Friday?"],
  },
  word_choice: {
    kind: "word_choice",
    label: "어휘 선택",
    en: "word choice (vague or inaccurate word)",
    principle:
      "thing, some, very, good 같은 막연한 단어는 뜻을 흐리게 해요. 상황에 맞는 구체적인 단어를 고르면 글이 정확하고 설득력 있어져요.",
    examples: ["this kind of situation", "extremely difficult"],
  },
  mechanics: {
    kind: "sentence",
    label: "대소문자·부호",
    en: "capitalization / punctuation",
    principle:
      "문장 첫 글자와 고유명사(사람·나라·요일 이름)는 대문자로 써요. 쉼표는 접속사 앞(…, but …)이나 도입구 뒤(However, …)에, 마침표는 완전한 문장 끝에 찍어요.",
    examples: ["However, I disagree.", "I met Professor Kim on Monday."],
  },
  grammar_other: {
    kind: "grammar",
    label: "문법",
    en: "other grammar",
    principle: "문장의 문법 구조를 다시 확인해요. 고친 문장과 비교해 어떤 단어가 바뀌었는지 살펴보세요.",
    examples: [],
  },
};

/** Old evaluations (prompt v2, or saved before categories existed) only have a `kind`. */
export function categoryFromKind(kind: string | undefined): ErrorCategory {
  return kind === "sentence" ? "fragment" : kind === "register" ? "register" : kind === "word_choice" ? "word_choice" : "grammar_other";
}

export const KIND_OF = (c: ErrorCategory): ErrorKind => GUIDE[c].kind;

/** Taxonomy list for the prompt: `category — meaning`. */
export const TAXONOMY_PROMPT = CATEGORIES.map((c) => `${c} — ${GUIDE[c].en}`).join("; ");

export type DiffPart = { text: string; op: "same" | "del" | "ins" };

/**
 * Word-level diff between the student's words and the correction, so the student sees
 * exactly which words changed ("students is → are understanding"). Case and punctuation
 * of the original tokens are preserved for display.
 */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = before.split(/\s+/).filter(Boolean);
  const b = after.split(/\s+/).filter(Boolean);
  const key = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, "");
  const ops = alignWords(a.map(key), b.map(key));
  const out: DiffPart[] = [];
  let i = 0;
  let j = 0;
  for (const o of ops) {
    if (o.op === "ok") {
      // Same word, maybe different punctuation: show the corrected token.
      out.push({ text: a[i] === b[j] ? a[i] : b[j], op: a[i] === b[j] ? "same" : "ins" });
      i++; j++;
    } else if (o.op === "sub") {
      out.push({ text: a[i++], op: "del" }, { text: b[j++], op: "ins" });
    } else if (o.op === "del") {
      out.push({ text: a[i++], op: "del" });
    } else {
      out.push({ text: b[j++], op: "ins" });
    }
  }
  return out;
}
