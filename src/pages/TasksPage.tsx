import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import TaskShare from "../components/TaskShare";
import { api, inTauri } from "../lib/api";
import { targetSentences } from "../lib/accuracy";
import { TASK_SPECS, TASK_TYPES_BY_SECTION } from "../lib/rubrics";
import type { NewTask, Section, Task, TaskType } from "../lib/types";

function emptyDraft(taskType: TaskType): NewTask {
  const spec = TASK_SPECS[taskType];
  return {
    section: spec.section,
    taskType,
    title: "",
    prompt: taskType === "listen_repeat" ? "Listen to each sentence and repeat it exactly." : "",
    material: null,
    prepSeconds: spec.defaults.prepSeconds,
    responseSeconds: spec.defaults.responseSeconds,
  };
}

const fmtSeconds = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}분${s % 60 ? ` ${s % 60}초` : ""}` : `${s}초`);

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draft, setDraft] = useState<NewTask>(emptyDraft("interview"));
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number> | null>(null);
  const spec = TASK_SPECS[draft.taskType];

  const refresh = () => {
    if (!inTauri()) return;
    api.listTasks().then(setTasks).catch((e) => setError(String(e)));
  };
  useEffect(refresh, []);

  const switchType = (taskType: TaskType) =>
    // keep what the teacher already typed in the title
    setDraft({ ...emptyDraft(taskType), title: draft.title });

  const save = async () => {
    if (!draft.title.trim() || !draft.prompt.trim()) {
      setError(`제목과 ${spec.promptLabel}을(를) 입력해 주세요.`);
      return;
    }
    if (draft.taskType === "listen_repeat" && targetSentences(draft.material).length === 0) {
      setError("따라 말할 문장을 한 줄에 하나씩 입력해 주세요.");
      return;
    }
    try {
      await api.createTask(draft);
      setDraft(emptyDraft(draft.taskType));
      setError(null);
      refresh();
    } catch (e) {
      setError(String(e));
    }
  };

  const remove = async (id: number) => {
    await api.deleteTask(id).catch((e) => setError(String(e)));
    refresh();
  };

  const base = "rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-sprite-500";
  const field = `w-full ${base}`;
  const num = `${base} w-24 text-right`;

  return (
    <>
      <PageHeader title="문제 관리" subtitle="TOEFL iBT(2026) 형식의 스피킹·라이팅 문제를 등록합니다." />

      {inTauri() && <TaskShare tasks={tasks} selected={selected} setSelected={setSelected} onChanged={refresh} />}

      <section className="mb-8 grid gap-4 rounded-xl bg-white p-5 shadow-sm">
        {/* Type picker: two sections × two task types */}
        <div className="grid grid-cols-2 gap-3">
          {(["speaking", "writing"] as Section[]).map((section) => (
            <div key={section}>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                {section === "speaking" ? "Speaking" : "Writing"}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {TASK_TYPES_BY_SECTION[section].map((t) => {
                  const s = TASK_SPECS[t];
                  const active = draft.taskType === t;
                  return (
                    <button
                      key={t}
                      onClick={() => switchType(t)}
                      className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                        active
                          ? "border-sprite-500 bg-sprite-50 font-semibold text-sprite-700"
                          : "border-black/10 text-ink-600 hover:border-sprite-300"
                      }`}
                    >
                      <div>{s.label}</div>
                      <div className="text-[11px] font-normal text-ink-400">
                        {s.labelKo} · {s.scoring === "llm" ? "AI 루브릭 채점" : "정확도 채점"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <input
          className={field}
          placeholder="제목 (예: Week 3 — Personal finance)"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
        <label className="grid gap-1 text-xs text-ink-600">
          {spec.promptLabel}
          <textarea
            className={`${field} h-24`}
            placeholder={spec.promptPlaceholder}
            value={draft.prompt}
            onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
          />
        </label>
        {spec.materialLabel && (
          <label className="grid gap-1 text-xs text-ink-600">
            {spec.materialLabel}
            <textarea
              className={`${field} h-32`}
              placeholder={spec.materialPlaceholder}
              value={draft.material ?? ""}
              onChange={(e) => setDraft({ ...draft, material: e.target.value || null })}
            />
          </label>
        )}

        <div className="flex items-center gap-3 text-sm text-ink-600">
          <label className="flex shrink-0 items-center gap-2 whitespace-nowrap">
            {draft.taskType === "listen_repeat" ? "문장당 응답" : "응답 시간"}
            <input
              type="number"
              min={5}
              className={num}
              value={draft.responseSeconds}
              onChange={(e) => setDraft({ ...draft, responseSeconds: Number(e.target.value) })}
            />
            초
          </label>
          <span className="text-xs text-ink-400">기본값: {fmtSeconds(spec.defaults.responseSeconds)}</span>
          <button
            onClick={save}
            className="ml-auto shrink-0 rounded-lg bg-sprite-500 px-4 py-2 font-semibold text-white hover:bg-sprite-600"
          >
            문제 추가
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>

      <ul className="grid gap-2">
        {tasks.length === 0 && (
          <li className="text-sm text-ink-400">
            {inTauri() ? "등록된 문제가 없습니다." : "브라우저 미리보기 모드 — 앱(npm run tauri dev)에서 실행하면 저장됩니다."}
          </li>
        )}
        {tasks.map((t) => {
          const s = TASK_SPECS[t.taskType];
          const extra =
            t.taskType === "listen_repeat" ? ` · ${targetSentences(t.material).length}문장` : "";
          return (
            <li key={t.id} className="flex items-start justify-between gap-4 rounded-xl bg-white p-4 shadow-sm">
              {selected && (
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-sprite-500"
                  checked={selected.has(t.id)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(t.id);
                    else next.delete(t.id);
                    setSelected(next);
                  }}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-sprite-600">
                  {t.section} · {s?.label ?? t.taskType}
                  <span className="ml-2 font-normal normal-case text-ink-400">
                    {fmtSeconds(t.responseSeconds)}
                    {extra}
                  </span>
                </div>
                <div className="font-semibold">{t.title}</div>
                <div className="mt-1 line-clamp-2 text-sm text-ink-600" data-selectable>
                  {t.taskType === "listen_repeat" ? targetSentences(t.material).join(" / ") : t.prompt}
                </div>
              </div>
              <button onClick={() => remove(t.id)} className="shrink-0 text-xs text-ink-400 hover:text-red-600">
                삭제
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
