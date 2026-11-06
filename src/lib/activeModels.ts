// Which installed models the app uses for real scoring: the catalog's recommended model
// if installed, else the first installed one. The LLM's catalog `prompt` field picks the
// scoring prompt version (measured per model — see docs/scoring-experiments.md).
import { api } from "./api";
import type { PromptVersion } from "./scoring";
import type { ModelEntry } from "./types";

export interface ActiveModels {
  llm: ModelEntry | null;
  whisper: ModelEntry | null;
  /** Grammar model (GECToR) — optional; scoring works without it. */
  gec: ModelEntry | null;
  prompt: PromptVersion;
}

export function pickActive(models: ModelEntry[]): ActiveModels {
  const pick = (kind: ModelEntry["kind"]) => {
    const installed = models.filter((m) => m.kind === kind && m.installed);
    return installed.find((m) => m.recommended) ?? installed[0] ?? null;
  };
  const llm = pick("llm");
  return { llm, whisper: pick("whisper"), gec: pick("gec"), prompt: ((llm?.prompt as PromptVersion) ?? "v3") };
}

export async function loadActiveModels(): Promise<ActiveModels> {
  return pickActive(await api.listModels());
}
