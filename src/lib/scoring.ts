// LLM scoring pipeline for interview / email / academic_discussion.
//
// Design (see CLAUDE.md → Scoring design):
//  1. The rubric goes into the prompt with level anchors.
//  2. Output is constrained by a JSON schema (llama-server grammar). For every criterion
//     the model must write `evidence` (verbatim quotes) → `comment` → `score`, in that
//     order: committing to evidence first makes scores far more stable than asking for a
//     bare number.
//  3. Evidence quotes are checked against the response afterwards ("grounding"), so
//     invented quotes are detected and reported.

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

export interface LlmEvaluation {
  criteria: CriterionResult[];
  overallFeedback: string;
  total: number;
  max: number;
  /** Estimated TOEFL 2026 band, 1.0–6.0. */
  band: number;
  latencyMs: number;
  modelId: string;
  raw: string;
}

export type FeedbackLang = "ko" | "en";

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

function criterionSchema(maxComment: number) {
  return {
    type: "object",
    properties: {
      evidence: {
        type: "array",
        items: { type: "string", maxLength: 160 },
        minItems: 1,
        maxItems: 3,
      },
      comment: { type: "string", maxLength: maxComment },
      score: { type: "integer", enum: [0, 1, 2, 3, 4, 5] },
    },
    required: ["evidence", "comment", "score"],
    additionalProperties: false,
  };
}

/** JSON schema whose key order fixes the generation order (serde_json preserve_order). */
export function evaluationSchema(criteria: Criterion[]) {
  const properties: Record<string, unknown> = {};
  for (const c of criteria) properties[c.key] = criterionSchema(320);
  properties.overall_feedback = { type: "string", maxLength: 600 };
  return {
    type: "object",
    properties,
    required: [...criteria.map((c) => c.key), "overall_feedback"],
    additionalProperties: false,
  };
}

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

export function buildEvaluationMessages(
  task: ScorableTask,
  response: string,
  opts: { lang: FeedbackLang; stats?: SpeakingStats },
): ChatMessage[] {
  const spec = TASK_SPECS[task.taskType];
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

  const parts = [`## Task (${spec.label})`, task.prompt.trim()];
  if (task.material?.trim()) parts.push("", "## Classmates' posts / material", task.material.trim());
  if (opts.stats) {
    const s = opts.stats;
    parts.push(
      "",
      "## Speech statistics (from the recording)",
      `duration: ${s.durationSeconds.toFixed(0)} s · words: ${s.words} · words per minute: ${s.wordsPerMinute} · filler words: ${s.fillers}`,
      "The response below is an automatic transcript. Judge delivery from these statistics and from hesitations, repetitions or fragments visible in the transcript. Do not penalise spelling or punctuation of the transcript.",
    );
  }
  parts.push("", "## Student's response", response.trim() || "(no response)");

  return [
    { role: "system", content: system },
    { role: "user", content: parts.join("\n") },
  ];
}

/** Share of quotes that really occur in the response (word-normalized substring match). */
export function groundedShare(quotes: string[], response: string): number {
  if (quotes.length === 0) return 0;
  const hay = ` ${normalizeWords(response).join(" ")} `;
  const hits = quotes.filter((q) => {
    const needle = normalizeWords(q).join(" ");
    return needle.length > 0 && hay.includes(` ${needle} `);
  }).length;
  return hits / quotes.length;
}

export function parseEvaluation(
  raw: string,
  task: ScorableTask,
  response: string,
  meta: { latencyMs: number; modelId: string },
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
  const total = criteria.reduce((s, c) => s + c.score, 0);
  const max = criteria.length * SCALE_MAX;
  return {
    criteria,
    overallFeedback: String(data.overall_feedback ?? ""),
    total,
    max,
    band: toBand(max ? total / max : 0),
    latencyMs: meta.latencyMs,
    modelId: meta.modelId,
    raw,
  };
}

/** Score one response with the local LLM. Starts llama-server for `modelId` if needed. */
export async function evaluateResponse(
  task: ScorableTask,
  response: string,
  opts: { modelId: string; lang?: FeedbackLang; stats?: SpeakingStats },
): Promise<LlmEvaluation> {
  const spec = TASK_SPECS[task.taskType];
  if (spec.scoring !== "llm") throw new Error(`${spec.label} is not LLM-scored`);
  await api.llmStart(opts.modelId);
  const messages = buildEvaluationMessages(task, response, { lang: opts.lang ?? "ko", stats: opts.stats });
  const t0 = performance.now();
  const raw = await api.llmChat(messages, evaluationSchema(spec.criteria));
  return parseEvaluation(raw, task, response, {
    latencyMs: Math.round(performance.now() - t0),
    modelId: opts.modelId,
  });
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
