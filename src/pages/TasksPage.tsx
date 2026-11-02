import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import { api, inTauri } from "../lib/api";
import type { NewTask, Task } from "../lib/types";

const EMPTY: NewTask = {
  section: "speaking",
  taskType: "independent",
  title: "",
  prompt: "",
  material: null,
  prepSeconds: 15,
  responseSeconds: 45,
};

const label = (t: Task) =>
  `${t.section === "speaking" ? "Speaking" : "Writing"} · ${
    t.taskType === "independent" ? "Independent" : "Integrated"
  }`;

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draft, setDraft] = useState<NewTask>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    if (!inTauri()) return;
    api.listTasks().then(setTasks).catch((e) => setError(String(e)));
  };
  useEffect(refresh, []);

  const save = async () => {
    if (!draft.title.trim() || !draft.prompt.trim()) {
      setError("제목과 문제(프롬프트)를 입력해 주세요.");
      return;
    }
    try {
      await api.createTask(draft);
      setDraft(EMPTY);
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

  const field = "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-sprite-500";

  return (
    <>
      <PageHeader title="문제 관리" subtitle="수업에서 사용할 스피킹·라이팅 문제를 등록합니다." />

      <section className="mb-8 grid gap-3 rounded-xl bg-white p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-3">
          <select
            className={field}
            value={draft.section}
            onChange={(e) => {
              const section = e.target.value as NewTask["section"];
              setDraft({
                ...draft,
                section,
                prepSeconds: section === "speaking" ? 15 : 0,
                responseSeconds: section === "speaking" ? 45 : 1800,
              });
            }}
          >
            <option value="speaking">Speaking</option>
            <option value="writing">Writing</option>
          </select>
          <select
            className={field}
            value={draft.taskType}
            onChange={(e) => setDraft({ ...draft, taskType: e.target.value as NewTask["taskType"] })}
          >
            <option value="independent">Independent</option>
            <option value="integrated">Integrated</option>
          </select>
        </div>
        <input
          className={field}
          placeholder="제목 (예: Week 3 — Online vs. classroom learning)"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
        <textarea
          className={`${field} h-24`}
          placeholder="문제 (prompt)"
          value={draft.prompt}
          onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
        />
        {draft.taskType === "integrated" && (
          <textarea
            className={`${field} h-32`}
            placeholder="지문 / 강의 스크립트 (integrated 과제용)"
            value={draft.material ?? ""}
            onChange={(e) => setDraft({ ...draft, material: e.target.value || null })}
          />
        )}
        <div className="flex items-center gap-3 text-sm text-ink-600">
          {draft.section === "speaking" && (
            <label className="flex items-center gap-2">
              준비
              <input
                type="number"
                min={0}
                className={`${field} w-20`}
                value={draft.prepSeconds}
                onChange={(e) => setDraft({ ...draft, prepSeconds: Number(e.target.value) })}
              />
              초
            </label>
          )}
          <label className="flex items-center gap-2">
            응답
            <input
              type="number"
              min={10}
              className={`${field} w-24`}
              value={draft.responseSeconds}
              onChange={(e) => setDraft({ ...draft, responseSeconds: Number(e.target.value) })}
            />
            초
          </label>
          <button
            onClick={save}
            className="ml-auto rounded-lg bg-sprite-500 px-4 py-2 font-semibold text-white hover:bg-sprite-600"
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
        {tasks.map((t) => (
          <li key={t.id} className="flex items-start justify-between rounded-xl bg-white p-4 shadow-sm">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-sprite-600">{label(t)}</div>
              <div className="font-semibold">{t.title}</div>
              <div className="mt-1 line-clamp-2 text-sm text-ink-600" data-selectable>
                {t.prompt}
              </div>
            </div>
            <button onClick={() => remove(t.id)} className="text-xs text-ink-400 hover:text-red-600">
              삭제
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
