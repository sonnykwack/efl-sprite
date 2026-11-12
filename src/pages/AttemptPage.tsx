import { useEffect, useRef, useState } from "react";
import type { Navigate } from "../App";
import PageHeader from "../components/PageHeader";
import { InterviewTask, RepeatTask, type SpeakingResult } from "../components/SpeakingTasks";
import { targetSentences } from "../lib/accuracy";
import { scoreRepeatAttempt } from "../lib/repeat";
import { speakingStats, type SpeakingStats } from "../lib/scoring";
import { api, inTauri } from "../lib/api";
import { loadActiveModels, type ActiveModels } from "../lib/activeModels";
import { fmtClock, wordCount } from "../lib/format";
import { TASK_SPECS } from "../lib/rubrics";
import { STAGE_KO, scoreAttempt, type ScoringMode, type Stage } from "../lib/submit";
import type { Student, Task } from "../lib/types";

const WORD_LIMITS: Partial<Record<Task["taskType"], string>> = {
  email: "권장 120–150 단어",
  academic_discussion: "권장 100 단어 이상",
};

const UI_BUTTON = "rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-40";
const BUTTON_PRIMARY = `${UI_BUTTON} bg-sprite-500 text-white hover:bg-sprite-600`;
const BUTTON_GHOST = `${UI_BUTTON} border border-black/10 text-ink-600 hover:bg-sprite-50`;

type ExamPhase =
  | { mode: "select" }
  | { mode: "active_task"; task: Task; startTime: number; savedDraft?: string }
  | {
      mode: "evaluating";
      task: Task;
      attemptId: number;
      textResponse: string;
      currentStage: Stage;
      startTime: number;
      errorMessage?: string;
      metrics?: SpeakingStats;
      subNote?: string;
    };

const PIPELINE_STEPS: Record<Task["taskType"], Stage[]> = {
  listen_repeat: ["saving", "transcribing"],
  interview: ["transcribing", "saving", "grammar", "loading", "scoring", "translating"],
  email: ["saving", "grammar", "loading", "scoring", "translating"],
  academic_discussion: ["saving", "grammar", "loading", "scoring", "translating"],
};

export default function AttemptPage({ navigate }: { navigate: Navigate }) {
  const [examPhase, setExamPhase] = useState<ExamPhase>({ mode: "select" });
  const [studentList, setStudentList] = useState<Student[]>([]);
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [inputStudentName, setInputStudentName] = useState("");
  const [isSubmittingStudent, setIsSubmittingStudent] = useState(false);
  const [scoringMode, setScoringMode] = useState<ScoringMode>("quick");
  const [systemModels, setSystemModels] = useState<ActiveModels | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    if (!inTauri()) return;
    api.listStudents().then(setStudentList).catch((err) => setGlobalError(String(err)));
    api.listTasks().then(setTaskList).catch((err) => setGlobalError(String(err)));
    loadActiveModels().then(setSystemModels).catch(() => setSystemModels(null));
  }, []);

  const handleRegisterStudent = async () => {
    const cleanName = inputStudentName.trim();
    if (!cleanName || isSubmittingStudent) return;
    setIsSubmittingStudent(true);
    try {
      const newId = await api.createStudent(cleanName);
      setInputStudentName("");
      const updated = await api.listStudents();
      setStudentList(updated);
      setSelectedStudentId(newId);
    } catch (err) {
      setGlobalError(String(err));
    } finally {
      setIsSubmittingStudent(false);
    }
  };

  const processScoringPipeline = async (
    targetTask: Task,
    recordId: number,
    responseBody: string,
    statsData?: SpeakingStats
  ) => {
    const startTime = performance.now();
    const updateStage = (stage: Stage, errText?: string) =>
      setExamPhase({
        mode: "evaluating",
        task: targetTask,
        attemptId: recordId,
        textResponse: responseBody,
        currentStage: stage,
        startTime,
        errorMessage: errText,
        metrics: statsData,
      });

    updateStage("loading");
    try {
      await scoreAttempt(
        {
          attemptId: recordId,
          taskType: targetTask.taskType,
          prompt: targetTask.prompt,
          material: targetTask.material,
          responseText: responseBody,
          stats: statsData,
        },
        scoringMode,
        (s) => updateStage(s)
      );
      navigate({ page: "result", attemptId: recordId });
    } catch (err) {
      updateStage("scoring", String(err));
    }
  };

  const handleWritingSubmission = async (targetTask: Task, textContent: string, durationSec: number) => {
    setExamPhase({
      mode: "evaluating",
      task: targetTask,
      attemptId: -1,
      textResponse: textContent,
      currentStage: "saving",
      startTime: performance.now(),
    });

    try {
      const attemptId = await api.createAttempt({
        taskId: targetTask.id,
        studentId: selectedStudentId,
        responseText: textContent,
        audioPath: null,
        durationSeconds: durationSec,
      });
      await processScoringPipeline(targetTask, attemptId, textContent);
    } catch (err) {
      setGlobalError(`저장 실패: ${String(err)}`);
      setExamPhase({
        mode: "active_task",
        task: targetTask,
        startTime: performance.now() - durationSec * 1000,
        savedDraft: textContent,
      });
    }
  };

  const handleRepeatSubmission = async (targetTask: Task, resData: SpeakingResult) => {
    const startTime = performance.now();
    const baseState = { mode: "evaluating" as const, task: targetTask, textResponse: "", startTime };
    setExamPhase({ ...baseState, attemptId: -1, currentStage: "saving" });

    let createdId = -1;
    try {
      createdId = await api.createAttempt({
        taskId: targetTask.id,
        studentId: selectedStudentId,
        responseText: "",
        audioPath: JSON.stringify(resData.audioPaths),
        durationSeconds: Math.round(resData.seconds),
      });

      const sentenceArray = targetSentences(targetTask.material);
      await scoreRepeatAttempt(createdId, sentenceArray, resData.audioPaths, (doneCount, totalCount) =>
        setExamPhase({
          ...baseState,
          attemptId: createdId,
          currentStage: "transcribing",
          subNote: `${Math.min(doneCount + 1, totalCount)} / ${totalCount} 문장`,
        })
      );
      navigate({ page: "result", attemptId: createdId });
    } catch (err) {
      setExamPhase({
        ...baseState,
        attemptId: createdId,
        currentStage: createdId > 0 ? "transcribing" : "saving",
        errorMessage: String(err),
      });
    }
  };

  const handleInterviewSubmission = async (targetTask: Task, resData: SpeakingResult) => {
    const startTime = performance.now();
    const audioFilePath = resData.audioPaths[0];

    if (!audioFilePath) {
      setGlobalError("목소리가 녹음되지 않았어요. 마이크를 확인하고 다시 시도해 주세요.");
      setExamPhase({ mode: "select" });
      return;
    }

    setExamPhase({
      mode: "evaluating",
      task: targetTask,
      attemptId: -1,
      textResponse: "",
      currentStage: "transcribing",
      startTime,
    });

    try {
      if (!systemModels?.whisper) throw new Error("설치된 음성 인식(Whisper) 모델이 없습니다.");
      const transcribedText = (await api.transcribe(audioFilePath, systemModels.whisper.id)).trim();
      const statsObj = speakingStats(transcribedText, resData.seconds);

      setExamPhase({
        mode: "evaluating",
        task: targetTask,
        attemptId: -1,
        textResponse: transcribedText,
        currentStage: "saving",
        startTime,
        metrics: statsObj,
      });

      const attemptId = await api.createAttempt({
        taskId: targetTask.id,
        studentId: selectedStudentId,
        responseText: transcribedText,
        audioPath: audioFilePath,
        durationSeconds: Math.round(resData.seconds),
      });

      await processScoringPipeline(targetTask, attemptId, transcribedText, statsObj);
    } catch (err) {
      setExamPhase({
        mode: "evaluating",
        task: targetTask,
        attemptId: -1,
        textResponse: "",
        currentStage: "transcribing",
        startTime,
        errorMessage: String(err),
      });
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

  if (examPhase.mode === "active_task" && examPhase.task.taskType === "listen_repeat") {
    const currentTask = examPhase.task;
    return (
      <RepeatTask
        task={currentTask}
        sentences={targetSentences(currentTask.material)}
        onDone={(res) => handleRepeatSubmission(currentTask, res)}
        onQuit={() => setExamPhase({ mode: "select" })}
      />
    );
  }

  if (examPhase.mode === "active_task" && examPhase.task.taskType === "interview") {
    const currentTask = examPhase.task;
    return (
      <InterviewTask
        task={currentTask}
        onDone={(res) => handleInterviewSubmission(currentTask, res)}
        onQuit={() => setExamPhase({ mode: "select" })}
      />
    );
  }

  if (examPhase.mode === "active_task") {
    return (
      <WritingWorkspace
        task={examPhase.task}
        startTime={examPhase.startTime}
        initialDraft={examPhase.savedDraft ?? ""}
        errorMsg={globalError}
        onSubmitAttempt={(txt, sec) => handleWritingSubmission(examPhase.task, txt, sec)}
        onExitAttempt={() => setExamPhase({ mode: "select" })}
      />
    );
  }

  if (examPhase.mode === "evaluating") {
    return (
      <EvaluationProgress
        phaseInfo={examPhase}
        onRetryAttempt={() =>
          examPhase.task.taskType === "listen_repeat" || examPhase.attemptId < 0
            ? setExamPhase({ mode: "select" })
            : processScoringPipeline(examPhase.task, examPhase.attemptId, examPhase.textResponse, examPhase.metrics)
        }
        onBypassResult={() => navigate({ page: "result", attemptId: examPhase.attemptId })}
      />
    );
  }

  const activeStudent = studentList.find((s) => s.id === selectedStudentId);

  return (
    <>
      <PageHeader title="응시" subtitle="학생과 문제를 고르면 바로 시작합니다." />

      {!systemModels?.whisper && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          스피킹 문제를 풀려면 음성 인식(Whisper) 모델이 필요해요.{" "}
          <button className="font-semibold text-sprite-700 underline" onClick={() => navigate({ page: "settings" })}>
            설정 · 모델
          </button>
          에서 다운로드해 주세요.
        </div>
      )}

      {!systemModels?.llm && (
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
          {studentList.map((stu) => (
            <button
              key={stu.id}
              onClick={() => setSelectedStudentId(stu.id)}
              className={`rounded-full border px-3 py-1 text-sm ${
                stu.id === selectedStudentId ? "border-sprite-500 bg-sprite-50 font-semibold text-sprite-700" : "border-black/10"
              }`}
            >
              {stu.name}
            </button>
          ))}
          <form
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              handleRegisterStudent();
            }}
          >
            <input
              value={inputStudentName}
              onChange={(e) => setInputStudentName(e.target.value)}
              placeholder="새 학생 이름"
              disabled={isSubmittingStudent}
              className="w-32 rounded-full border border-black/10 px-3 py-1 text-sm outline-none focus:border-sprite-500 disabled:opacity-50"
            />
            <button
              disabled={!inputStudentName.trim() || isSubmittingStudent}
              className="rounded-full bg-sprite-100 px-3 text-sm text-sprite-700 disabled:opacity-40"
            >
              {isSubmittingStudent ? "추가 중..." : "추가"}
            </button>
          </form>
        </div>
        {!activeStudent && <p className="mt-2 text-xs text-ink-400">학생을 고르지 않으면 이름 없이 기록됩니다.</p>}
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
            ).map(([mKey, labelText, hintText]) => (
              <button
                key={mKey}
                onClick={() => setScoringMode(mKey)}
                className={`rounded-md px-3 py-1 ${
                  scoringMode === mKey ? "bg-white font-semibold text-sprite-700 shadow-sm" : "text-ink-600"
                }`}
              >
                {labelText} <span className="font-normal text-ink-400">{hintText}</span>
              </button>
            ))}
          </div>
        </div>

        {taskList.length === 0 && (
          <p className="text-sm text-ink-400">
            등록된 문제가 없어요.{" "}
            <button className="text-sprite-700 underline" onClick={() => navigate({ page: "tasks" })}>
              문제 관리
            </button>
            에서 먼저 추가해 주세요.
          </p>
        )}

        <ul className="grid gap-2">
          {taskList.map((tItem) => {
            const specInfo = TASK_SPECS[tItem.taskType];
            const requiresWhisper = specInfo.section === "speaking";
            const requiresLlm = tItem.taskType !== "listen_repeat";
            const isReady =
              (!requiresWhisper || !!systemModels?.whisper) && (!requiresLlm || !!systemModels?.llm);

            return (
              <li key={tItem.id}>
                <button
                  disabled={!isReady}
                  onClick={() => {
                    setGlobalError(null);
                    setExamPhase({ mode: "active_task", task: tItem, startTime: performance.now() });
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-black/10 p-3 text-left hover:border-sprite-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-sprite-600">
                      {specInfo.label} <span className="font-normal normal-case text-ink-400">{fmtClock(tItem.responseSeconds)}</span>
                    </div>
                    <div className="truncate font-semibold">{tItem.title}</div>
                  </div>
                  <span className="shrink-0 text-xs text-ink-400">
                    {isReady ? "시작 →" : requiresWhisper && !systemModels?.whisper ? "Whisper 모델 필요" : "LLM 모델 필요"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {systemModels?.llm && (
        <p className="text-xs text-ink-400">
          채점 모델: {systemModels.llm.name} · 프롬프트 {systemModels.prompt}
        </p>
      )}
      {globalError && <p className="mt-2 text-sm text-red-600">{globalError}</p>}
    </>
  );
}

function WritingWorkspace({
  task,
  startTime,
  initialDraft,
  errorMsg,
  onSubmitAttempt,
  onExitAttempt,
}: {
  task: Task;
  startTime: number;
  initialDraft: string;
  errorMsg: string | null;
  onSubmitAttempt: (text: string, durationSec: number) => void;
  onExitAttempt: () => void;
}) {
  const specDetails = TASK_SPECS[task.taskType];
  const [content, setContent] = useState(initialDraft);
  const [currentTime, setCurrentTime] = useState(performance.now());
  const [askQuitConfirmation, setAskQuitConfirmation] = useState(false);
  const hasSubmittedRef = useRef(false);

  const passedSeconds = (currentTime - startTime) / 1000;
  const timeLeft = task.responseSeconds - passedSeconds;
  const currentWordCount = wordCount(content);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(performance.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const triggerSubmission = () => {
    if (hasSubmittedRef.current || !content.trim()) return;
    hasSubmittedRef.current = true;
    onSubmitAttempt(content, Math.round(Math.min(passedSeconds, task.responseSeconds)));
  };

  useEffect(() => {
    if (timeLeft <= 0) {
      triggerSubmission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft <= 0]);

  const materialLines = (task.material ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  return (
    <div className="mx-auto grid max-w-4xl gap-4">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-sprite-600">{specDetails.label}</div>
          <h1 className="text-xl font-bold">{task.title}</h1>
        </div>
        <div
          className={`rounded-xl px-4 py-2 font-mono text-2xl font-bold tabular-nums ${
            timeLeft <= 60 ? "bg-red-50 text-red-600" : "bg-white text-ink-900 shadow-sm"
          }`}
        >
          {fmtClock(timeLeft)}
        </div>
      </header>

      <section className="rounded-xl bg-white p-5 text-sm leading-6 shadow-sm" data-selectable>
        <div className="mb-1 text-xs font-semibold text-ink-400">{specDetails.promptLabel}</div>
        <p className="whitespace-pre-wrap">{task.prompt}</p>
        {materialLines.length > 0 && (
          <div className="mt-4 grid gap-2">
            {materialLines.map((line, idx) => (
              <div key={idx} className="rounded-lg bg-sprite-50 p-3">
                {line}
              </div>
            ))}
          </div>
        )}
      </section>

      <textarea
        autoFocus
        value={content}
        onChange={(e) => setContent(e.target.value)}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        placeholder="여기에 답안을 작성하세요 (영어)"
        className="h-72 w-full resize-y rounded-xl border border-black/10 bg-white p-4 text-[15px] leading-7 outline-none focus:border-sprite-500"
      />

      <footer className="flex items-center gap-3">
        <span className="text-sm text-ink-600">
          <span className="font-semibold">{currentWordCount}</span> 단어
          {WORD_LIMITS[task.taskType] && <span className="ml-2 text-xs text-ink-400">{WORD_LIMITS[task.taskType]}</span>}
        </span>
        <div className="ml-auto flex gap-2">
          {askQuitConfirmation ? (
            <>
              <span className="self-center text-sm text-ink-600">작성한 답안은 저장되지 않고 사라져요.</span>
              <button className={BUTTON_GHOST} onClick={() => setAskQuitConfirmation(false)}>
                계속 쓰기
              </button>
              <button className={`${UI_BUTTON} bg-red-50 text-red-600`} onClick={onExitAttempt}>
                그만두기
              </button>
            </>
          ) : (
            <button className={BUTTON_GHOST} onClick={() => setAskQuitConfirmation(true)}>
              그만두기
            </button>
          )}
          <button className={BUTTON_PRIMARY} disabled={!content.trim()} onClick={triggerSubmission}>
            제출하고 채점받기
          </button>
        </div>
      </footer>
      {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
    </div>
  );
}

function EvaluationProgress({
  phaseInfo,
  onRetryAttempt,
  onBypassResult,
}: {
  phaseInfo: Extract<ExamPhase, { mode: "evaluating" }>;
  onRetryAttempt: () => void;
  onBypassResult: () => void;
}) {
  const [elapsedClock, setElapsedClock] = useState(performance.now());
  useEffect(() => {
    if (phaseInfo.errorMessage) return;
    const intervalId = setInterval(() => setElapsedClock(performance.now()), 500);
    return () => clearInterval(intervalId);
  }, [phaseInfo.errorMessage]);

  const sequenceOrder = PIPELINE_STEPS[phaseInfo.task.taskType];
  const activeIndex = sequenceOrder.indexOf(phaseInfo.currentStage);

  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl bg-white p-8 shadow-sm">
      <h1 className="mb-1 text-lg font-bold">{phaseInfo.errorMessage ? "채점에 실패했어요" : "채점 중"}</h1>
      <p className="mb-5 text-sm text-ink-600">
        {phaseInfo.errorMessage
          ? "답안은 저장되었어요. 다시 시도하거나 나중에 채점할 수 있어요."
          : `${Math.round((elapsedClock - phaseInfo.startTime) / 1000)}초 경과`}
      </p>
      <ol className="mb-6 grid gap-2 text-sm">
        {sequenceOrder.map((stepKey, idx) => (
          <li key={stepKey} className={`flex items-center gap-2 ${idx > activeIndex ? "text-ink-400" : ""}`}>
            <span
              className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${
                idx < activeIndex
                  ? "bg-sprite-500 text-white"
                  : idx === activeIndex
                  ? phaseInfo.errorMessage
                    ? "bg-red-500 text-white"
                    : "animate-pulse bg-sprite-300"
                  : "bg-sprite-50"
              }`}
            >
              {idx < activeIndex ? "✓" : ""}
            </span>
            {STAGE_KO[stepKey]}
            {idx === activeIndex && phaseInfo.subNote && <span className="text-ink-400">{phaseInfo.subNote}</span>}
          </li>
        ))}
      </ol>
      {phaseInfo.errorMessage && (
        <>
          <pre className="mb-4 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-red-50 p-2 text-xs text-red-700" data-selectable>
            {phaseInfo.errorMessage}
          </pre>
          <div className="flex gap-2">
            <button className={BUTTON_PRIMARY} onClick={onRetryAttempt}>
              다시 채점
            </button>
            {phaseInfo.attemptId > 0 && (
              <button className={BUTTON_GHOST} onClick={onBypassResult}>
                채점 없이 기록 보기
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}