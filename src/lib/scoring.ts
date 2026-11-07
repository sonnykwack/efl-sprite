// LLM scoring pipeline for interview / email / academic_discussion.
//
// Design (see CLAUDE.md → Scoring design):
//  1. The rubric goes into the prompt with level anchors.
//  2. Output is constrained by a JSON schema (llama-server grammar). For every criterion
//     the model must write `evidence` (verbatim quotes) → `comment` → `score`, in that
//     order: committing to evidence first makes scores more stable than a bare number.
//  3. Evidence quotes are checked against the response afterwards ("grounding").
//
// Prompt versions (kept side by side so the scoring lab can compare them):
//  v1 — first attempt: strict rater, anchors at 5/3/1, feedback written directly in Korean.
//       Measured on the AD sample with Qwen2.5-3B: SD 0.94, band 2.0–2.5 (too harsh),
//       generic/incorrect comments, real grammar errors never mentioned.
//  v2 — (a) model first lists concrete language errors with corrections, (b) reasons and
//       writes in English, Korean comes from a separate translation call, (c) full 0–5
//       scale meanings + calibration note, "strict" removed.
//       Measured (3B, AD sample): band 3.5–3.67 ✓, real errors flagged ✓, but Support scored
//       1 despite a concrete personal example, comments copied rubric anchor text, and
//       quotes were taken from the classmates' posts instead of the student's response.
//  v3 — read first, judge second: the model fills `analysis` (main point, the reasons and
//       examples the student actually gives, what is missing) BEFORE any score; student
//       response and classmates' posts are wrapped in explicit tags; comments must name
//       response content and never copy rubric wording.
//       v3 also adds a teacher-derived checklist and typed corrections (see ERROR_CHECKLIST):
//       a TOEFL teacher scored the lab sample band 3.0–3.5 and flagged exactly these kinds of
//       issues, most of which v2 missed (fragments, informal connectors, vague words).
//  v4 — after ES-1 (teacher: "scores too generous", a 55-word demanding email got 4.0;
//       corrections had no explanation): calibration anchors (scored weak/adequate/strong
//       examples, src/lib/calibration.ts), "use the full scale", each correction classified
//       into a fixed taxonomy (src/lib/grammarGuide.ts) with a one-line reason, email
//       requirement coverage, and deterministic caps for short / incomplete responses.
//  evaluateResponse() can additionally take the per-criterion MEDIAN of several samples.

import { api } from "./api";
import { normalizeWords } from "./accuracy";
import { anchorText } from "./calibration";
import {
  CATEGORIES,
  KIND_OF,
  TAXONOMY_PROMPT,
  categoryFromKind,
  type ErrorCategory,
  type ErrorKind,
} from "./grammarGuide";
import { displaySpan } from "./gecMap";
import { checkRequiredPoints } from "./points";
import { detectRuleIssues, detectToneIssues } from "./rules";
import { joinAdjacentGec, mapJoinedGec, tidyLlmCorrection } from "./tidy";
import { verifyLlmCorrections } from "./verify";
import { featuresBlock, measure, type LanguageFeatures } from "./features";
import { snapQuote } from "./snap";
import { translateMany } from "./translate";
import { SCALE_MAX, TASK_SPECS, toBand, type Criterion } from "./rubrics";
import type { ChatMessage, GecEdit, TaskType } from "./types";

export interface ScorableTask {
  taskType: TaskType;
  prompt: string;
  material: string | null;
}

export interface SpeakingStats {
  durationSeconds: number;
  words: number;
  wordsPerMinute: number;
  fillers: number;
}

export interface CriterionResult {
  key: string;
  name: string;
  nameKo: string;
  /** Evidence as shown to the student — snapped to the student's original words. */
  evidence: string[];
  /** Share of the model's quotes that matched the response EXACTLY (before snapping). */
  grounded: number;
  /** Share that matched exactly or could be snapped to an original span. */
  groundedAfterSnap: number;
  comment: string;
  score: number;
  /** Score before a deterministic cap (only set when a cap lowered it). */
  uncapped?: number;
}

export type { ErrorKind, ErrorCategory };

export interface LanguageError {
  /** Display group (colour). Derived from `category`. */
  kind: ErrorKind;
  /** Taxonomy category → curated explanation in grammarGuide.ts. */
  category: ErrorCategory;
  /** One-line reason specific to this sentence (model or rule); may be empty. */
  why: string;
  /** Shown text: the student's original words (snapped if the model paraphrased). */
  quote: string;
  correction: string;
  /** Whether the model's quote occurred exactly in the response. */
  grounded: boolean;
  /** Whether `quote` is a real span of the response (exact or snapped). */
  located: boolean;
  /** Who found it: the LLM, a deterministic rule (rules.ts) or the grammar model (GECToR). */
  source: "llm" | "rule" | "gec" | "teacher";
  /** Character span in the response (−1 if not located) — used to dedupe and order items. */
  start: number;
  end: number;
}

export interface RequiredPoint {
  point: string;
  status: "covered" | "partial" | "missing";
  /** The email's own sentence that addresses the point (separate check, points.ts). */
  evidence?: string;
  /** Korean translation of `point` for display. */
  pointKo?: string;
  /** The check call failed — treated as covered, never capped. */
  failed?: boolean;
}

export interface ResponseAnalysis {
  mainPoint: string;
  supportGiven: string[];
  notAddressed: string;
}

export interface LlmEvaluation {
  version: PromptVersion;
  criteria: CriterionResult[];
  errors: LanguageError[];
  /** v3+: what the model read in the response before judging it. */
  analysis: ResponseAnalysis | null;
  /** v4, email: whether each required bullet point was addressed. */
  points: RequiredPoint[] | null;
  /** v4: human-readable (Korean) reasons for score caps that were applied. */
  caps: string[];
  wordCount: number;
  /** Feedback texts left in English because translation failed validation. */
  untranslated?: number;
  /** v4: measured language indicators (features.ts). */
  features?: LanguageFeatures;
  /** v4: Korean notes on adjustments made by the measured-features consistency check. */
  adjustments?: string[];
  overallFeedback: string;
  total: number;
  max: number;
  /** Estimated TOEFL 2026 band, 1.0–6.0. */
  band: number;
  latencyMs: number;
  modelId: string;
  /** Number of LLM samples combined (median) into this result. */
  samples: number;
  raw: string;
}

export type FeedbackLang = "ko" | "en";
export type PromptVersion = "v1" | "v2" | "v3" | "v4";
/** LLM correction categories kept when the grammar model ran (verified again in verify.ts). */
export const LLM_CATEGORIES_WITH_GEC = new Set<ErrorCategory>(["word_choice", "register", "run_on", "possessive", "word_form"]);
const categoryOfError = (e: LanguageError): ErrorCategory => e.category ?? categoryFromKind(e.kind);

export const DEFAULT_PROMPT_VERSION: PromptVersion = "v4";

/** Required bullet points of an email task ("- describe the problem"). */
export function requiredPoints(prompt: string): string[] {
  return prompt
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^[-•*]\s+/.test(l))
    .map((l) => l.replace(/^[-•*]\s+/, ""));
}

const FILLERS = new Set(["um", "uh", "erm", "er", "hmm", "uhm", "ah"]);

/** Fluency proxies from the transcript; pronunciation itself is not assessed. */
export function speakingStats(transcript: string, durationSeconds: number): SpeakingStats {
  const words = normalizeWords(transcript);
  const fillers = words.filter((w) => FILLERS.has(w)).length;
  const minutes = Math.max(durationSeconds, 1) / 60;
  return {
    durationSeconds,
    words: words.length,
    wordsPerMinute: Math.round(words.length / minutes),
    fillers,
  };
}

// ------------------------------------------------------------------ schema

function criterionSchema(maxComment: number) {
  return {
    type: "object",
    properties: {
      evidence: { type: "array", items: { type: "string", maxLength: 160 }, minItems: 1, maxItems: 3 },
      comment: { type: "string", maxLength: maxComment },
      score: { type: "integer", enum: [0, 1, 2, 3, 4, 5] },
    },
    required: ["evidence", "comment", "score"],
    additionalProperties: false,
  };
}

/** JSON schema whose key order fixes the generation order (serde_json preserve_order). */
export function evaluationSchema(
  criteria: Criterion[],
  version: PromptVersion = DEFAULT_PROMPT_VERSION,
  opts: { requiredPoints?: number } = {},
) {
  const properties: Record<string, unknown> = {};
  if (version !== "v1") {
    // Errors come FIRST so the language score is anchored to concrete mistakes.
    const itemProps: Record<string, unknown> =
      version === "v4"
        ? {
            category: { type: "string", enum: CATEGORIES },
            quote: { type: "string", maxLength: 120 },
            correction: { type: "string", maxLength: 140 },
            why: { type: "string", maxLength: 160 },
          }
        : version === "v3"
          ? {
              kind: { type: "string", enum: ["grammar", "sentence", "word_choice", "register"] },
              quote: { type: "string", maxLength: 120 },
              correction: { type: "string", maxLength: 140 },
            }
          : { quote: { type: "string", maxLength: 120 }, correction: { type: "string", maxLength: 140 } };
    properties.errors = {
      type: "array",
      items: {
        type: "object",
        properties: itemProps,
        required: Object.keys(itemProps),
        additionalProperties: false,
      },
      minItems: 0,
      // v3: rules now cover fragments/register/vague words, so 6 LLM items are enough and
      // the shorter output is noticeably faster.
      maxItems: 6,
    };
  }
  if (version === "v3" || version === "v4") {
    // Comprehension before judgment: what does the response actually say?
    const n = version === "v4" ? opts.requiredPoints ?? 0 : 0;
    const analysisProps: Record<string, unknown> = {
      main_point: { type: "string", maxLength: 200 },
      support_given: { type: "array", items: { type: "string", maxLength: 200 }, minItems: 0, maxItems: 4 },
      not_addressed: { type: "string", maxLength: 200 },
    };
    if (n > 0) {
      analysisProps.required_points = {
        type: "array",
        items: {
          type: "object",
          properties: {
            point: { type: "string", maxLength: 100 },
            status: { type: "string", enum: ["covered", "partial", "missing"] },
          },
          required: ["point", "status"],
          additionalProperties: false,
        },
        minItems: n,
        maxItems: n,
      };
    }
    properties.analysis = {
      type: "object",
      properties: analysisProps,
      required: Object.keys(analysisProps),
      additionalProperties: false,
    };
  }
  for (const c of criteria) properties[c.key] = criterionSchema(version === "v1" ? 320 : 260);
  properties.overall_feedback = { type: "string", maxLength: version === "v1" ? 600 : 400 };
  const head = version === "v1" ? [] : version === "v2" ? ["errors"] : ["errors", "analysis"];  // v3, v4
  return {
    type: "object",
    properties,
    required: [...head, ...criteria.map((c) => c.key), "overall_feedback"],
    additionalProperties: false,
  };
}

// ------------------------------------------------------------------ prompt

function rubricText(criteria: Criterion[]): string {
  return criteria
    .map(
      (c) =>
        `### ${c.key} — ${c.name}\n` +
        `5: ${c.anchors[5]}\n3: ${c.anchors[3]}\n1: ${c.anchors[1]}\n` +
        `(4 and 2 fall between the anchors; 0 = no response or entirely off-task.)`,
    )
    .join("\n\n");
}

const SCALE_V2 = [
  "Score scale (all criteria):",
  "5 = excellent, only minor slips · 4 = good, clear with some weaknesses · 3 = adequate, meaning clear but noticeable problems",
  "2 = limited, problems often get in the way · 1 = very weak, hard to follow or barely on task · 0 = no response / off-task",
  "Calibration: most intermediate learners score 2–4. Give 1 only when the response is very short, mostly off-task, or hard to understand.",
  "Grammar mistakes alone do not lower Contribution or Support scores — judge each criterion separately.",
].join("\n");

/** v3: every block is wrapped in a tag so the model cannot mix up who wrote what. */
function taskTextTagged(task: ScorableTask, response: string, stats?: SpeakingStats): string {
  const spec = TASK_SPECS[task.taskType];
  const parts = [`<task type="${spec.label}">`, task.prompt.trim(), "</task>"];
  if (task.material?.trim()) {
    parts.push(
      "",
      "<classmates_posts>  (written by OTHER students — never quote or score these)",
      task.material.trim(),
      "</classmates_posts>",
    );
  }
  if (stats) {
    parts.push(
      "",
      "<speech_statistics>",
      `duration: ${stats.durationSeconds.toFixed(0)} s · words: ${stats.words} · words per minute: ${stats.wordsPerMinute} · filler words: ${stats.fillers}`,
      "The student response is an automatic transcript: judge delivery from these numbers and from hesitations or fragments in it; ignore its spelling and punctuation.",
      "</speech_statistics>",
    );
  }
  parts.push("", "<student_response>", response.trim() || "(no response)", "</student_response>");
  return parts.join("\n");
}

/**
 * v4: grammar errors already found by the GECToR model. The LLM uses them for Language Use
 * and spends its own `errors` on what the grammar model cannot judge (tone, word choice,
 * sentence structure) — shorter output, fewer wrong "corrections".
 */
function gecBlock(gec?: GecEdit[]): string {
  if (!gec?.length) return "";
  const lines = gec.map((e) => `- "${e.original}" → "${e.corrected || "(delete)"}"`).join("\n");
  return (
    "\n\n<detected_grammar_errors>  (found by a grammar-correction model — count them when scoring Language Use; do NOT list them again in `errors`)\n" +
    lines +
    "\n</detected_grammar_errors>"
  );
}

function taskText(task: ScorableTask, response: string, stats?: SpeakingStats): string {
  const spec = TASK_SPECS[task.taskType];
  const parts = [`## Task (${spec.label})`, task.prompt.trim()];
  if (task.material?.trim()) parts.push("", "## Classmates' posts / material", task.material.trim());
  if (stats) {
    parts.push(
      "",
      "## Speech statistics (from the recording)",
      `duration: ${stats.durationSeconds.toFixed(0)} s · words: ${stats.words} · words per minute: ${stats.wordsPerMinute} · filler words: ${stats.fillers}`,
      "The response below is an automatic transcript. Judge delivery from these statistics and from hesitations, repetitions or fragments visible in the transcript. Do not penalise spelling or punctuation of the transcript.",
    );
  }
  parts.push("", "## Student's response", response.trim() || "(no response)");
  return parts.join("\n");
}

/**
 * What an experienced TOEFL teacher looks for in Korean learners' writing. Derived from the
 * teacher's notes on the lab sample (fragment "Because …", subject–verb agreement,
 * "so" → "therefore/thus", vague "thing"/"some", missing possessive, shallow reasons).
 * Examples are deliberately NOT taken from the lab sample, so the lab does not reward the
 * model for copying the prompt (data leakage). Validate on held-out responses too.
 */
const ERROR_CHECKLIST = [
  "Check especially for (kind in brackets):",
  "- [grammar] subject–verb agreement (e.g. \"the people is\" → \"the people are\"), articles (a/the), plurals, possessives (e.g. \"my friend opinion\" → \"my friend's opinion\"), comparatives (e.g. \"more cheap\" → \"cheaper\").",
  "- [sentence] fragments — e.g. a sentence that begins with Because/Although/Since and has no main clause; run-on sentences.",
  "- [register] informal connectors in academic writing: \"so\" → \"therefore/thus\", sentence-initial \"But\" → \"However,\", \"Also,\" → \"In addition,\".",
  "- [word_choice] vague or weak words with a more precise alternative (e.g. \"thing\", \"stuff\", \"some\", \"very\", \"good\", \"a lot of\").",
].join("\n");

export function buildEvaluationMessages(
  task: ScorableTask,
  response: string,
  opts: { lang: FeedbackLang; stats?: SpeakingStats; version?: PromptVersion; gec?: GecEdit[]; features?: string },
): ChatMessage[] {
  const spec = TASK_SPECS[task.taskType];
  const version = opts.version ?? DEFAULT_PROMPT_VERSION;

  if (version === "v1") {
    const langLine =
      opts.lang === "ko"
        ? "Write every `comment` and `overall_feedback` in Korean (한국어), addressed to the student. Keep evidence quotes in the original English."
        : "Write every `comment` and `overall_feedback` in English, addressed to the student.";
    const system = [
      `You are an experienced, strict rater of English ${spec.section} responses for TOEFL iBT-style practice (task: ${spec.label}).`,
      `Score each criterion from 0 to ${SCALE_MAX} using ONLY the rubric below.`,
      "For each criterion, in this order:",
      "1. evidence: copy 1–3 short phrases EXACTLY as they appear in the student's response that justify your score (verbatim, no paraphrasing, no corrections).",
      "2. comment: one or two sentences explaining the score and one concrete way to improve.",
      "3. score: an integer 0–5.",
      "Do not reward length alone. Do not invent content that is not in the response.",
      langLine,
      "",
      "## Rubric",
      rubricText(spec.criteria),
    ].join("\n");
    return [
      { role: "system", content: system },
      { role: "user", content: taskText(task, response, opts.stats) },
    ];
  }

  if (version === "v4") {
    const points = task.taskType === "email" ? requiredPoints(task.prompt) : [];
    const system = [
      `You are an experienced, fair rater of English ${spec.section} responses for TOEFL iBT-style practice (task: ${spec.label}).`,
      "Only the text inside <student_response> is the student's work. Quote ONLY from it.",
      "Work in this order:",
      opts.gec != null
        ? `1. errors: grammar (agreement, articles, plurals, verb forms, prepositions, fragments, spelling) has ALREADY been checked by a grammar model — do NOT list any of that. List only up to 3 clear word_choice, register, run_on or possessive problems that a teacher would mark wrong. Style preferences are NOT errors: if the original is correct and natural, leave it. An empty list is normal for a good response. For each: category (one of: ${TAXONOMY_PROMPT}); quote = the exact words from <student_response> (2–10 words); correction = the same words, corrected; why = ONE short sentence naming what is wrong in THIS sentence.`
        : `1. errors: up to 6 real errors, most important first. For each: category (one of: ${TAXONOMY_PROMPT}); quote = the exact words from <student_response> (2–10 words); correction = the same words, corrected; why = ONE short sentence naming what is wrong in THIS sentence (e.g. "'students' is plural, so the verb must be 'are'"). Never list text that is already correct.`,
      "2. analysis — read before you judge:",
      "   main_point: the student's position or purpose in one sentence.",
      "   support_given: each reason or example the student actually gives (one short line each). A personal story with details IS a specific example.",
      "   not_addressed: what the task asks for that is missing, ideas only repeated from <classmates_posts>, and reasons that are stated but not explained.",
      points.length
        ? `   The email must do ${points.length} things: ${points.map((p, i) => `(${i + 1}) ${p}`).join(" ")}. Mention in not_addressed any that is missing or too thin. A question like 'Could you tell me when …?' counts as asking.`
        : "",
      `3. For each criterion: evidence (1–3 phrases copied exactly from <student_response>), comment (mention specific content from THIS response and how to improve; never copy rubric wording), score (integer 0–${SCALE_MAX}).`,
      "   Scores must agree with your analysis.",
      "4. overall_feedback: the main strength, then the single most useful thing to work on (two or three sentences).",
      "Use the FULL scale. A very short, incomplete or impolite response belongs at 0–2, not 3. Reserve 5 for responses like the strong example.",
      "Talk to the student directly ('You …', 'Your example …'). Never write 'the response', 'the student' or 'the writer'. Write short, clear, simple English sentences (they will be translated into Korean).",
      "",
      SCALE_V2,
      "",
      "## Rubric",
      rubricText(spec.criteria),
      "",
      anchorText(task.taskType),
    ]
      .filter((l) => l !== "")
      .join("\n");
    return [
      { role: "system", content: system },
      {
        role: "user",
        content: taskTextTagged(task, response, opts.stats) + gecBlock(opts.gec) + (opts.features ? `\n\n${opts.features}` : ""),
      },
    ];
  }

  if (version === "v3") {
    const system = [
      `You are an experienced, fair rater of English ${spec.section} responses for TOEFL iBT-style practice (task: ${spec.label}).`,
      "Only the text inside <student_response> is the student's work. Quote ONLY from it.",
      "Work in this order:",
      "1. errors: up to 6 items, most important first. `kind` = grammar | sentence | word_choice | register; `quote` = exact words from <student_response> (2–10 words); `correction` = the improved words. Never list text that cannot be improved.",
      ERROR_CHECKLIST,
      "2. analysis — read before you judge:",
      "   main_point: the student's position or purpose in one sentence.",
      "   support_given: each reason or example the student actually gives (one short line each). A personal story with details (a class, a time, what happened) IS a specific example.",
      "   Also judge depth: does the student explain WHY each reason matters, or only state it? Mention shallow reasons in not_addressed.",
      "   not_addressed: what the task asks for that the response misses, or ideas it only repeats from <classmates_posts>. Write 'nothing important' if fully covered.",
      `3. For each criterion: evidence (1–3 phrases copied exactly from <student_response>), comment, score (integer 0–${SCALE_MAX}).`,
      "   The comment must mention specific content from THIS response (use your analysis) and say how to improve. Never copy wording from the rubric.",
      "   The score must agree with your analysis: if support_given lists a specific example, Support cannot be below 3.",
      "4. overall_feedback: the main strength, then the single most useful thing to work on (two or three sentences).",
      "Address the student as 'you'. Write in clear, simple English.",
      "",
      SCALE_V2,
      "",
      "## Rubric",
      rubricText(spec.criteria),
    ].join("\n");
    return [
      { role: "system", content: system },
      { role: "user", content: taskTextTagged(task, response, opts.stats) },
    ];
  }

  // v2 — always reasons in English; translation is a separate step.
  const system = [
    `You are an experienced, fair rater of English ${spec.section} responses for TOEFL iBT-style practice (task: ${spec.label}).`,
    "Work in this order:",
    "1. errors: list up to 6 of the most important grammar or word-choice errors. `quote` = the exact words from the response (copy them verbatim, 2–8 words); `correction` = the corrected words. Use an empty list if there are none. Never list something that is already correct.",
    `2. For each criterion: evidence (1–3 phrases copied EXACTLY from the response), then comment (one sentence on why, one sentence on how to improve — be specific to THIS response), then score (integer 0–${SCALE_MAX}).`,
    "3. overall_feedback: two or three sentences: the main strength, then the single most useful thing to work on.",
    "Address the student as 'you'. Write in clear, simple English. Do not invent content that is not in the response.",
    "",
    SCALE_V2,
    "",
    "## Rubric",
    rubricText(spec.criteria),
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: taskText(task, response, opts.stats) },
  ];
}

// ------------------------------------------------------------------ parsing

/** Share of quotes that really occur in the response (word-normalized substring match). */
export function groundedShare(quotes: string[], response: string): number {
  if (quotes.length === 0) return 0;
  return quotes.filter((q) => occursIn(q, response)).length / quotes.length;
}

function occursIn(quote: string, response: string): boolean {
  const hay = ` ${normalizeWords(response).join(" ")} `;
  const needle = normalizeWords(quote).join(" ");
  return needle.length > 0 && hay.includes(` ${needle} `);
}

export function parseEvaluation(
  raw: string,
  task: ScorableTask,
  response: string,
  meta: { latencyMs: number; modelId: string; version: PromptVersion; gec?: GecEdit[]; caps?: boolean },
): LlmEvaluation {
  const spec = TASK_SPECS[task.taskType];
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`채점 결과 JSON 파싱 실패:\n${raw.slice(0, 500)}`);
  }
  const criteria: CriterionResult[] = spec.criteria.map((c) => {
    const item = (data[c.key] ?? {}) as { evidence?: unknown; comment?: unknown; score?: unknown };
    const quotes = Array.isArray(item.evidence) ? item.evidence.map(String) : [];
    const snaps = quotes.map((q) => snapQuote(q, response));
    const score = Math.min(SCALE_MAX, Math.max(0, Math.round(Number(item.score) || 0)));
    return {
      key: c.key,
      name: c.name,
      nameKo: c.nameKo,
      // Unlocatable quotes are dropped from what the student sees.
      evidence: snaps.filter((x) => x.found).map((x) => x.text),
      grounded: groundedShare(quotes, response),
      groundedAfterSnap: quotes.length ? snaps.filter((x) => x.found).length / quotes.length : 0,
      comment: String(item.comment ?? ""),
      score,
    };
  });
  const llmErrors: LanguageError[] = (Array.isArray(data.errors) ? data.errors : [])
    .map((e) => e as { kind?: unknown; category?: unknown; quote?: unknown; correction?: unknown; why?: unknown })
    .map((e) => {
      const category: ErrorCategory = CATEGORIES.includes(e.category as ErrorCategory)
        ? (e.category as ErrorCategory)
        : categoryFromKind(e.kind as string | undefined);
      return {
        category,
        kind: KIND_OF(category),
        why: String(e.why ?? ""),
        quote: String(e.quote ?? ""),
        correction: String(e.correction ?? ""),
      };
    })
    .filter((e) => e.quote)
    // Snap BEFORE judging no-ops: models often quote the corrected form ("students are
    // understanding" → itself); snapping recovers the real error ("students is understanding").
    .map((e): LanguageError => {
      const snap = snapQuote(e.quote, response);
      return {
        ...e,
        quote: snap.found ? snap.text : e.quote,
        grounded: occursIn(e.quote, response),
        located: snap.found,
        source: "llm",
        start: snap.start,
        end: snap.end,
      };
    })
    // After snapping, a "correction" equal to the original text is not a correction.
    .filter((e) => normalizeWords(e.quote).join(" ") !== normalizeWords(e.correction).join(" "))
    // Narrow to the changed words, fix article/preposition categories, drop multi-sentence
    // spans and (when the grammar model ran) pure deletions — see tidy.ts.
    .flatMap((e): LanguageError[] => {
      if (!e.located) return [e];
      const t = tidyLlmCorrection(response, e, { gecRan: meta.gec != null });
      return t ? [{ ...e, ...t, kind: KIND_OF(t.category) }] : [];
    })
    // Precision first: when the grammar model ran, grammar belongs to it (and to the rules).
    // The LLM invented agreement/fragment "errors" in correct sentences (2026-11-06, AD 3).
    .filter((e) => meta.gec == null || LLM_CATEGORIES_WITH_GEC.has(categoryOfError(e)));

  // Hybrid (v2+): deterministic rules for what the LLM reliably misses.
  const rules: LanguageError[] =
    meta.version === "v1"
      ? []
      : detectRuleIssues(response, task.taskType).map((r) => {
          const snap = snapQuote(r.quote, response, 0.99);
          // A fragment quote starts with the previous sentence's last words purely as
          // context; the error itself begins at "Because …".
          const ctx = r.rule === "fragment" && snap.start >= 0 ? r.quote.indexOf(". ") + 2 : 0;
          return {
            kind: r.kind,
            category: r.category,
            why: r.why,
            quote: r.quote,
            correction: r.correction,
            grounded: true,
            located: true,
            source: "rule" as const,
            start: snap.start + ctx,
            end: snap.end,
          };
        });
  const gecErrors: LanguageError[] = joinAdjacentGec(meta.gec ?? [], response).map((g) => {
    const m = mapJoinedGec(g, response);
    const span = displaySpan(response, g);
    return {
      kind: KIND_OF(m.category),
      category: m.category,
      why: m.why,
      quote: span.quote,
      correction: span.correction,
      grounded: true,
      located: true,
      source: "gec" as const,
      start: span.start,
      end: span.end,
    };
  });
  const errors = mergeCorrections(rules, llmErrors, gecErrors);
  const a = data.analysis as
    | { main_point?: unknown; support_given?: unknown; not_addressed?: unknown; required_points?: unknown }
    | undefined;
  const analysis: ResponseAnalysis | null = a
    ? {
        mainPoint: String(a.main_point ?? ""),
        supportGiven: Array.isArray(a.support_given) ? a.support_given.map(String) : [],
        notAddressed: String(a.not_addressed ?? ""),
      }
    : null;
  // Email: use the task's own bullet text (the model only judges status).
  const bullets = task.taskType === "email" ? requiredPoints(task.prompt) : [];
  const points: RequiredPoint[] | null =
    meta.version === "v4" && bullets.length && Array.isArray(a?.required_points)
      ? bullets.map((point, i) => {
          const st = (a!.required_points as { status?: unknown }[])[i]?.status;
          return { point, status: st === "covered" || st === "partial" || st === "missing" ? st : "missing" };
        })
      : null;

  const wordCount = normalizeWords(response).length;
  const caps = meta.version === "v4" && meta.caps !== false ? applyCaps(criteria, task, wordCount, points, { response, errors }) : [];

  return finalize(
    {
      version: meta.version,
      criteria,
      errors,
      analysis,
      points,
      caps,
      wordCount,
      overallFeedback: String(data.overall_feedback ?? ""),
      latencyMs: meta.latencyMs,
      modelId: meta.modelId,
      samples: 1,
      raw,
    },
  );
}

/**
 * Deterministic score caps (v4). The model alone gave a 55-word, demanding email 3/5 on
 * every criterion; length and required-point coverage are facts we can check ourselves.
 *  - words < 50% of the task minimum → content criteria ≤ 1;  < 80% → ≤ 2
 *  - email: missing required points (partial = ½) ≥ 2 → task ≤ 2; ≥ 1 → ≤ 3; ½ → ≤ 4
 *  - email: demanding-tone phrases (rules.ts TONE) ≥ 2 → tone ≤ 2; 1 → ≤ 3
 *  - writing: grammar errors found by the grammar model / rules (not the LLM) per 100 words
 *    ≥ 8 → language ≤ 2; ≥ 4 → ≤ 3   (ES-1: the 7B gave error-heavy emails Language 3–4)
 * Thresholds are provisional (ES-1, 8 teacher scores) — refit with more teacher data.
 * Mutates `criteria` (keeps the model's score in `uncapped`) and returns Korean reasons.
 */
export function applyCaps(
  criteria: CriterionResult[],
  task: ScorableTask,
  wordCount: number,
  points: RequiredPoint[] | null,
  ctx: { response?: string; errors?: LanguageError[] } = {},
): string[] {
  const spec = TASK_SPECS[task.taskType];
  const reasons: string[] = [];
  const cap = (key: string, max: number) => {
    const c = criteria.find((x) => x.key === key);
    if (c && c.score > max) {
      c.uncapped ??= c.score;
      c.score = max;
    }
  };
  if (spec.minWords && spec.contentCriteria?.length) {
    const ratio = wordCount / spec.minWords;
    const max = ratio < 0.5 ? 1 : ratio < 0.8 ? 2 : null;
    if (max != null) {
      spec.contentCriteria.forEach((k) => cap(k, max));
      reasons.push(
        `분량 부족: ${wordCount}단어 (권장 최소 ${spec.minWords}단어의 ${Math.round(ratio * 100)}%) → 내용 항목 최대 ${max}점`,
      );
    }
  }
  if (points?.length) {
    const missing = points.reduce((s, p) => s + (p.status === "missing" ? 1 : p.status === "partial" ? 0.5 : 0), 0);
    const max = missing >= 2 ? 2 : missing >= 1 ? 3 : missing > 0 ? 4 : null;
    if (max != null) {
      cap("task", max);
      reasons.push(`요구사항 ${points.length}개 중 일부를 다루지 않음 → 과제 수행 최대 ${max}점`);
    }
  }
  if (task.taskType === "email" && ctx.response) {
    const hits = detectToneIssues(ctx.response).length;
    const max = hits >= 2 ? 2 : hits === 1 ? 3 : null;
    if (max != null) {
      cap("tone", max);
      reasons.push(`요구·명령조 표현 ${hits}개 → 구성 · 어조 최대 ${max}점`);
    }
  }
  if (spec.section === "writing" && ctx.errors && wordCount >= 20) {
    const n = ctx.errors.filter((e) => e.source !== "llm" && (e.kind === "grammar" || e.kind === "sentence")).length;
    const per100 = (n / wordCount) * 100;
    const max = per100 >= 8 ? 2 : per100 >= 4 ? 3 : null;
    if (max != null) {
      cap("language", max);
      reasons.push(`문법 오류 ${n}개 (100단어당 ${per100.toFixed(1)}개) → 언어 사용 최대 ${max}점`);
    }
  }
  return reasons;
}

/**
 * Two items describe the same problem if they overlap by ≥ 60% of the shorter span.
 * Merely touching (sharing one word, e.g. "so she" and "she … more easy examples") is not
 * a duplicate — both corrections are useful.
 */
const overlaps = (a: LanguageError, b: LanguageError) => {
  if (a.start < 0 || b.start < 0) return false;
  const shared = Math.min(a.end, b.end) - Math.max(a.start, b.start);
  const shorter = Math.min(a.end - a.start, b.end - b.start);
  return shared > 0 && shorter > 0 && shared / shorter >= 0.6;
};

/**
 * One item per place in the text. Rules are accepted first (exact, deterministic); then LLM
 * items from most to least specific (shortest span first), skipping any that overlap an
 * accepted item — so "students is understanding" survives but a whole-sentence rewrite that
 * also covers the rule-detected fragment does not. Result is in reading order.
 */
/**
 * Duplicate = overlapping AND describing the same thing: same category, or spans of similar
 * size. A small grammar fix inside a longer tone rewrite ("want" → "want an" inside
 * "I want answer quickly" → "I would appreciate a quick reply") is a different problem —
 * both are kept.
 */
const duplicates = (a: LanguageError, b: LanguageError) => {
  if (!overlaps(a, b)) return false;
  if (a.category === b.category) return true;
  const la = a.end - a.start;
  const lb = b.end - b.start;
  return Math.max(la, lb) <= 2 * Math.min(la, lb);
};

export function mergeCorrections(rules: LanguageError[], llm: LanguageError[], gec: LanguageError[] = []): LanguageError[] {
  const accepted: LanguageError[] = [];
  for (const r of rules) if (!accepted.some((a) => overlaps(a, r))) accepted.push(r);
  // Grammar model next: trained on learner errors, exact spans, category decided by its tag.
  // A rule that rewrites a whole phrase ("I want answer quickly" → "I would appreciate a reply
  // …") supersedes a grammar-model edit inside it whose words the rewrite no longer contains
  // ("want → want to", which also misreads "want answer" as a missing infinitive).
  const superseded = (g: LanguageError) =>
    rules.some((r) => {
      if (r.start < 0 || g.start < r.start || g.end > r.end) return false;
      const kept = new Set(normalizeWords(r.correction));
      return !normalizeWords(g.quote).every((w) => kept.has(w));
    });
  for (const g of gec) if (!superseded(g) && !accepted.some((a) => duplicates(a, g))) accepted.push(g);
  const bySpecificity = [...llm].sort((a, b) => (a.end - a.start) - (b.end - b.start));
  for (const e of bySpecificity) {
    if (e.start < 0) {
      // Unlocatable quote: keep it (flagged red in the UI) unless it duplicates text already listed.
      if (!accepted.some((a) => normalizeWords(a.quote).join(" ") === normalizeWords(e.quote).join(" "))) accepted.push(e);
      continue;
    }
    if (!accepted.some((a) => (gec.length ? duplicates(a, e) : overlaps(a, e)))) accepted.push(e);
  }
  return accepted.sort((a, b) => (a.start < 0 ? 1e9 : a.start) - (b.start < 0 ? 1e9 : b.start));
}

function finalize(e: Omit<LlmEvaluation, "total" | "max" | "band">): LlmEvaluation {
  const total = e.criteria.reduce((s, c) => s + c.score, 0);
  const max = e.criteria.length * SCALE_MAX;
  return { ...e, total, max, band: toBand(max ? total / max : 0) };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Combine several samples: per-criterion MEDIAN score; feedback text is taken from the
 * sample whose total is closest to the combined total, so text and numbers agree.
 */
export function combineSamples(samples: LlmEvaluation[]): LlmEvaluation {
  if (samples.length === 1) return samples[0];
  const criteria = samples[0].criteria.map((c, k) => ({
    ...c,
    score: median(samples.map((s) => s.criteria[k].score)),
  }));
  const total = criteria.reduce((s, c) => s + c.score, 0);
  const rep = samples.reduce((best, s) => (Math.abs(s.total - total) < Math.abs(best.total - total) ? s : best));
  return finalize({
    ...rep,
    criteria: criteria.map((c, k) => ({ ...rep.criteria[k], score: c.score })),
    samples: samples.length,
    latencyMs: samples.reduce((s, x) => s + x.latencyMs, 0),
  });
}

// ------------------------------------------------------------------ translation

/** Translate comments + overall feedback to Korean in one constrained call (v2). */
export async function translateToKorean(e: LlmEvaluation): Promise<LlmEvaluation> {
  // Rule and grammar-model reasons are already Korean; only the LLM's English texts are sent.
  // One call per text, validated (see translate.ts) — failures fall back to English.
  const whyIdx = e.errors.map((x, i) => (x.source === "llm" && x.why ? i : -1)).filter((i) => i >= 0);
  const pts = e.points ?? [];
  const texts = [...e.criteria.map((c) => c.comment), e.overallFeedback, ...whyIdx.map((i) => e.errors[i].why), ...pts.map((p) => p.point)];
  const ko = await translateMany(texts);
  const n = e.criteria.length;
  const errors = [...e.errors];
  whyIdx.forEach((errIdx, k) => {
    errors[errIdx] = { ...errors[errIdx], why: ko[n + 1 + k].text };
  });
  const p0 = n + 1 + whyIdx.length;
  return {
    ...e,
    points: e.points ? e.points.map((p, k) => ({ ...p, pointKo: ko[p0 + k].ok ? ko[p0 + k].text : undefined })) : null,
    criteria: e.criteria.map((c, i) => ({ ...c, comment: ko[i].text })),
    overallFeedback: ko[n].text,
    errors,
    untranslated: ko.slice(0, p0).filter((t) => !t.ok).length,
  };
}

// ------------------------------------------------------------------ entry points

/**
 * Apply caps to a combined result. Capping after the median equals the median of capped
 * samples (min is monotonic), and lets the separate required-point check feed in.
 */
export function finishWithCaps(e: LlmEvaluation, task: ScorableTask, response: string, points: RequiredPoint[] | null): LlmEvaluation {
  const criteria = e.criteria.map((c) => ({ ...c, uncapped: undefined }));
  let features: LanguageFeatures | undefined;
  const adjustments: string[] = [];
  if (e.version === "v4") {
    // Measured language indicators, with the FINAL error list (grammar model + rules only —
    // LLM items are not counted, same rule as the error-density cap).
    const errorCount = e.errors.filter((x) => x.source === "gec" || x.source === "rule").length;
    features = measure(response, { minWords: TASK_SPECS[task.taskType].minWords, errorCount });
    // Consistency check: when the LLM's Language score is far (≥ 1.5) from the measured
    // indicators, move it ONE point toward them. The LLM still decides; the numbers stop
    // outliers (seen: a 55-word email full of errors given Language 3–4).
    const lang = criteria.find((c) => c.key === "language");
    if (lang) {
      const diff = features.languageScore - lang.score;
      if (Math.abs(diff) >= 1.5) {
        const to = Math.min(SCALE_MAX, Math.max(0, lang.score + Math.sign(diff)));
        adjustments.push(
          `언어 지표 평균 ${features.languageScore.toFixed(1)}점과 AI 판단 ${lang.score}점의 차이가 커서 언어 사용 점수를 ${lang.score} → ${to}점으로 조정했어요.`,
        );
        lang.score = to;
      }
    }
  }
  const caps = e.version === "v4" ? applyCaps(criteria, task, e.wordCount, points, { response, errors: e.errors }) : [];
  return finalize({ ...e, criteria, caps, points: points ?? e.points, features, adjustments });
}

/** One LLM sample (no translation, no combining). Exposed for the scoring lab. */
export async function evaluateOnce(
  task: ScorableTask,
  response: string,
  opts: {
    modelId: string;
    lang?: FeedbackLang;
    stats?: SpeakingStats;
    version?: PromptVersion;
    gec?: GecEdit[];
    caps?: boolean;
    features?: string;
  },
): Promise<LlmEvaluation> {
  const spec = TASK_SPECS[task.taskType];
  if (spec.scoring !== "llm") throw new Error(`${spec.label} is not LLM-scored`);
  const version = opts.version ?? DEFAULT_PROMPT_VERSION;
  await api.llmStart(opts.modelId);
  const messages = buildEvaluationMessages(task, response, {
    lang: opts.lang ?? "ko",
    stats: opts.stats,
    version,
    gec: opts.gec,
    features: opts.features,
  });
  const t0 = performance.now();
  // Required points are checked separately (points.ts), not inside this long JSON.
  const raw = await api.llmChat(messages, evaluationSchema(spec.criteria, version));
  return parseEvaluation(raw, task, response, {
    caps: opts.caps,
    gec: opts.gec,
    latencyMs: Math.round(performance.now() - t0),
    modelId: opts.modelId,
    version,
  });
}

/**
 * Production scoring: `samples` LLM runs (default 3) → per-criterion median →
 * (v2 + Korean) one translation call.
 */
export async function evaluateResponse(
  task: ScorableTask,
  response: string,
  opts: {
    modelId: string;
    lang?: FeedbackLang;
    stats?: SpeakingStats;
    version?: PromptVersion;
    samples?: number;
    gec?: GecEdit[];
    onProgress?: (stage: "loading" | "scoring" | "translating") => void;
  },
): Promise<LlmEvaluation> {
  const n = Math.max(1, opts.samples ?? 3);
  // Start (or reuse) the server ONCE, then send all samples concurrently: llama-server runs
  // them in parallel slots (--parallel 3), which on a GPU costs far less than 3× one run.
  opts.onProgress?.("loading");
  await api.llmStart(opts.modelId);
  opts.onProgress?.("scoring");
  const wall0 = performance.now();
  const version = opts.version ?? DEFAULT_PROMPT_VERSION;
  const bullets = version === "v4" && task.taskType === "email" ? requiredPoints(task.prompt) : [];
  // Indicators the LLM sees before judging (error count = grammar model + rules, as in the cap).
  const pre =
    version === "v4"
      ? featuresBlock(
          measure(response, {
            minWords: TASK_SPECS[task.taskType].minWords,
            errorCount: (opts.gec?.length ?? 0) + detectRuleIssues(response, task.taskType).length,
          }),
        )
      : undefined;
  const [runs, points] = await Promise.all([
    Promise.all(Array.from({ length: n }, () => evaluateOnce(task, response, { ...opts, caps: false, features: pre }))),
    bullets.length ? checkRequiredPoints(task.prompt, response, bullets) : Promise.resolve(null),
  ]);
  let result = { ...finishWithCaps(combineSamples(runs), task, response, points), latencyMs: Math.round(performance.now() - wall0) };
  // Second opinion on each remaining LLM correction (concurrent, short calls); keeps only
  // the ones judged actually wrong or clearly unnatural.
  if (version === "v4") result = { ...result, errors: await verifyLlmCorrections(result.errors, response) };
  if ((opts.version ?? DEFAULT_PROMPT_VERSION) !== "v1" && (opts.lang ?? "ko") === "ko") {
    opts.onProgress?.("translating");
    const t0 = performance.now();
    result = await translateToKorean(result);
    result = { ...result, latencyMs: result.latencyMs + Math.round(performance.now() - t0) };
  }
  return result;
}

/** A model answer the student can compare with their own. Plain text. */
export async function generateSampleAnswer(task: ScorableTask, modelId: string): Promise<string> {
  const spec = TASK_SPECS[task.taskType];
  await api.llmStart(modelId);
  const material = task.material?.trim() ? `\n\nClassmates' posts / material:\n${task.material.trim()}` : "";
  return api.llmChat([
    {
      role: "system",
      content:
        `You write model answers for TOEFL iBT-style ${spec.label} practice. ` +
        `Write a response that would earn the highest score: clear position or purpose, specific support, ` +
        `natural academic English. Length: ${spec.sampleWords}. Output only the response text.`,
    },
    { role: "user", content: `Task:\n${task.prompt.trim()}${material}` },
  ]);
}
