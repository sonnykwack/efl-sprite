// Thin, typed wrappers around Tauri commands. All UI code talks to the
// backend through this file only, so command names live in one place.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppInfo,
  ChatMessage,
  DownloadProgress,
  ModelEntry,
  NewTask,
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

  // Tasks (문제)
  listTasks: () => invoke<Task[]>("list_tasks"),
  createTask: (task: NewTask) => invoke<number>("create_task", { task }),
  deleteTask: (id: number) => invoke<void>("delete_task", { id }),
};

/** True when running inside the Tauri shell (false in a plain browser via `npm run dev`). */
export const inTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
