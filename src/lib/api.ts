// Thin, typed wrappers around Tauri commands. All UI code talks to the
// backend through this file only, so command names live in one place.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppInfo,
  AttemptDetail,
  AttemptSummary,
  ChatMessage,
  DownloadProgress,
  GecOptions,
  GecResult,
  ModelEntry,
  NewAttempt,
  NewEvaluation,
  NewTask,
  Student,
  Task,
} from "./types";

export const api = {
  appInfo: () => invoke<AppInfo>("app_info"),

  // Models
  listModels: () => invoke<ModelEntry[]>("list_models"),
  downloadModel: (id: string) => invoke<void>("download_model", { id }),
  deleteModel: (id: string) => invoke<void>("delete_model", { id }),
  onDownloadProgress: (cb: (p: DownloadProgress) => void): Promise<UnlistenFn> =>
    listen<DownloadProgress>("model-download-progress", (e) => cb(e.payload)),

  // Engines
  transcribe: (wavPath: string, modelId: string) =>
    invoke<string>("transcribe", { wavPath, modelId }),
  llmStart: (modelId: string) => invoke<number>("llm_start", { modelId }),
  llmStop: () => invoke<void>("llm_stop"),
  llmChat: (messages: ChatMessage[], jsonSchema?: unknown) =>
    invoke<string>("llm_chat", { messages, jsonSchema: jsonSchema ?? null }),

  /** Grammar model (GECToR). Loads the model on first call (a few seconds). */
  gecCheck: (modelId: string, text: string, options?: GecOptions) =>
    invoke<GecResult>("gec_check", { modelId, text, options: options ?? null }),

  // Tasks (문제)
  listTasks: () => invoke<Task[]>("list_tasks"),
  createTask: (task: NewTask) => invoke<number>("create_task", { task }),
  deleteTask: (id: number) => invoke<void>("delete_task", { id }),

  // Students · attempts · evaluations
  listStudents: () => invoke<Student[]>("list_students"),
  createStudent: (name: string) => invoke<number>("create_student", { name }),
  createAttempt: (attempt: NewAttempt) => invoke<number>("create_attempt", { attempt }),
  createEvaluation: (evaluation: NewEvaluation) => invoke<number>("create_evaluation", { evaluation }),
  setSampleAnswer: (evaluationId: number, text: string) =>
    invoke<void>("set_sample_answer", { evaluationId, text }),
  setTeacherScore: (evaluationId: number, score: number | null) =>
    invoke<void>("set_teacher_score", { evaluationId, score }),
  getAttempt: (id: number) => invoke<AttemptDetail>("get_attempt", { id }),
  listAttempts: (studentId?: number | null, limit?: number) =>
    invoke<AttemptSummary[]>("list_attempts", { studentId: studentId ?? null, limit: limit ?? null }),
};

/** True when running inside the Tauri shell (false in a plain browser via `npm run dev`). */
export const inTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
