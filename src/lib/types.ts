// Shapes shared with the Rust side (src-tauri/src/*). Keep field names in sync:
// Rust structs use #[serde(rename_all = "camelCase")].

export type Platform = "macos" | "windows" | "linux";

export interface EngineStatus {
  whisper: boolean;
  llama: boolean;
}

export interface AppInfo {
  version: string;
  platform: Platform;
  arch: string;
  dataDir: string;
  modelsDir: string;
  engines: EngineStatus;
}

export type ModelKind = "whisper" | "llm";

export interface ModelEntry {
  id: string;
  kind: ModelKind;
  name: string;
  file: string;
  url: string;
  sizeMb: number;
  minVramGb: number;
  recommended: boolean;
  notes: string;
  installed: boolean;
}

export interface DownloadProgress {
  id: string;
  downloaded: number;
  total: number | null;
  done: boolean;
  error: string | null;
}

export type Section = "speaking" | "writing";
export type TaskType = "independent" | "integrated";

export interface Task {
  id: number;
  section: Section;
  taskType: TaskType;
  title: string;
  prompt: string;
  /** Reading passage / lecture script for integrated tasks. */
  material: string | null;
  prepSeconds: number;
  responseSeconds: number;
  createdAt: string;
}

export type NewTask = Omit<Task, "id" | "createdAt">;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
