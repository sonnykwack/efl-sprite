// 문제 수정: form on the left, a live preview of what the student will see on the right.
// The task type is fixed (attempts already scored against it would no longer match their rubric).
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { targetSentences } from "../lib/accuracy";
import { TASK_SPECS } from "../lib/rubrics";
import { requiredPoints } from "../lib/scoring";
import type { NewTask, Task } from "../lib/types";

const btn = "rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-40";
const primary = `${btn} bg-sprite-500 text-white hover:bg-sprite-600`;
const ghost = `${btn} border border-black/10 text-ink-600 hover:bg-sprite-50`;
const field = "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-sprite-500";

const fmtSeconds = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}분${s % 60 ? ` ${s % 60}초` : ""}` : `${s}초`);

function Preview({ t }: { t: NewTask }) {
  const lines = (t.material ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  switch (t.taskType) {
    case "listen_repeat": {
      const s = targetSentences(t.material);
      return (
        <div className="grid gap-3">
          <p className="text-sm text-ink-600">{t.prompt}</p>
          <ol className="grid gap-1.5">
            {s.map((x, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="w-5 shrink-0 text-right text-ink-400">{i + 1}</span>
                <span>{x}</span>
                <span className="ml-auto shrink-0 text-[11px] text-ink-400">{x.split(/\s+/).length}단어</span>
              </li>
            ))}
          </ol>
          <p className="text-[11px] text-ink-400">학생에게는 문장이 글자로 보이지 않고 소리로만 들려요 (문장 {s.length}개).</p>
        </div>
      );
    }
    case "interview":
      return (
        <div className="grid gap-2">
          <p className="text-lg leading-8">{t.prompt}</p>
          <p className="text-[11px] text-ink-400">질문을 화면에 보여주고 소리로도 읽어줘요.</p>
        </div>
      );
    case "email": {
      const points = requiredPoints(t.prompt);
      return (
        <div className="grid gap-3">
          <p className="whitespace-pre-wrap text-sm leading-6">{t.prompt}</p>
          <div className={`rounded-lg p-3 text-xs ${points.length ? "bg-sprite-50 text-sprite-700" : "bg-amber-50 text-amber-700"}`}>
            {points.length ? (
              <>
                <div className="mb-1 font-semibold">채점할 요구사항 {points.length}개 인식</div>
                <ul className="ml-4 list-disc">
                  {points.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </>
            ) : (
              "요구사항이 인식되지 않았어요. '- explain the problem'처럼 줄 앞에 '- '를 붙여 쓰면 AI가 항목별로 확인해요."
            )}
          </div>
        </div>
      );
    }
    case "academic_discussion":
      return (
        <div className="grid gap-3">
          <p className="whitespace-pre-wrap text-sm leading-6">{t.prompt}</p>
          {lines.map((p, i) => (
            <div key={i} className="rounded-lg bg-sprite-50 p-3 text-sm">
              {p}
            </div>
          ))}
          {lines.length < 2 && (
            <p className="text-xs text-amber-700">다른 학생의 의견은 보통 2개예요. 한 줄에 하나씩 "이름: 의견" 형식으로 써 주세요.</p>
          )}
        </div>
      );
  }
}

export default function TaskEditor({ task, onDone }: { task: Task; onDone: (saved: boolean) => void }) {
  const spec = TASK_SPECS[task.taskType];
  const original: NewTask = {
    section: task.section,
    taskType: task.taskType,
    title: task.title,
    prompt: task.prompt,
    material: task.material,
    prepSeconds: task.prepSeconds,
    responseSeconds: task.responseSeconds,
  };
  const [draft, setDraft] = useState<NewTask>(original);
  const [attempts, setAttempts] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    api.countTaskAttempts(task.id).then(setAttempts).catch(() => setAttempts(null));
  }, [task.id]);

  const changed = JSON.stringify(draft) !== JSON.stringify(original);
  const set = (patch: Partial<NewTask>) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    if (!draft.title.trim() || !draft.prompt.trim()) return setError(`제목과 ${spec.promptLabel}을(를) 입력해 주세요.`);
    if (draft.taskType === "listen_repeat" && targetSentences(draft.material).length === 0)
      return setError("따라 말할 문장을 한 줄에 하나씩 입력해 주세요.");
    setSaving(true);
    try {
      await api.updateTask(task.id, draft);
      onDone(true);
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  const cancel = () => (changed ? setConfirmLeave(true) : onDone(false));

  return (
    <div className="grid gap-5">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-sprite-600">
            문제 수정 · {spec.label} <span className="font-normal normal-case text-ink-400">({spec.labelKo} · 유형은 바꿀 수 없어요)</span>
          </div>
          <h1 className="text-xl font-bold">{draft.title || "제목 없음"}</h1>
        </div>
        <div className="flex items-center gap-2">
          {confirmLeave ? (
            <>
              <span className="text-sm text-ink-600">저장하지 않은 수정 내용이 사라져요.</span>
              <button className={ghost} onClick={() => setConfirmLeave(false)}>
                계속 수정
              </button>
              <button className={`${btn} bg-red-50 text-red-600`} onClick={() => onDone(false)}>
                나가기
              </button>
            </>
          ) : (
            <>
              <button className={ghost} onClick={cancel}>
                취소
              </button>
              <button className={primary} onClick={save} disabled={!changed || saving}>
                {saving ? "저장 중…" : "저장"}
              </button>
            </>
          )}
        </div>
      </header>

      {attempts != null && attempts > 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          이 문제로 응시한 기록이 {attempts}개 있어요. 수정하면 지난 기록의 "문제 다시 보기"에도 바뀐 내용이 보이고, 이미 매긴 점수는 바뀌지 않아요.
          내용이 크게 달라진다면 수정 대신 새 문제로 추가하는 걸 권해요.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="grid content-start gap-4 rounded-xl bg-white p-5 shadow-sm">
          <label className="grid gap-1 text-xs text-ink-600">
            제목
            <input className={field} value={draft.title} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-ink-600">
            {spec.promptLabel}
            <textarea className={`${field} h-40 leading-6`} placeholder={spec.promptPlaceholder} value={draft.prompt} onChange={(e) => set({ prompt: e.target.value })} />
          </label>
          {spec.materialLabel && (
            <label className="grid gap-1 text-xs text-ink-600">
              {spec.materialLabel}
              <textarea
                className={`${field} h-40 leading-6`}
                placeholder={spec.materialPlaceholder}
                value={draft.material ?? ""}
                onChange={(e) => set({ material: e.target.value || null })}
              />
            </label>
          )}
          <div className="flex flex-wrap items-center gap-4 text-sm text-ink-600">
            {spec.section === "speaking" && (
              <label className="flex items-center gap-2">
                준비 시간
                <input
                  type="number"
                  min={0}
                  className={`${field} w-20 text-right`}
                  value={draft.prepSeconds}
                  onChange={(e) => set({ prepSeconds: Math.max(0, Number(e.target.value)) })}
                />
                초
              </label>
            )}
            <label className="flex items-center gap-2">
              {draft.taskType === "listen_repeat" ? "문장당 응답" : "응답 시간"}
              <input
                type="number"
                min={5}
                className={`${field} w-24 text-right`}
                value={draft.responseSeconds}
                onChange={(e) => set({ responseSeconds: Math.max(5, Number(e.target.value)) })}
              />
              초
            </label>
            <span className="text-xs text-ink-400">
              = {fmtSeconds(draft.responseSeconds)} · 기본값 {fmtSeconds(spec.defaults.responseSeconds)}
            </span>
          </div>
          {changed && (
            <button className="justify-self-start text-xs text-ink-400 underline" onClick={() => setDraft(original)}>
              수정 전으로 되돌리기
            </button>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </section>

        <section className="grid content-start gap-3 rounded-xl border border-dashed border-sprite-300 bg-white/70 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-600">학생에게 보이는 화면 (미리보기)</h2>
            <span className="rounded-lg bg-white px-2 py-0.5 font-mono text-sm shadow-sm">{fmtSeconds(draft.responseSeconds)}</span>
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-sprite-600">{spec.label}</div>
          <div className="font-bold">{draft.title || "제목 없음"}</div>
          <Preview t={draft} />
        </section>
      </div>
    </div>
  );
}
