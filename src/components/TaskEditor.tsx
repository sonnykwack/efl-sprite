import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { TASK_SPECS } from "../lib/rubrics";
import { targetSentences } from "../lib/accuracy";
import { requiredPoints } from "../lib/scoring";
import type { Task } from "../lib/types";

interface TaskEditorProps {
  task: Task;
  onDone: (saved: boolean) => void;
}

type DraftTask = Omit<Task, "id" | "createdAt">;

const formatSecondsToReadable = (totalSeconds: number): string => {
  if (totalSeconds < 60) return `${totalSeconds}초`;
  const minutes = Math.floor(totalSeconds / 60);
  const remainderSeconds = totalSeconds % 60;
  return remainderSeconds > 0 ? `${minutes}분 ${remainderSeconds}초` : `${minutes}분`;
};

export default function TaskEditor({ task, onDone }: TaskEditorProps) {
  const spec = TASK_SPECS[task.taskType];

  const initialDraft: DraftTask = {
    section: task.section,
    taskType: task.taskType,
    title: task.title,
    prompt: task.prompt,
    material: task.material ?? null,
    prepSeconds: task.prepSeconds,
    responseSeconds: task.responseSeconds,
  };

  const [draft, setDraft] = useState<DraftTask>(initialDraft);
  const [attemptCount, setAttemptCount] = useState<number>(0);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConfirmingExit, setIsConfirmingExit] = useState<boolean>(false);

  useEffect(() => {
    let isAlive = true;
    api.countTaskAttempts(task.id)
      .then((count) => {
        if (isAlive) setAttemptCount(count);
      })
      .catch(() => {});
    return () => {
      isAlive = false;
    };
  }, [task.id]);

  const isModified =
    draft.title !== initialDraft.title ||
    draft.prompt !== initialDraft.prompt ||
    draft.material !== initialDraft.material ||
    draft.prepSeconds !== initialDraft.prepSeconds ||
    draft.responseSeconds !== initialDraft.responseSeconds;

  const handleCancelClick = () => {
    if (isModified) {
      setIsConfirmingExit(true);
    } else {
      onDone(false);
    }
  };

  const handleSave = async () => {
    setErrorMessage(null);
    if (!draft.title.trim() || !draft.prompt.trim()) {
      setErrorMessage(`제목과 ${spec.promptLabel}을(를) 입력해 주세요.`);
      return;
    }
    if (task.taskType === "listen_repeat") {
      const sentences = targetSentences(draft.material);
      if (sentences.length === 0) {
        setErrorMessage("따라 말할 문장을 한 줄에 하나씩 입력해 주세요.");
        return;
      }
    }

    setIsSaving(true);
    try {
      await api.updateTask(task.id, draft);
      onDone(true);
    } catch (err) {
      setErrorMessage(String(err));
      setIsSaving(false);
    }
  };

  const previewSentences = targetSentences(draft.material);
  const emailRequirements = task.taskType === "email" ? requiredPoints(draft.prompt) : [];
  const discussionLines = task.taskType === "academic_discussion" && draft.material
    ? draft.material.split("\n").map((line) => line.trim()).filter(Boolean)
    : [];

  return (
    <div className="space-y-6">
      {/* Upper header line */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-sprite-600">
            문제 수정 · {spec.label} <span className="font-normal text-ink-400">({spec.labelKo} · 유형은 바꿀 수 없어요)</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">
            {draft.title.trim() || "제목 없음"}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {isConfirmingExit ? (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 p-2 border border-red-200">
              <span className="text-xs font-semibold text-red-700">저장하지 않은 수정 내용이 사라져요.</span>
              <button
                type="button"
                onClick={() => setIsConfirmingExit(false)}
                className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-ink-600 border border-black/10 hover:bg-sprite-50"
              >
                계속 수정
              </button>
              <button
                type="button"
                onClick={() => onDone(false)}
                className="rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700"
              >
                나가기
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={handleCancelClick}
                className="rounded-lg border border-black/10 px-4 py-2 text-sm font-semibold text-ink-600 hover:bg-sprite-50 transition"
              >
                취소
              </button>
              <button
                type="button"
                disabled={!isModified || isSaving}
                onClick={handleSave}
                className="rounded-lg bg-sprite-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sprite-600 disabled:opacity-40"
              >
                {isSaving ? "저장 중…" : "저장"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Attempt warning */}
      {attemptCount > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
          이 문제로 응시한 기록이 {attemptCount}개 있어요. 수정하면 지난 기록의 "문제 다시 보기"에도 바뀐 내용이 보이고, 이미 매긴 점수는 바뀌지 않아요. 내용이 크게 달라진다면 수정 대신 새 문제로 추가하는 걸 권해요.
        </div>
      )}

      {/* 2-column layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Input Form */}
        <div className="space-y-4 rounded-xl bg-white p-6 shadow-sm">
          <div>
            <label htmlFor="task-title-input" className="mb-1 block text-xs font-semibold text-ink-600 cursor-pointer">
              제목
            </label>
            <input
              id="task-title-input"
              type="text"
              value={draft.title}
              onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="문제 제목 입력"
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm focus:border-sprite-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="task-prompt-textarea" className="mb-1 block text-xs font-semibold text-ink-600 cursor-pointer">
              {spec.promptLabel}
            </label>
            <textarea
              id="task-prompt-textarea"
              rows={4}
              value={draft.prompt}
              onChange={(e) => setDraft((prev) => ({ ...prev, prompt: e.target.value }))}
              placeholder={spec.promptPlaceholder}
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm focus:border-sprite-500 focus:outline-none"
            />
          </div>

          {spec.materialLabel && (
            <div>
              <label htmlFor="task-material-textarea" className="mb-1 block text-xs font-semibold text-ink-600 cursor-pointer">
                {spec.materialLabel}
              </label>
              <textarea
                id="task-material-textarea"
                rows={4}
                value={draft.material ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setDraft((prev) => ({ ...prev, material: val === "" ? null : val }));
                }}
                placeholder={spec.materialPlaceholder}
                className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm focus:border-sprite-500 focus:outline-none"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {spec.section === "speaking" && (
              <div>
                <label htmlFor="task-prep-seconds" className="mb-1 block text-xs font-semibold text-ink-600 cursor-pointer">
                  준비 시간 (초)
                </label>
                <input
                  id="task-prep-seconds"
                  type="number"
                  min={0}
                  value={draft.prepSeconds}
                  onChange={(e) => setDraft((prev) => ({ ...prev, prepSeconds: Math.max(0, Number(e.target.value)) }))}
                  className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm focus:border-sprite-500 focus:outline-none"
                />
              </div>
            )}
            <div className={spec.section === "speaking" ? "" : "col-span-2"}>
              <label htmlFor="task-response-seconds" className="mb-1 block text-xs font-semibold text-ink-600 cursor-pointer">
                {task.taskType === "listen_repeat" ? "문장당 응답 (초)" : "응답 시간 (초)"}
              </label>
              <input
                id="task-response-seconds"
                type="number"
                min={5}
                value={draft.responseSeconds}
                onChange={(e) => setDraft((prev) => ({ ...prev, responseSeconds: Math.max(5, Number(e.target.value)) }))}
                className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm focus:border-sprite-500 focus:outline-none"
              />
              <div className="mt-1 text-[11px] text-ink-400">
                = {formatSecondsToReadable(draft.responseSeconds)} · 기본값 {formatSecondsToReadable(spec.defaults.responseSeconds)}
              </div>
            </div>
          </div>

          {isModified && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setDraft(initialDraft)}
                className="text-xs font-medium text-sprite-600 underline hover:text-sprite-700"
              >
                수정 전으로 되돌리기
              </button>
            </div>
          )}

          {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}
        </div>

        {/* Right: Live Preview */}
        <div className="rounded-xl border border-dashed border-sprite-300 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-black/5 pb-3">
            <span className="text-xs font-semibold text-ink-400">학생에게 보이는 화면 (미리보기)</span>
            <span className="rounded-full bg-sprite-100 px-2.5 py-1 text-xs font-semibold text-sprite-700">
              응답 {formatSecondsToReadable(draft.responseSeconds)}
            </span>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-sprite-600">{spec.label}</div>
            <h2 className="mt-1 text-lg font-bold text-ink-900">{draft.title.trim() || "제목 없음"}</h2>
          </div>

          {/* Type-specific preview content */}
          {task.taskType === "listen_repeat" && (
            <div className="space-y-3">
              <p className="text-sm whitespace-pre-wrap text-ink-600">{draft.prompt}</p>
              <div className="space-y-1.5">
                {previewSentences.map((sentence, idx) => {
                  const wordCount = sentence.split(/\s+/).filter(Boolean).length;
                  return (
                    <div key={idx} className="flex items-center justify-between rounded-lg bg-sprite-50 px-3 py-2 text-xs">
                      <span className="font-medium text-ink-900">{idx + 1}. {sentence}</span>
                      <span className="text-ink-400">{wordCount}단어</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-ink-400">
                학생에게는 문장이 글자로 보이지 않고 소리로만 들려요 (문장 {previewSentences.length}개).
              </p>
            </div>
          )}

          {task.taskType === "interview" && (
            <div className="space-y-3">
              <div className="rounded-xl bg-sprite-50 p-4 text-base font-medium text-ink-900">
                {draft.prompt || "질문 내용을 입력해 주세요."}
              </div>
              <p className="text-xs text-ink-400">질문을 화면에 보여주고 소리로도 읽어줘요.</p>
            </div>
          )}

          {task.taskType === "email" && (
            <div className="space-y-4">
              <div className="text-sm whitespace-pre-wrap text-ink-600">
                {draft.prompt || "상황 글을 입력해 주세요."}
              </div>
              {emailRequirements.length > 0 ? (
                <div className="rounded-xl bg-sprite-50 p-4 space-y-2 border border-sprite-100">
                  <div className="text-xs font-semibold text-sprite-700">
                    채점할 요구사항 {emailRequirements.length}개 인식
                  </div>
                  <ul className="list-inside list-disc space-y-1 text-xs text-ink-600">
                    {emailRequirements.map((req, i) => (
                      <li key={i}>{req}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-xl bg-amber-50 p-4 text-xs text-amber-800 border border-amber-200">
                  요구사항이 인식되지 않았어요. ‘- explain the problem’처럼 줄 앞에 ‘- ’를 붙여 쓰면 AI가 항목별로 확인해요.
                </div>
              )}
            </div>
          )}

          {task.taskType === "academic_discussion" && (
            <div className="space-y-4">
              <div className="text-sm whitespace-pre-wrap text-ink-600">
                {draft.prompt || "교수 글을 입력해 주세요."}
              </div>
              {discussionLines.length > 0 && (
                <div className="space-y-2">
                  {discussionLines.map((line, i) => (
                    <div key={i} className="rounded-lg bg-sprite-50 px-3 py-2 text-xs font-medium text-sprite-700 border border-sprite-100">
                      {line}
                    </div>
                  ))}
                </div>
              )}
              {discussionLines.length < 2 && (
                <p className="text-xs text-amber-700">
                  다른 학생의 의견은 보통 2개예요. 한 줄에 하나씩 "이름: 의견" 형식으로 써 주세요.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}