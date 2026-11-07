// Task pack file (.eflsprite) — how an assistant shares a problem set with students by
// KakaoTalk or USB. Plain UTF-8 JSON so it can be checked or edited in any text editor:
//
// {
//   "format": "efl-sprite-tasks", "version": 1,
//   "title": "Week 3 writing", "author": "EK 조교", "createdAt": "2026-11-07T…",
//   "tasks": [ { "taskType": "email", "title": "…", "prompt": "…", "material": null,
//                "prepSeconds": 0, "responseSeconds": 420 }, … ]
// }
//
// Import validates every task (type, required text, sane times) and skips duplicates
// (same type + title + prompt), so importing the same file twice is harmless.

import { open, save } from "@tauri-apps/plugin-dialog";
import { api } from "./api";
import { targetSentences } from "./accuracy";
import { TASK_SPECS } from "./rubrics";
import type { NewTask, Task, TaskType } from "./types";

export const PACK_EXT = "eflsprite";
const FORMAT = "efl-sprite-tasks";

export interface TaskPack {
  format: typeof FORMAT;
  version: 1;
  title: string;
  author: string;
  createdAt: string;
  tasks: Omit<NewTask, "section">[];
}

export interface ParsedPack {
  title: string;
  author: string;
  tasks: NewTask[];
  /** Human-readable reasons for tasks that were skipped as invalid. */
  problems: string[];
}

const TYPES = Object.keys(TASK_SPECS) as TaskType[];

export function buildPack(tasks: Task[], title: string, author: string): TaskPack {
  return {
    format: FORMAT,
    version: 1,
    title,
    author,
    createdAt: new Date().toISOString(),
    tasks: tasks.map((t) => ({
      taskType: t.taskType,
      title: t.title,
      prompt: t.prompt,
      material: t.material,
      prepSeconds: t.prepSeconds,
      responseSeconds: t.responseSeconds,
    })),
  };
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown, d: number, lo: number, hi: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d;

/** Validate a pack file's text. Throws only if the file is not a pack at all. */
export function parsePack(text: string): ParsedPack {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("문제 파일 형식이 아니에요 (JSON을 읽을 수 없음).");
  }
  const d = data as Partial<TaskPack> & { tasks?: unknown };
  if (d?.format !== FORMAT || !Array.isArray(d.tasks)) throw new Error("EFL Sprite 문제 파일이 아니에요.");
  if (typeof d.version === "number" && d.version > 1) throw new Error("더 새로운 버전의 앱에서 만든 파일이에요. 앱을 업데이트해 주세요.");
  const tasks: NewTask[] = [];
  const problems: string[] = [];
  (d.tasks as unknown[]).forEach((raw, i) => {
    const t = (raw ?? {}) as Record<string, unknown>;
    const label = str(t.title) || `${i + 1}번째 문제`;
    const taskType = t.taskType as TaskType;
    if (!TYPES.includes(taskType)) return problems.push(`${label}: 알 수 없는 유형 (${String(t.taskType)})`);
    const spec = TASK_SPECS[taskType];
    const task: NewTask = {
      section: spec.section,
      taskType,
      title: str(t.title).trim().slice(0, 200),
      prompt: str(t.prompt).trim(),
      material: str(t.material).trim() || null,
      prepSeconds: num(t.prepSeconds, spec.defaults.prepSeconds, 0, 600),
      responseSeconds: num(t.responseSeconds, spec.defaults.responseSeconds, 5, 3600),
    };
    if (!task.title || !task.prompt) return problems.push(`${label}: 제목이나 문제 내용이 비어 있음`);
    if (taskType === "listen_repeat" && targetSentences(task.material).length === 0)
      return problems.push(`${label}: 따라 말할 문장이 없음`);
    tasks.push(task);
  });
  return { title: str(d.title), author: str(d.author), tasks, problems };
}

const sameTask = (a: NewTask, b: NewTask) => a.taskType === b.taskType && a.title === b.title && a.prompt === b.prompt;

/** Add the parsed tasks that are not registered yet. Returns [added, skipped duplicates]. */
export async function importTasks(tasks: NewTask[]): Promise<[number, number]> {
  const existing = await api.listTasks();
  let added = 0;
  for (const t of tasks) {
    if (existing.some((e) => sameTask(e, t))) continue;
    await api.createTask(t);
    added++;
  }
  return [added, tasks.length - added];
}

/** Ask where to save, then write the pack. Returns the path, or null if cancelled. */
export async function exportPackDialog(tasks: Task[], title: string, author: string): Promise<string | null> {
  const safe = title.replace(/[\\/:*?"<>|]/g, " ").trim() || "문제";
  const path = await save({
    title: "문제 파일로 내보내기",
    defaultPath: `${safe}.${PACK_EXT}`,
    filters: [{ name: "EFL Sprite 문제 파일", extensions: [PACK_EXT] }],
  });
  if (!path) return null;
  const finalPath = path.toLowerCase().endsWith(`.${PACK_EXT}`) ? path : `${path}.${PACK_EXT}`;
  await api.writeTaskFile(finalPath, JSON.stringify(buildPack(tasks, title, author), null, 2));
  return finalPath;
}

/** Ask for a file and parse it. Returns null if cancelled. */
export async function openPackDialog(): Promise<ParsedPack | null> {
  const path = await open({
    title: "문제 파일 가져오기",
    multiple: false,
    directory: false,
    filters: [{ name: "EFL Sprite 문제 파일", extensions: [PACK_EXT, "json"] }],
  });
  if (!path || Array.isArray(path)) return null;
  return parsePack(await api.readTaskFile(path));
}

export async function readPackPath(path: string): Promise<ParsedPack> {
  return parsePack(await api.readTaskFile(path));
}
