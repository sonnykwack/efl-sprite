// Measured language features of a written response — the part of scoring a computer can do
// exactly and identically every time (the approach of ETS e-rater: linguistic features +
// human-like judgement). The LLM judges content; these numbers anchor Language Use and are
// shown to the student as concrete, checkable indicators.
//
// Indicator → 0–5 thresholds are OUR provisional settings for intermediate–advanced learner
// writing of 100–200 words (documented here and in docs/scoring-experiments.md); refit on
// teacher-scored data like BAND_MAP.

import { normalizeWords } from "./accuracy";

export interface Indicator {
  key: "length" | "vocabulary" | "variety" | "accuracy" | "cohesion";
  nameKo: string;
  /** Raw value shown to the student, already formatted. */
  value: string;
  /** 0–5 */
  score: number;
  /** One-line Korean explanation of what was measured. */
  what: string;
  /** One-line Korean tip (empty if the score is already high). */
  tip: string;
}

export interface LanguageFeatures {
  words: number;
  sentences: number;
  meanSentenceLength: number;
  /** Moving-average type–token ratio over 50-word windows (length-independent diversity). */
  mattr: number;
  /** Share of words with 7+ letters (proxy for less common / academic vocabulary). */
  longWordShare: number;
  /** Content words used 3+ times, most repeated first. */
  repeated: { word: string; count: number }[];
  /** Share of sentences with a subordinate or relative clause. */
  complexShare: number;
  /** Distinct linking expressions used. */
  connectors: string[];
  /** Grammar-model + rule errors per 100 words. */
  errorsPer100: number;
  indicators: Indicator[];
  /** Mean of vocabulary, variety, accuracy and cohesion (0–5) — measured counterpart of Language Use. */
  languageScore: number;
}

const STOP = new Set(
  ("a an the and or but so if of to in on at by for with from as is are was were be been being am do does did have has had " +
    "i you he she it we they me him her us them my your his its our their this that these those there here what which who " +
    "not no can could will would should may might must very also just more most than then too about into over such only " +
    "because when while all some any one other many much").split(" "),
);

const SUBORDINATORS =
  /\b(because|although|though|even though|while|whereas|since|unless|if|when|whenever|until|after|before|so that|which|who|whom|whose|where)\b/i;

const CONNECTORS = [
  "however", "therefore", "moreover", "furthermore", "in addition", "for example", "for instance", "as a result",
  "on the other hand", "in contrast", "consequently", "nevertheless", "in fact", "first", "second", "finally",
  "in conclusion", "overall", "also", "besides", "meanwhile", "similarly", "instead", "otherwise", "thus",
  "for this reason", "in other words", "to be specific", "that is why", "above all",
];

export function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /[A-Za-z]/.test(s));
}

export function mattr(words: string[], window = 50): number {
  if (words.length === 0) return 0;
  if (words.length <= window) return new Set(words).size / words.length;
  let sum = 0;
  let n = 0;
  for (let i = 0; i + window <= words.length; i++) {
    sum += new Set(words.slice(i, i + window)).size / window;
    n++;
  }
  return sum / n;
}

const band = (x: number, cuts: [number, number, number, number]) =>
  x < cuts[0] ? 1 : x < cuts[1] ? 2 : x < cuts[2] ? 3 : x < cuts[3] ? 4 : 5;

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function measure(text: string, opts: { minWords?: number; errorCount: number }): LanguageFeatures {
  const words = normalizeWords(text);
  const sents = sentencesOf(text);
  const n = words.length;
  const m = mattr(words);
  const long = n ? words.filter((w) => w.replace(/[^a-z]/g, "").length >= 7).length / n : 0;
  const counts = new Map<string, number>();
  for (const w of words) if (!STOP.has(w) && w.length > 2) counts.set(w, (counts.get(w) ?? 0) + 1);
  const repeated = [...counts.entries()]
    .filter(([, c]) => c >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word, count]) => ({ word, count }));
  const complex = sents.length ? sents.filter((s) => SUBORDINATORS.test(s)).length / sents.length : 0;
  const lower = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  const connectors = CONNECTORS.filter((c) => new RegExp(`[^a-z]${c.replace(/ /g, "\\s")}[^a-z]`).test(lower));
  const errorsPer100 = n ? (opts.errorCount / n) * 100 : 0;
  const meanLen = sents.length ? n / sents.length : 0;

  // MATTR-50 sits around 0.75–0.85 for ordinary prose and says little about short texts, so
  // the share of longer words counts double.
  const vocab = Math.round((band(m, [0.72, 0.76, 0.8, 0.84]) + 2 * band(long, [0.12, 0.16, 0.2, 0.25])) / 3);
  const variety = band(complex, [0.15, 0.3, 0.45, 0.6]);
  const accuracy = 6 - band(errorsPer100, [2, 4, 7, 10]); // fewer errors → higher
  const cohesion = band(connectors.length, [1, 2, 3, 5]);
  const ratio = opts.minWords ? n / opts.minWords : 1;
  const length = band(ratio, [0.5, 0.8, 1.0, 1.3]);

  const indicators: Indicator[] = [
    {
      key: "length",
      nameKo: "분량",
      value: opts.minWords ? `${n}단어 (권장 ${opts.minWords}+)` : `${n}단어`,
      score: length,
      what: "생각을 충분히 펼칠 만큼 썼는지",
      tip: length >= 4 ? "" : "이유마다 예시나 설명을 한 문장씩 더해 보세요.",
    },
    {
      key: "vocabulary",
      nameKo: "어휘 다양성",
      value: `MATTR ${m.toFixed(2)} · 긴 단어 ${pct(long)}`,
      score: vocab,
      what: "같은 단어를 반복하지 않고 다양한·구체적인 단어를 썼는지",
      tip:
        vocab >= 4
          ? ""
          : repeated.length
            ? `자주 반복한 단어: ${repeated.map((r) => `${r.word}(${r.count})`).join(", ")} — 바꿔 쓸 표현을 찾아보세요.`
            : "good, thing, many 같은 쉬운 단어를 더 구체적인 단어로 바꿔 보세요.",
    },
    {
      key: "variety",
      nameKo: "문장 구조 다양성",
      value: `복문 ${pct(complex)} · 평균 ${meanLen.toFixed(1)}단어/문장`,
      score: variety,
      what: "because, although, which 같은 절을 써서 문장을 다양하게 만들었는지",
      tip: variety >= 4 ? "" : "although, which, so that 등을 써서 짧은 문장 두 개를 하나로 이어 보세요.",
    },
    {
      key: "accuracy",
      nameKo: "문법 정확성",
      value: `오류 ${opts.errorCount}개 · 100단어당 ${errorsPer100.toFixed(1)}개`,
      score: accuracy,
      what: "문법 모델과 규칙 검사가 찾은 오류의 밀도",
      tip: accuracy >= 4 ? "" : "아래 교정 목록에서 같은 유형이 반복되는지 확인해 보세요.",
    },
    {
      key: "cohesion",
      nameKo: "연결어 활용",
      value: connectors.length ? connectors.slice(0, 4).join(", ") : "없음",
      score: cohesion,
      what: "However, For example, As a result 같은 연결어로 흐름을 보여줬는지",
      tip: cohesion >= 4 ? "" : "주장 → 이유(For example …) → 결과(As a result …) 순서로 연결어를 넣어 보세요.",
    },
  ];
  return {
    words: n,
    sentences: sents.length,
    meanSentenceLength: meanLen,
    mattr: m,
    longWordShare: long,
    repeated,
    complexShare: complex,
    connectors,
    errorsPer100,
    indicators,
    languageScore: (vocab + variety + accuracy + cohesion) / 4,
  };
}

/** Compact block for the scoring prompt (the LLM sees the same numbers as the student). */
export function featuresBlock(f: LanguageFeatures): string {
  return [
    "<measured_features>  (computed exactly by code — use them when scoring Language Use; do not recount)",
    `words: ${f.words}, sentences: ${f.sentences}, mean sentence length: ${f.meanSentenceLength.toFixed(1)}`,
    `lexical diversity (MATTR-50): ${f.mattr.toFixed(2)}  (≈0.78 typical intermediate, ≥0.84 advanced)`,
    `long words (7+ letters): ${Math.round(f.longWordShare * 100)}%`,
    `sentences with a subordinate/relative clause: ${Math.round(f.complexShare * 100)}%`,
    `linking expressions: ${f.connectors.join(", ") || "none"}`,
    `grammar errors found by the grammar model and rules: ${f.errorsPer100.toFixed(1)} per 100 words`,
    f.repeated.length ? `most repeated content words: ${f.repeated.map((r) => `${r.word}×${r.count}`).join(", ")}` : "",
    "</measured_features>",
  ]
    .filter(Boolean)
    .join("\n");
}
