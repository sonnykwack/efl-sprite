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
  /** LLM only: scoring prompt version recommended for this model ("v2" | "v3"). */
  prompt?: string;
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
/** TOEFL iBT 2026 task types supported by the app (see src/lib/rubrics.ts). */
export type TaskType = "listen_repeat" | "interview" | "email" | "academic_discussion";

export interface Task {
  id: number;
  section: Section;
  taskType: TaskType;
  title: string;
  /** listen_repeat: instructions · interview: question · email: situation · academic_discussion: professor's post */
  prompt: string;
  /** listen_repeat: target sentences (one per line) · academic_discussion: classmates' posts */
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
