// English feedback → natural Korean for students.
//
// Failure seen on 2026-11-06 (Qwen2.5-7B, all comments translated in ONE JSON array):
//   "반응은 가난한人们的翻译结果：["  — repeated in several fields.
// Causes: (1) Qwen drifts into Chinese when generation gets unstable; (2) "The response …"
// translated literally as "반응"; (3) one long array call degenerated and the broken string
// was copied into several slots; (4) nothing validated the output.
//
// Fixes here, in layers:
//   1. Character set enforced by the output grammar: Hangul + ASCII + a few punctuation marks.
//      Chinese characters and kana cannot be generated at all.
//   2. One short call per sentence (run concurrently in llama-server's parallel slots).
//   3. Glossary + two worked examples (response/essay → 답안, never 반응; 해요체).
//   4. Validation (CJK/kana, too little Hangul, identical outputs for different sources) with
//      one retry; if it still fails, the English original is shown — never garbage.

import { api } from "./api";
import type { ChatMessage } from "./types";

/**
 * Allowed output characters (JSON-schema `pattern` → llama.cpp grammar): Hangul, compatibility
 * jamo, printable ASCII EXCEPT `"` and `\` (a pattern-constrained string is emitted raw, so an
 * unescaped `"` would end the JSON string), curly quotes and a few punctuation marks.
 * Verified with llama.cpp's own json-schema-to-grammar converter.
 */
export const KO_PATTERN = "^[가-힣ㄱ-ㆎ !#-\\[\\]-~‘’“”·…–—→]+$";

const SYSTEM = [
  "You translate English writing feedback into natural Korean for a Korean high-school or university student in an English academy.",
  "Rules:",
  "- Polite, friendly 해요체, spoken directly to the student. Do not start with '학생은'.",
  "- Translate the meaning, not word by word.",
  "- 'the response' / 'your response' / 'essay' / 'answer' → 답안 (NEVER 반응). 'classmates' → 다른 학생들. 'position' → 입장. 'support' (noun) → 근거.",
  "- Keep English words, quotations and corrections exactly as they are, inside quotation marks.",
  "- Output only Korean (Hangul) plus those quoted English words. Never use Chinese characters.",
  "- Output only the translation — no notes, no explanations.",
].join("\n");

const EXAMPLES: [string, string][] = [
  [
    "You state a clear position, but most of your reasons repeat Paul's post. Add one idea of your own and explain why it matters.",
    "입장은 분명하지만 이유 대부분이 Paul의 의견과 겹쳐요. 나만의 의견을 하나 더하고, 그것이 왜 중요한지 설명해 보세요.",
  ],
  [
    "The response gives a specific example about a statistics class, but it does not explain how the example supports the argument.",
    "답안에 통계 수업이라는 구체적인 예시가 있지만, 그 예시가 주장을 어떻게 뒷받침하는지는 설명하지 않았어요.",
  ],
];

const SCHEMA = {
  type: "object",
  properties: { ko: { type: "string", pattern: KO_PATTERN } },
  required: ["ko"],
  additionalProperties: false,
};

const CJK_OR_KANA = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/;

/** Remove quoted spans so English inside quotes does not count against the Hangul ratio. */
const withoutQuotes = (s: string) => s.replace(/(^|[^A-Za-z])['"‘“][^'"’”]*['"’”](?![A-Za-z])/g, "$1 ");

export function isGoodKorean(source: string, ko: string): boolean {
  const t = ko.trim();
  if (!t || CJK_OR_KANA.test(t)) return false;
  if (/번역|translation/i.test(t) && !/번역|translat/i.test(source)) return false; // meta-talk
  const outside = withoutQuotes(t);
  const hangul = (outside.match(/[가-힣]/g) ?? []).length;
  const latin = (outside.match(/[A-Za-z]/g) ?? []).length;
  if (hangul < 2) return false;
  if (hangul < latin * 0.5) return false; // mostly untranslated English
  // A translation far shorter than its source has lost content.
  if (t.length < Math.min(source.length * 0.25, 40)) return false;
  // Copied a worked example instead of translating (seen: a grammar note came back as the
  // second example's "답안에 통계 수업이라는 구체적인 예시가 …").
  if (EXAMPLES.some(([en, ko]) => en !== source && similar(ko, t))) return false;
  // English kept verbatim: quoted English in the source must survive, and every English word
  // in the output must come from the source (seen: 'NIGHT에' for "at night").
  for (const q of quotedEnglish(source)) if (!t.includes(q)) return false;
  const srcWords = new Set(source.match(/[A-Za-z][A-Za-z']*/g) ?? []);
  for (const w of t.match(/[A-Za-z][A-Za-z']*/g) ?? []) if (!srcWords.has(w)) return false;
  return true;
}

/** English phrases inside quotes in the source ('study room', "a.m."). */
function quotedEnglish(source: string): string[] {
  // An opening quote must not follow a letter, so apostrophes ("don't", "it's") are not quotes.
  return [...source.matchAll(/(?:^|[^A-Za-z])['"‘“]([^'"’”]*[A-Za-z][^'"’”]*)['"’”](?![A-Za-z])/g)]
    .map((m) => m[1].trim())
    .filter(Boolean);
}

/** Character-bigram overlap (Dice) ≥ 0.6. */
function similar(a: string, b: string): boolean {
  const grams = (s: string) => {
    const t = s.replace(/\s+/g, "");
    const m = new Map<string, number>();
    for (let i = 0; i < t.length - 1; i++) m.set(t.slice(i, i + 2), (m.get(t.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const x = grams(a), y = grams(b);
  let shared = 0, total = 0;
  for (const [g, n] of x) { shared += Math.min(n, y.get(g) ?? 0); total += n; }
  for (const n of y.values()) total += n;
  return total > 0 && (2 * shared) / total >= 0.6;
}

/** 합니다체 endings — the first attempt is retried in 해요체; the strict attempt may keep them. */
const FORMAL = /(습니다|입니다|됩니다|합니다|십시오)[.!?]?(\s|$)/;

/** Deterministic fix for the one glossary mistake small models keep making. */
export function postFix(source: string, ko: string): string {
  let out = ko.trim();
  if (/\b(response|essay|answer)\b/i.test(source)) out = out.replace(/반응/g, "답안");
  return out.replace(/^학생은\s+/, "");
}

function messages(text: string, strict: boolean): ChatMessage[] {
  const msgs: ChatMessage[] = [{ role: "system", content: SYSTEM }];
  for (const [en, ko] of EXAMPLES) {
    msgs.push({ role: "user", content: en }, { role: "assistant", content: JSON.stringify({ ko }) });
  }
  msgs.push({
    role: "user",
    content: strict
      ? `${text}\n\n(Translate this text only — do not reuse the examples. Korean Hangul, 해요체 endings (-요). Keep English words in quotes exactly as written.)`
      : text,
  });
  return msgs;
}

async function callOnce(text: string, strict: boolean, withPattern: boolean): Promise<string> {
  const schema = withPattern
    ? SCHEMA
    : { ...SCHEMA, properties: { ko: { type: "string", maxLength: 600 } } };
  const raw = await api.llmChat(messages(text, strict), schema);
  return String(JSON.parse(raw).ko ?? "");
}

export interface Translated {
  text: string;
  /** false → the English original is shown (translation failed validation). */
  ok: boolean;
}

/** Translate one English sentence/paragraph; falls back to the original. */
export async function translateOne(text: string): Promise<Translated> {
  if (!text.trim()) return { text, ok: true };
  // If the server rejects the pattern grammar, retry without it (validation still applies).
  let withPattern = true;
  for (const strict of [false, true]) {
    try {
      const ko = postFix(text, await callOnce(text, strict, withPattern));
      if (isGoodKorean(text, ko) && (strict || !FORMAL.test(ko))) return { text: ko, ok: true };
    } catch (e) {
      if (withPattern) {
        withPattern = false;
        console.warn("translation with charset grammar failed; retrying without it", e);
      }
    }
  }
  return { text, ok: false };
}

/**
 * Translate several texts concurrently. Different sources that come back with the SAME
 * translation (the degenerate case seen in the field) are rejected and shown in English.
 */
export async function translateMany(texts: string[]): Promise<Translated[]> {
  const out = await Promise.all(texts.map((t) => translateOne(t)));
  const seen = new Map<string, number>();
  out.forEach((r, i) => {
    if (!r.ok) return;
    const j = seen.get(r.text);
    if (j !== undefined && texts[j].trim() !== texts[i].trim()) {
      out[i] = { text: texts[i], ok: false };
      out[j] = { text: texts[j], ok: false };
    } else {
      seen.set(r.text, i);
    }
  });
  return out;
}
