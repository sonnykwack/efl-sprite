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
//  evaluateResponse() can additionally take the per-criterion MEDIAN of several samples.

import { api } from "./api";
import { normalizeWords } from "./accuracy";
import { SCALE_MAX, TASK_SPECS, toBand, type Criterion } from "./rubrics";
import type { ChatMessage, TaskType } from "./types";

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
  evidence: string[];
  /** Share of evidence quotes actually found in the response (0–1). */
  grounded: number;
  comment: string;
  score: number;
}

export interface LanguageError {
  quote: string;
  correction: string;
  /** Whether `quote` really occurs in the response. */
  grounded: boolean;
}

export interface LlmEvaluation {
  version: PromptVersion;
  criteria: CriterionResult[];
  errors: LanguageError[];
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
export type PromptVersion = "v1" | "v2";
export const DEFAULT_PROMPT_VERSION: PromptVersion = "v2";

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
export function evaluationSchema(criteria: Criterion[], version: PromptVersion = DEFAULT_PROMPT_VERSION) {
  const properties: Record<string, unknown> = {};
  if (version === "v2") {
    // Errors come FIRST so the language score is anchored to concrete mistakes.
    properties.errors = {
      type: "array",
      items: {
        type: "object",
        properties: {
          quote: { type: "string", maxLength: 120 },
          correction: { type: "string", maxLength: 140 },
        },
        required: ["quote", "correction"],
        additionalProperties: false,
      },
      minItems: 0,
      maxItems: 6,
    };
  }
  for (const c of criteria) properties[c.key] = criterionSchema(version === "v2" ? 260 : 320);
  properties.overall_feedback = { type: "string", maxLength: version === "v2" ? 400 : 600 };
  return {
    type: "object",
    properties,
    required: [...(version === "v2" ? ["errors"] : []), ...criteria.map((c) => c.key), "overall_feedback"],
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

export function buildEvaluationMessages(
  task: ScorableTask,
  response: string,
  opts: { lang: FeedbackLang; stats?: SpeakingStats; version?: PromptVersion },
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
  meta: { latencyMs: number; modelId: string; version: PromptVersion },
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
    const evidence = Array.isArray(item.evidence) ? item.evidence.map(String) : [];
    const score = Math.min(SCALE_MAX, Math.max(0, Math.round(Number(item.score) || 0)));
    return {
      key: c.key,
      name: c.name,
      nameKo: c.nameKo,
      evidence,
      grounded: groundedShare(evidence, response),
      comment: String(item.comment ?? ""),
      score,
    };
  });
  const errors: LanguageError[] = (Array.isArray(data.errors) ? data.errors : [])
    .map((e) => e as { quote?: unknown; correction?: unknown })
    .map((e) => ({ quote: String(e.quote ?? ""), correction: String(e.correction ?? "") }))
    // Drop no-op "corrections" (model sometimes repeats the original).
    .filter((e) => e.quote && normalizeWords(e.quote).join(" ") !== normalizeWords(e.correction).join(" "))
    .map((e) => ({ ...e, grounded: occursIn(e.quote, response) }));
  return finalize(
    {
      version: meta.version,
      criteria,
      errors,
      overallFeedback: String(data.overall_feedback ?? ""),
      latencyMs: meta.latencyMs,
      modelId: meta.modelId,
      samples: 1,
      raw,
    },
  );
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
  const texts = [...e.criteria.map((c) => c.comment), e.overallFeedback];
  const raw = await api.llmChat(
    [
      {
        role: "system",
        content:
          "Translate each English feedback sentence for a Korean student into natural, polite Korean (해요체). " +
          "Keep quoted English words and corrections in English inside quotation marks. Return the translations in the same order.",
      },
      { role: "user", content: JSON.stringify(texts) },
    ],
    {
      type: "object",
      properties: {
        ko: { type: "array", items: { type: "string", maxLength: 500 }, minItems: texts.length, maxItems: texts.length },
      },
      required: ["ko"],
      additionalProperties: false,
    },
  );
  const ko: string[] = JSON.parse(raw).ko ?? [];
  if (ko.length !== texts.length) return e;
  return {
    ...e,
    criteria: e.criteria.map((c, i) => ({ ...c, comment: ko[i] || c.comment })),
    overallFeedback: ko[texts.length - 1] || e.overallFeedback,
  };
}

// ------------------------------------------------------------------ entry points

/** One LLM sample (no translation, no combining). Exposed for the scoring lab. */
export async function evaluateOnce(
  task: ScorableTask,
  response: string,
  opts: { modelId: string; lang?: FeedbackLang; stats?: SpeakingStats; version?: PromptVersion },
): Promise<LlmEvaluation> {
  const spec = TASK_SPECS[task.taskType];
  if (spec.scoring !== "llm") throw new Error(`${spec.label} is not LLM-scored`);
  const version = opts.version ?? DEFAULT_PROMPT_VERSION;
  await api.llmStart(opts.modelId);
  const messages = buildEvaluationMessages(task, response, { lang: opts.lang ?? "ko", stats: opts.stats, version });
  const t0 = performance.now();
  const raw = await api.llmChat(messages, evaluationSchema(spec.criteria, version));
  return parseEvaluation(raw, task, response, {
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
  opts: { modelId: string; lang?: FeedbackLang; stats?: SpeakingStats; version?: PromptVersion; samples?: number },
): Promise<LlmEvaluation> {
  const n = Math.max(1, opts.samples ?? 3);
  const runs: LlmEvaluation[] = [];
  for (let i = 0; i < n; i++) runs.push(await evaluateOnce(task, response, opts));
  let result = combineSamples(runs);
  if ((opts.version ?? DEFAULT_PROMPT_VERSION) === "v2" && (opts.lang ?? "ko") === "ko") {
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
