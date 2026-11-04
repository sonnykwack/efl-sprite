// 응시: pick student + task → do the task with a timer → submit → score → result page.
// Writing tasks are fully supported; speaking tasks arrive with microphone recording.
import { useEffect, useRef, useState } from "react";
import type { Navigate } from "../App";
import PageHeader from "../components/PageHeader";
import { api, inTauri } from "../lib/api";
import { loadActiveModels, type ActiveModels } from "../lib/activeModels";
import { fmtClock, wordCount } from "../lib/format";
import { TASK_SPECS } from "../lib/rubrics";
import { STAGE_KO, scoreAttempt, type ScoringMode, type Stage } from "../lib/submit";
import type { Student, Task } from "../lib/types";

const WORD_TARGET: Partial<Record<Task["taskType"], string>> = {
  email: "권장 120–150 단어",
  academic_discussion: "권장 100 단어 이상",
};

const btn = "rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-40";
const primary = `${btn} bg-sprite-500 text-white hover:bg-sprite-600`;
const ghost = `${btn} border border-black/10 text-ink-600 hover:bg-sprite-50`;

type Phase =
  | { kind: "pick" }
  | { kind: "doing"; task: Task; startedAt: number; draft?: string }
  | { kind: "scoring"; task: Task; attemptId: number; responseText: string; stage: Stage; startedAt: number; error?: string };

export default function AttemptPage({ navigate }: { navigate: Navigate }) {
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const [students, setStudents] = useState<Student[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [mode, setMode] = useState<ScoringMode>("quick");
  const [active, setActive] = useState<ActiveModels | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!inTauri()) return;
    api.listStudents().then(setStudents).catch((e) => setError(String(e)));
    api.listTasks().then(setTasks).catch((e) => setError(String(e)));
    loadActiveModels().then(setActive).catch(() => setActive(null));
  }, []);

  const addStudent = async () => {
    try {
      const id = await api.createStudent(newName);
      setNewName("");
      setStudents(await api.listStudents());
      setStudentId(id);
    } catch (e) {
      setError(String(e));
    }
  };

  const runScoring = async (task: Task, attemptId: number, responseText: string) => {
    const startedAt = performance.now();
    const set = (stage: Stage, err?: string) =>
      setPhase({ kind: "scoring", task, attemptId, responseText, stage, startedAt, error: err });
    set("loading");
    try {
      await scoreAttempt(
        { attemptId, taskType: task.taskType, prompt: task.prompt, material: task.material, responseText },
        mode,
        (s) => set(s),
      );
      navigate({ page: "result", attemptId });
    } catch (e) {
      set("scoring", String(e));
    }
  };

  const submit = async (task: Task, responseText: string, durationSeconds: number) => {
    // Save FIRST: even if scoring fails, the student's work is never lost.
    setPhase({ kind: "scoring", task, attemptId: -1, responseText, stage: "saving", startedAt: performance.now() });
    try {
      const attemptId = await api.createAttempt({
        taskId: task.id,
        studentId,
        responseText,
        audioPath: null,
        durationSeconds,
      });
      await runScoring(task, attemptId, responseText);
    } catch (e) {
      setError(`저장 실패: ${String(e)}`);
      // Back to the task with the text intact.
      setPhase({ kind: "doing", task, startedAt: performance.now() - durationSeconds * 1000, draft: responseText });
    }
  };

  if (!inTauri()) {
    return (
      <>
        <PageHeader title="응시" />
        <p className="text-sm text-ink-600">앱(npm run tauri dev)에서 실행해 주세요.</p>
      </>
    );
  }

  if (phase.kind === "doing") {
    return (
      <WritingTask
        task={phase.task}
        startedAt={phase.startedAt}
        initialText={phase.draft ?? ""}
        error={error}
        onSubmit={(text, secs) => submit(phase.task, text, secs)}
        onQuit={() => setPhase({ kind: "pick" })}
      />
    );
  }
  if (phase.kind === "scoring") {
    return (
      <Scoring
        phase={phase}
        onRetry={() => runScoring(phase.task, phase.attemptId, phase.responseText)}
        onSkip={() => navigate({ page: "result", attemptId: phase.attemptId })}
      />
    );
  }

  // ---- pick
  const student = students.find((s) => s.id === studentId);
  return (
    <>
      <PageHeader title="응시" subtitle="학생과 문제를 고르면 바로 시작합니다." />

      {!active?.llm && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          채점용 LLM 모델이 설치되어 있지 않아요.{" "}
          <button className="font-semibold text-sprite-700 underline" onClick={() => navigate({ page: "settings" })}>
            설정 · 모델
          </button>
          에서 먼저 다운로드해 주세요.
        </div>
      )}

      <section className="mb-6 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-ink-600">1. 학생</h2>
        <div className="flex flex-wrap gap-2">
          {students.map((s) => (
            <button
              key={s.id}
              onClick={() => setStudentId(s.id)}
              className={`rounded-full border px-3 py-1 text-sm ${
                s.id === studentId ? "border-sprite-500 bg-sprite-50 font-semibold text-sprite-700" : "border-black/10"
              }`}
            >
              {s.name}
            </button>
          ))}
          <form
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              addStudent();
            }}
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="새 학생 이름"
              className="w-32 rounded-full border border-black/10 px-3 py-1 text-sm outline-none focus:border-sprite-500"
            />
            <button disabled={!newName.trim()} className="rounded-full bg-sprite-100 px-3 text-sm text-sprite-700 disabled:opacity-40">
              추가
            </button>
          </form>
        </div>
        {!student && <p className="mt-2 text-xs text-ink-400">학생을 고르지 않으면 이름 없이 기록됩니다.</p>}
      </section>

      <section className="mb-6 rounded-xl bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-600">2. 문제</h2>
          <div className="flex items-center gap-1 rounded-lg bg-sprite-50 p-1 text-xs">
            {(
              [
                ["quick", "빠른 채점", "1회 · 약 40초"],
                ["precise", "정밀 채점", "3회 중앙값 · 약 90초"],
              ] as const
            ).map(([m, label, hint]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1 ${mode === m ? "bg-white font-semibold text-sprite-700 shadow-sm" : "text-ink-600"}`}
                title={hint}
              >
                {label} <span className="font-normal text-ink-400">{hint}</span>
              </button>
            ))}
          </div>
        </div>
        {tasks.length === 0 && (
          <p className="text-sm text-ink-400">
            등록된 문제가 없어요.{" "}
            <button className="text-sprite-700 underline" onClick={() => navigate({ page: "tasks" })}>
              문제 관리
            </button>
            에서 먼저 추가해 주세요.
          </p>
        )}
        <ul className="grid gap-2">
          {tasks.map((t) => {
            const spec = TASK_SPECS[t.taskType];
            const ready = spec.section === "writing";
            return (
              <li key={t.id}>
                <button
                  disabled={!ready || !active?.llm}
                  onClick={() => {
                    setError(null);
                    setPhase({ kind: "doing", task: t, startedAt: performance.now() });
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-black/10 p-3 text-left hover:border-sprite-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-sprite-600">
                      {spec.label} <span className="font-normal normal-case text-ink-400">{fmtClock(t.responseSeconds)}</span>
                    </div>
                    <div className="truncate font-semibold">{t.title}</div>
                  </div>
                  <span className="shrink-0 text-xs text-ink-400">{ready ? "시작 →" : "녹음 기능 준비 중"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      {active?.llm && (
        <p className="text-xs text-ink-400">
          채점 모델: {active.llm.name} · 프롬프트 {active.prompt}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </>
  );
}

// ------------------------------------------------------------------ writing

function WritingTask({
  task,
  startedAt,
  initialText,
  error,
  onSubmit,
  onQuit,
}: {
  task: Task;
  startedAt: number;
  initialText: string;
  error: string | null;
  onSubmit: (text: string, seconds: number) => void;
  onQuit: () => void;
}) {
  const spec = TASK_SPECS[task.taskType];
  const [text, setText] = useState(initialText);
  const [now, setNow] = useState(performance.now());
  const [confirmQuit, setConfirmQuit] = useState(false);
  const submitted = useRef(false);
  const elapsed = (now - startedAt) / 1000;
  const remaining = task.responseSeconds - elapsed;
  const words = wordCount(text);

  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, []);

  const send = () => {
    if (submitted.current || !text.trim()) return;
    submitted.current = true;
    onSubmit(text, Math.round(Math.min(elapsed, task.responseSeconds)));
  };

  // Like the real test: time up → the response is submitted automatically.
  useEffect(() => {
    if (remaining <= 0) send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining <= 0]);

  const posts = (task.material ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  return (
    <div className="mx-auto grid max-w-4xl gap-4">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-sprite-600">{spec.label}</div>
          <h1 className="text-xl font-bold">{task.title}</h1>
        </div>
        <div
          className={`rounded-xl px-4 py-2 font-mono text-2xl font-bold tabular-nums ${
            remaining <= 60 ? "bg-red-50 text-red-600" : "bg-white text-ink-900 shadow-sm"
          }`}
        >
          {fmtClock(remaining)}
        </div>
      </header>

      <section className="rounded-xl bg-white p-5 text-sm leading-6 shadow-sm" data-selectable>
        <div className="mb-1 text-xs font-semibold text-ink-400">{spec.promptLabel}</div>
        <p className="whitespace-pre-wrap">{task.prompt}</p>
        {posts.length > 0 && (
          <div className="mt-4 grid gap-2">
            {posts.map((p, i) => (
              <div key={i} className="rounded-lg bg-sprite-50 p-3">
                {p}
              </div>
            ))}
          </div>
        )}
      </section>

      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        placeholder="여기에 답안을 작성하세요 (영어)"
        className="h-72 w-full resize-y rounded-xl border border-black/10 bg-white p-4 text-[15px] leading-7 outline-none focus:border-sprite-500"
      />

      <footer className="flex items-center gap-3">
        <span className="text-sm text-ink-600">
          <span className="font-semibold">{words}</span> 단어
          {WORD_TARGET[task.taskType] && <span className="ml-2 text-xs text-ink-400">{WORD_TARGET[task.taskType]}</span>}
        </span>
        <div className="ml-auto flex gap-2">
          {confirmQuit ? (
            <>
              <span className="self-center text-sm text-ink-600">작성한 내용이 사라져요.</span>
              <button className={ghost} onClick={() => setConfirmQuit(false)}>
                계속 쓰기
              </button>
              <button className={`${btn} bg-red-50 text-red-600`} onClick={onQuit}>
                그만두기
              </button>
            </>
          ) : (
            <button className={ghost} onClick={() => setConfirmQuit(true)}>
              그만두기
            </button>
          )}
          <button className={primary} disabled={!text.trim()} onClick={send}>
            제출하고 채점받기
          </button>
        </div>
      </footer>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ scoring

function Scoring({
  phase,
  onRetry,
  onSkip,
}: {
  phase: Extract<Phase, { kind: "scoring" }>;
  onRetry: () => void;
  onSkip: () => void;
}) {
  const [now, setNow] = useState(performance.now());
  useEffect(() => {
    if (phase.error) return;
    const id = setInterval(() => setNow(performance.now()), 500);
    return () => clearInterval(id);
  }, [phase.error]);
  const order: Stage[] = ["saving", "loading", "scoring", "translating"];
  const at = order.indexOf(phase.stage);

  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl bg-white p-8 shadow-sm">
      <h1 className="mb-1 text-lg font-bold">{phase.error ? "채점에 실패했어요" : "채점 중"}</h1>
      <p className="mb-5 text-sm text-ink-600">
        {phase.error ? "답안은 저장되었어요. 다시 시도하거나 나중에 채점할 수 있어요." : `${Math.round((now - phase.startedAt) / 1000)}초 경과`}
      </p>
      <ol className="mb-6 grid gap-2 text-sm">
        {order.map((s, i) => (
          <li key={s} className={`flex items-center gap-2 ${i > at ? "text-ink-400" : ""}`}>
            <span
              className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${
                i < at ? "bg-sprite-500 text-white" : i === at ? (phase.error ? "bg-red-500 text-white" : "animate-pulse bg-sprite-300") : "bg-sprite-50"
              }`}
            >
              {i < at ? "✓" : ""}
            </span>
            {STAGE_KO[s]}
          </li>
        ))}
      </ol>
      {phase.error && (
        <>
          <pre className="mb-4 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-red-50 p-2 text-xs text-red-700" data-selectable>
            {phase.error}
          </pre>
          <div className="flex gap-2">
            <button className={primary} onClick={onRetry}>
              다시 채점
            </button>
            {phase.attemptId > 0 && (
              <button className={ghost} onClick={onSkip}>
                채점 없이 기록 보기
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
