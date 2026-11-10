import { useState, useEffect, useCallback } from "react";
import PageHeader from "../components/PageHeader";
import TaskShare from "../components/TaskShare";
import TaskEditor from "../components/TaskEditor";
import { api, inTauri } from "../lib/api";
import { TASK_SPECS, TASK_TYPES_BY_SECTION } from "../lib/rubrics";
import { targetSentences } from "../lib/accuracy";
import type { Task, TaskType, NewTask } from "../lib/types";

const formatSecondsToReadable = (totalSeconds: number): string => {
  if (totalSeconds < 60) return `${totalSeconds}초`;
  const minutes = Math.floor(totalSeconds / 60);
  const remainderSeconds = totalSeconds % 60;
  return remainderSeconds > 0 ? `${minutes}분 ${remainderSeconds}초` : `${minutes}분`;
};

const createDefaultNewTask = (taskType: TaskType): NewTask => {
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
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<Set<number> | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [newTaskInput, setNewTaskInput] = useState<NewTask>(createDefaultNewTask("interview"));
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingPromptInfo, setDeletingPromptInfo] = useState<{ id: number; attempts: number } | null>(null);
  const [isSubmittingNew, setIsSubmittingNew] = useState<boolean>(false);

  const refreshTasks = useCallback(() => {
    if (!inTauri()) return;
    api.listTasks()
      .then((res) => setTasks(res))
      .catch((err) => setFormError(String(err)));
  }, []);

  useEffect(() => {
    refreshTasks();
  }, [refreshTasks]);

  const handleTypeSwitch = (newType: TaskType) => {
    setNewTaskInput((prev) => ({
      ...createDefaultNewTask(newType),
      title: prev.title,
    }));
    setFormError(null);
  };

  const handleCreateTask = async () => {
    setFormError(null);
    const spec = TASK_SPECS[newTaskInput.taskType];

    if (!newTaskInput.title.trim() || !newTaskInput.prompt.trim()) {
      setFormError(`제목과 ${spec.promptLabel}을(를) 입력해 주세요.`);
      return;
    }
    if (newTaskInput.taskType === "listen_repeat") {
      const sentences = targetSentences(newTaskInput.material);
      if (sentences.length === 0) {
        setFormError("따라 말할 문장을 한 줄에 하나씩 입력해 주세요.");
        return;
      }
    }

    setIsSubmittingNew(true);
    try {
      await api.createTask({
        ...newTaskInput,
        material: newTaskInput.material === "" ? null : newTaskInput.material,
      });
      setNewTaskInput(createDefaultNewTask(newTaskInput.taskType));
      refreshTasks();
    } catch (err) {
      setFormError(String(err));
    } finally {
      setIsSubmittingNew(false);
    }
  };

  const handleRequestDelete = async (task: Task) => {
    setFormError(null);
    let count = 0;
    try {
      count = await api.countTaskAttempts(task.id);
    } catch {
      count = 0;
    }
    setDeletingPromptInfo({ id: task.id, attempts: count });
  };

  const handleConfirmDelete = async (taskId: number) => {
    setFormError(null);
    try {
      await api.deleteTask(taskId);
      setDeletingPromptInfo(null);
      refreshTasks();
    } catch (err) {
      setFormError(String(err));
    }
  };

  if (editingTask) {
    return (
      <TaskEditor
        task={editingTask}
        onDone={(saved) => {
          const title = editingTask.title;
          setEditingTask(null);
          if (saved) {
            setNoticeMessage(`"${title || "제목 없음"}" 문제를 수정했어요.`);
            refreshTasks();
          } else {
            setNoticeMessage(null);
          }
        }}
      />
    );
  }

  const currentSpec = TASK_SPECS[newTaskInput.taskType];

  return (
    <div className="space-y-6">
      <PageHeader
        title="문제 관리"
        subtitle="TOEFL iBT(2026) 형식의 스피킹·라이팅 문제를 등록합니다."
      />

      {inTauri() && (
        <TaskShare
          tasks={tasks}
          selected={selected}
          setSelected={setSelected}
          onChanged={refreshTasks}
        />
      )}

      {/* New task input card */}
      <div className="rounded-xl bg-white p-6 shadow-sm space-y-5">
        <div className="grid gap-6 lg:grid-cols-2">
          {(["speaking", "writing"] as const).map((secKey) => (
            <div key={secKey} className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-400 capitalize">{secKey}</h3>
              <div className="grid grid-cols-2 gap-2">
                {TASK_TYPES_BY_SECTION[secKey].map((tType) => {
                  const s = TASK_SPECS[tType];
                  const active = newTaskInput.taskType === tType;
                  return (
                    <button
                      key={tType}
                      type="button"
                      onClick={() => handleTypeSwitch(tType)}
                      className={`flex flex-col items-start rounded-xl p-3 text-left transition ${
                        active
                          ? "border-2 border-sprite-500 bg-sprite-50 font-bold text-sprite-700 shadow-xs"
                          : "border border-black/10 bg-white text-ink-600 hover:bg-sprite-50"
                      }`}
                    >
                      <span className="text-sm font-semibold">{s.labelKo}</span>
                      <span className="text-[11px] font-normal text-ink-400">
                        {s.label} · {s.scoring === "accuracy" ? "정확도 채점" : "AI 루브릭 채점"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Form Fields */}
        <div className="space-y-4 pt-2 border-t border-black/5">
          <div>
            <label htmlFor="new-task-title" className="mb-1 block text-xs font-semibold text-ink-600 cursor-pointer">
              제목
            </label>
            <input
              id="new-task-title"
              type="text"
              value={newTaskInput.title}
              onChange={(e) => setNewTaskInput((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="제목 (예: Week 3 — Personal finance)"
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm focus:border-sprite-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="new-task-prompt" className="mb-1 block text-xs font-semibold text-ink-600 cursor-pointer">
              {currentSpec.promptLabel}
            </label>
            <textarea
              id="new-task-prompt"
              rows={3}
              value={newTaskInput.prompt}
              onChange={(e) => setNewTaskInput((prev) => ({ ...prev, prompt: e.target.value }))}
              placeholder={currentSpec.promptPlaceholder}
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm focus:border-sprite-500 focus:outline-none"
            />
          </div>

          {currentSpec.materialLabel && (
            <div>
              <label htmlFor="new-task-material" className="mb-1 block text-xs font-semibold text-ink-600 cursor-pointer">
                {currentSpec.materialLabel}
              </label>
              <textarea
                id="new-task-material"
                rows={3}
                value={newTaskInput.material ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewTaskInput((prev) => ({ ...prev, material: val === "" ? null : val }));
                }}
                placeholder={currentSpec.materialPlaceholder}
                className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm focus:border-sprite-500 focus:outline-none"
              />
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-ink-600">
                {newTaskInput.taskType === "listen_repeat" ? "문장당 응답" : "응답 시간"}
              </span>
              <input
                type="number"
                min={5}
                value={newTaskInput.responseSeconds}
                onChange={(e) => setNewTaskInput((prev) => ({ ...prev, responseSeconds: Math.max(5, Number(e.target.value)) }))}
                className="w-24 rounded-lg border border-black/10 px-3 py-1.5 text-sm focus:border-sprite-500 focus:outline-none"
              />
              <span className="text-xs text-ink-600">초</span>
              <span className="text-xs text-ink-400">기본값: {formatSecondsToReadable(currentSpec.defaults.responseSeconds)}</span>
            </div>

            <button
              type="button"
              disabled={isSubmittingNew}
              onClick={handleCreateTask}
              className="rounded-lg bg-sprite-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sprite-600 disabled:opacity-40"
            >
              문제 추가
            </button>
          </div>

          {formError && <p className="text-xs text-red-600">{formError}</p>}
        </div>
      </div>

      {/* Notice Message */}
      {noticeMessage && (
        <div className="rounded-xl bg-sprite-50 p-4 text-sm text-sprite-700 border border-sprite-100 shadow-sm flex items-center justify-between">
          <span>{noticeMessage}</span>
          <button
            type="button"
            onClick={() => setNoticeMessage(null)}
            className="text-xs font-medium text-ink-400 hover:text-ink-900"
          >
            닫기
          </button>
        </div>
      )}

      {/* Tasks List */}
      <div className="space-y-3">
        {tasks.length === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center text-sm text-ink-400 shadow-sm">
            {inTauri() ? "등록된 문제가 없습니다." : "브라우저 미리보기 모드 — 앱(npm run tauri dev)에서 실행하면 저장됩니다."}
          </div>
        ) : (
          tasks.map((taskItem) => {
            const spec = TASK_SPECS[taskItem.taskType];
            let summaryContent = taskItem.prompt;
            if (taskItem.taskType === "listen_repeat") {
              const sents = targetSentences(taskItem.material);
              summaryContent = sents.join(" / ");
            }
            const isDeleting = deletingPromptInfo?.id === taskItem.id;
            const isSelectedChecked = selected ? selected.has(taskItem.id) : false;

            return (
              <div
                key={taskItem.id}
                className="flex items-center justify-between gap-4 rounded-xl bg-white p-4 shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {selected !== null && (
                    <input
                      type="checkbox"
                      checked={isSelectedChecked}
                      onChange={(e) => {
                        const nextSet = new Set(selected);
                        if (e.target.checked) {
                          nextSet.add(taskItem.id);
                        } else {
                          nextSet.delete(taskItem.id);
                        }
                        setSelected(nextSet);
                      }}
                      className="h-4 w-4 rounded border-black/20 text-sprite-500 focus:ring-sprite-500"
                    />
                  )}

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-sprite-600">
                      {taskItem.section} · {spec?.label ?? taskItem.taskType}
                      <span className="ml-2 font-normal text-ink-400">
                        · 응답 {formatSecondsToReadable(taskItem.responseSeconds)}
                        {taskItem.taskType === "listen_repeat" ? ` · ${targetSentences(taskItem.material).length}문장` : ""}
                      </span>
                    </div>

                    <h4 className="font-bold text-ink-900 truncate">{taskItem.title || "제목 없음"}</h4>

                    <p className="text-xs text-ink-600 line-clamp-2" data-selectable>
                      {summaryContent}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {isDeleting ? (
                    <div className="flex items-center gap-2 rounded-xl bg-red-50 p-2 border border-red-200">
                      <span className="text-xs font-semibold text-red-700">
                        {deletingPromptInfo.attempts > 0
                          ? `응시 기록 ${deletingPromptInfo.attempts}개와 채점 결과도 함께 삭제돼요.`
                          : "이 문제를 삭제할까요?"}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleConfirmDelete(taskItem.id)}
                        className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
                      >
                        삭제
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingPromptInfo(null)}
                        className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-ink-600 border border-black/10 hover:bg-sprite-50"
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setNoticeMessage(null);
                          setEditingTask(taskItem);
                        }}
                        className="rounded-lg bg-sprite-50 px-3 py-1.5 text-xs font-semibold text-sprite-700 hover:bg-sprite-100 transition"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRequestDelete(taskItem)}
                        className="text-xs text-ink-400 hover:text-red-900 transition px-1"
                      >
                        삭제
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}