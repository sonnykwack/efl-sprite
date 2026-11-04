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

export interface Student {
  id: number;
  name: string;
  createdAt: string;
}

export interface NewAttempt {
  taskId: number;
  studentId: number | null;
  responseText: string;
  audioPath: string | null;
  durationSeconds: number | null;
}

export interface NewEvaluation {
  attemptId: number;
  modelId: string;
  /** JSON-encoded LlmEvaluation (or RepeatEvaluation for listen_repeat). */
  rubricJson: string;
  totalScore: number | null;
  feedback: string | null;
  latencyMs: number | null;
}

export interface EvaluationRow {
  id: number;
  modelId: string;
  rubricJson: string;
  totalScore: number | null;
  sampleAnswer: string | null;
  teacherScore: number | null;
  latencyMs: number | null;
  createdAt: string;
}

export interface AttemptDetail {
  id: number;
  taskId: number;
  taskTitle: string;
  section: Section;
  taskType: TaskType;
  prompt: string;
  material: string | null;
  studentId: number | null;
  studentName: string | null;
  responseText: string;
  audioPath: string | null;
  durationSeconds: number | null;
  createdAt: string;
  evaluation: EvaluationRow | null;
}

export interface AttemptSummary {
  id: number;
  createdAt: string;
  studentName: string | null;
  taskTitle: string;
  taskType: TaskType;
  band: number | null;
  teacherScore: number | null;
}
