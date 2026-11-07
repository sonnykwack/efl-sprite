// Listen and Repeat: transcribe each recorded sentence with Whisper and compare it with the
// target word by word (accuracy.ts). No LLM.
//
// Per-sentence score 0–5 follows the spirit of the 2026 task (exact repetition = full
// credit, meaning kept with small slips = partial). Thresholds are ours, documented here:
//   5 = every word right · 4 ≥ 85% · 3 ≥ 70% · 2 ≥ 50% · 1 = something relevant · 0 = nothing.
// Limitation: Whisper's language model can "repair" learner speech (e.g. hear "goes" when
// the student said "go"), so accuracy is an upper bound; pronunciation is not judged.

import { api } from "./api";
import { loadActiveModels } from "./activeModels";
import { scoreRepeat, type RepeatResult } from "./accuracy";
import { toBand } from "./rubrics";

export interface RepeatItem extends RepeatResult {
  audioPath: string | null;
  /** 0–5 */
  score: number;
}

export interface RepeatEvaluation {
  kind: "repeat";
  items: RepeatItem[];
  /** Mean word accuracy 0–1. */
  accuracy: number;
  total: number;
  max: number;
  band: number;
  whisperModel: string;
  latencyMs: number;
}

export function isRepeatEvaluation(x: unknown): x is RepeatEvaluation {
  return !!x && (x as { kind?: unknown }).kind === "repeat";
}

export function itemScore(r: RepeatResult): number {
  const said = r.ops.some((o) => o.op === "ok");
  if (!r.transcript.trim() || !said) return 0;
  if (r.accuracy >= 0.999) return 5;
  if (r.accuracy >= 0.85) return 4;
  if (r.accuracy >= 0.7) return 3;
  if (r.accuracy >= 0.5) return 2;
  return 1;
}

export function buildRepeatEvaluation(items: RepeatItem[], whisperModel: string, latencyMs: number): RepeatEvaluation {
  const total = items.reduce((s, i) => s + i.score, 0);
  const max = items.length * 5;
  return {
    kind: "repeat",
    items,
    accuracy: items.length ? items.reduce((s, i) => s + i.accuracy, 0) / items.length : 0,
    total,
    max,
    band: toBand(max ? total / max : 0),
    whisperModel,
    latencyMs,
  };
}

/** Audio paths are stored as a JSON array for listen_repeat, a plain path otherwise. */
export function parseAudioPaths(s: string | null): string[] {
  if (!s) return [];
  if (s.trim().startsWith("[")) {
    try {
      return (JSON.parse(s) as unknown[]).map((p) => (typeof p === "string" ? p : "")).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [s];
}

/**
 * Transcribe every recording (sequentially — whisper-cli uses all cores already), score each
 * sentence and store the evaluation. A missing recording scores 0.
 */
export async function scoreRepeatAttempt(
  attemptId: number,
  targets: string[],
  audioPaths: (string | null)[],
  onProgress?: (done: number, total: number) => void,
): Promise<RepeatEvaluation> {
  const active = await loadActiveModels();
  if (!active.whisper) throw new Error("설치된 음성 인식(Whisper) 모델이 없습니다. 설정 · 모델에서 먼저 다운로드해 주세요.");
  const t0 = performance.now();
  const items: RepeatItem[] = [];
  for (let i = 0; i < targets.length; i++) {
    onProgress?.(i, targets.length);
    const path = audioPaths[i] ?? null;
    const transcript = path ? (await api.transcribe(path, active.whisper.id)).trim() : "";
    const r = scoreRepeat(targets[i], transcript);
    items.push({ ...r, audioPath: path, score: itemScore(r) });
  }
  onProgress?.(targets.length, targets.length);
  const ev = buildRepeatEvaluation(items, active.whisper.id, Math.round(performance.now() - t0));
  await api.createEvaluation({
    attemptId,
    modelId: active.whisper.id,
    rubricJson: JSON.stringify(ev),
    totalScore: ev.band,
    feedback: null,
    latencyMs: ev.latencyMs,
  });
  return ev;
}
