// Score an already-saved attempt and store the evaluation. Used by the attempt page and by
// "다시 채점" on the result page, so both follow exactly the same path.
import { api } from "./api";
import { loadActiveModels } from "./activeModels";
import { evaluateResponse, type LlmEvaluation, type SpeakingStats } from "./scoring";
import type { GecEdit, TaskType } from "./types";

export type ScoringMode = "quick" | "precise";
export const SAMPLES: Record<ScoringMode, number> = { quick: 1, precise: 3 };

export type Stage = "saving" | "grammar" | "loading" | "scoring" | "translating" | "done";

export const STAGE_KO: Record<Stage, string> = {
  saving: "답안 저장 중…",
  grammar: "문법 모델로 오류를 찾는 중…",
  loading: "AI 모델 준비 중… (처음 한 번은 오래 걸려요)",
  scoring: "AI가 답안을 읽고 채점하는 중…",
  translating: "피드백을 한국어로 옮기는 중…",
  done: "완료",
};

export interface ScorableAttempt {
  attemptId: number;
  taskType: TaskType;
  prompt: string;
  material: string | null;
  responseText: string;
  stats?: SpeakingStats;
}

export async function scoreAttempt(
  a: ScorableAttempt,
  mode: ScoringMode,
  onStage: (s: Stage) => void,
): Promise<{ evaluationId: number; evaluation: LlmEvaluation }> {
  const active = await loadActiveModels();
  if (!active.llm) throw new Error("설치된 LLM 모델이 없습니다. 설정 · 모델에서 먼저 다운로드해 주세요.");

  // 1) Grammar model (optional). A failure here must never block scoring.
  let gec: GecEdit[] | undefined;
  if (active.gec && active.prompt === "v4") {
    onStage("grammar");
    try {
      gec = (await api.gecCheck(active.gec.id, a.responseText)).edits;
    } catch (e) {
      console.warn("grammar model failed; continuing without it", e);
    }
  }
  const evaluation = await evaluateResponse(
    { taskType: a.taskType, prompt: a.prompt, material: a.material },
    a.responseText,
    {
      modelId: active.llm.id,
      version: active.prompt,
      samples: SAMPLES[mode],
      lang: "ko",
      stats: a.stats,
      gec,
      onProgress: onStage,
    },
  );
  // `raw` (model JSON per sample) is only needed for debugging — keep the row small.
  const { raw: _raw, ...stored } = evaluation;
  const evaluationId = await api.createEvaluation({
    attemptId: a.attemptId,
    modelId: active.llm.id,
    rubricJson: JSON.stringify(stored),
    totalScore: evaluation.band,
    feedback: evaluation.overallFeedback,
    latencyMs: evaluation.latencyMs,
  });
  onStage("done");
  return { evaluationId, evaluation };
}
