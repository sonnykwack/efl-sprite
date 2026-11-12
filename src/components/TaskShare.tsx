import { useState, useEffect } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { openPackDialog, readPackPath, importTasks, exportPackDialog, type ParsedPack } from "../lib/taskpack";
import { generateTask, TOPIC_IDEAS, type Level } from "../lib/taskgen";
import { loadActiveModels } from "../lib/activeModels";
import { TASK_SPECS } from "../lib/rubrics";
import { targetSentences } from "../lib/accuracy";
import type { Task, TaskType, NewTask } from "../lib/types";

interface TaskShareProps {
  tasks: Task[];
  selected: Set<number> | null;
  setSelected: (s: Set<number> | null) => void;
  onChanged: () => void;
}

type PanelMode = null | "import" | "export" | "generate";

const TASK_TYPE_OPTIONS: { type: TaskType; label: string }[] = [
  { type: "email", label: `${TASK_SPECS.email.labelKo} (${TASK_SPECS.email.label})` },
  { type: "listen_repeat", label: `${TASK_SPECS.listen_repeat.labelKo} (${TASK_SPECS.listen_repeat.label})` },
  { type: "interview", label: `${TASK_SPECS.interview.labelKo} (${TASK_SPECS.interview.label})` },
  { type: "academic_discussion", label: `${TASK_SPECS.academic_discussion.labelKo} (${TASK_SPECS.academic_discussion.label})` },
];

export default function TaskShare({ tasks, selected, setSelected, onChanged }: TaskShareProps) {
  const [panelMode, setPanelMode] = useState<PanelMode>(null);

  // Import state
  const [parsedPack, setParsedPack] = useState<ParsedPack | null>(null);
  const [importing, setImporting] = useState<boolean>(false);

  // Export state
  const [exportTitle, setExportTitle] = useState<string>("");
  const [exportAuthor, setExportAuthor] = useState<string>("");

  // Generate state
  const [genType, setGenType] = useState<TaskType>("email");
  const [genTopic, setGenTopic] = useState<string>("");
  const [genLevel, setGenLevel] = useState<Level>("intermediate");
  const [genCount, setGenCount] = useState<number>(2);
  const [drafts, setDrafts] = useState<NewTask[]>([]);
  const [generating, setGenerating] = useState<boolean>(false);
  const [genProgressText, setGenProgressText] = useState<string>("");

  // Common message/status
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState<boolean>(false);

  // Drag and drop listener setup with Promise resolution for proper cleanup
  useEffect(() => {
    const unlistenPromise = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        const paths = event.payload.paths;
        const targetPath = paths.find((p) => {
          const lower = p.toLowerCase();
          return lower.endsWith(".eflsprite") || lower.endsWith(".json");
        });
        if (targetPath) {
          setImporting(true);
          setStatusMessage("파일을 읽는 중…");
          readPackPath(targetPath)
            .then((pack) => {
              setParsedPack(pack);
              setPanelMode("import");
              setSelected(null);
              setStatusMessage(null);
            })
            .catch((err) => {
              setStatusMessage(`파일 읽기 실패: ${err instanceof Error ? err.message : String(err)}`);
            })
            .finally(() => {
              setImporting(false);
            });
        }
      }
    });

    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, [setSelected]);

  // Panel toggles
  const handleTogglePanel = (target: PanelMode) => {
    setStatusMessage(null);
    if (panelMode === target) {
      setPanelMode(null);
      if (target === "export") setSelected(null);
      if (target === "import") setParsedPack(null);
    } else {
      setPanelMode(target);
      if (target === "export") {
        setSelected(new Set(tasks.map((t) => t.id)));
      } else {
        setSelected(null);
      }
      if (target === "import") {
        setParsedPack(null);
      }
    }
  };

  const handleOpenFileDialog = async () => {
    setStatusMessage(null);
    try {
      setImporting(true);
      const pack = await openPackDialog();
      if (pack) {
        setParsedPack(pack);
        setPanelMode("import");
        setSelected(null);
      }
    } catch (err) {
      setStatusMessage(`파일 열기 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!parsedPack || parsedPack.tasks.length === 0) return;
    setIsBusy(true);
    setStatusMessage("가져오는 중…");
    try {
      const [addedCount, skippedCount] = await importTasks(parsedPack.tasks);
      let msg = `${addedCount}개를 추가했어요.`;
      if (skippedCount > 0) {
        msg += ` (이미 있는 ${skippedCount}개는 건너뜀)`;
      }
      setStatusMessage(msg);
      setParsedPack(null);
      setPanelMode(null);
      onChanged();
    } catch (err) {
      setStatusMessage(`가져오기 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleExportSave = async () => {
    if (!selected || selected.size === 0) {
      setStatusMessage("내보낼 문제를 하나 이상 선택해 주세요.");
      return;
    }
    const targetTasks = tasks.filter((t) => selected.has(t.id));
    const titleToUse = exportTitle.trim() || "EFL Sprite 문제";
    const authorToUse = exportAuthor;

    setIsBusy(true);
    setStatusMessage("저장 중…");
    try {
      const savedPath = await exportPackDialog(
        targetTasks,
        titleToUse,
        authorToUse
      );
      if (savedPath) {
        setStatusMessage(`${targetTasks.length}개 문제를 저장했어요:\n${savedPath}\n\n이 파일을 카카오톡이나 USB로 학생에게 보내면, 학생은 '파일에서 가져오기'나 창에 끌어다 놓기로 추가할 수 있어요.`);
        setPanelMode(null);
        setSelected(null);
      } else {
        setStatusMessage(null);
      }
    } catch (err) {
      setStatusMessage(`내보내기 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleStartGenerate = async () => {
    setStatusMessage(null);
    setGenerating(true);
    setGenProgressText("AI 모델 확인 중…");

    try {
      const activeModelInfo = await loadActiveModels();
      if (!activeModelInfo.llm) {
        setStatusMessage("채점 AI(LLM) 모델이 필요해요. 시작하기 또는 설정 · 모델에서 받아 주세요.");
        setGenerating(false);
        setGenProgressText("");
        return;
      }

      const llmId = activeModelInfo.llm.id;
      const accumulatedDrafts: NewTask[] = [...drafts];

      for (let i = 0; i < genCount; i++) {
        setGenProgressText(`AI가 문제를 만드는 중… ${i + 1} / ${genCount}`);

        const avoidTitles = [
          ...tasks.filter((t) => t.taskType === genType).map((t) => t.title),
          ...accumulatedDrafts.filter((d) => d.taskType === genType).map((d) => d.title),
        ];

        const generatedOne = await generateTask(llmId, genType, {
          topic: genTopic,
          level: genLevel,
          avoid: avoidTitles,
        });

        accumulatedDrafts.push(generatedOne);
        // 함수형 업데이트를 사용하여 생성 중 사용자가 수정한 초안 상태를 보존하고 새 초안만 안전하게 추가
        setDrafts((prev) => [...prev, generatedOne]);
      }

      setStatusMessage(null);
    } catch (err) {
      setStatusMessage(`생성 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerating(false);
      setGenProgressText("");
    }
  };

  const handleSaveSingleDraft = async (targetDraft: NewTask) => {
    const finalizedDraft: NewTask = {
      ...targetDraft,
      material: targetDraft.material === "" ? null : targetDraft.material,
    };

    setIsBusy(true);
    setStatusMessage("저장 중…");
    try {
      const [addedCount] = await importTasks([finalizedDraft]);
      setDrafts((prev) => prev.filter((d) => d !== targetDraft));
      setStatusMessage(`${addedCount}개를 문제 목록에 추가했어요.`);
      onChanged();
    } catch (err) {
      setStatusMessage(`초안 저장 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveAllDrafts = async () => {
    if (drafts.length === 0) return;
    setIsBusy(true);
    setStatusMessage("저장 중…");
    try {
      const finalizedDrafts: NewTask[] = drafts.map((d) => ({
        ...d,
        material: d.material === "" ? null : d.material,
      }));
      const [addedCount] = await importTasks(finalizedDrafts);
      setStatusMessage(`${addedCount}개를 문제 목록에 추가했어요.`);
      setDrafts([]);
      setPanelMode(null);
      onChanged();
    } catch (err) {
      setStatusMessage(`초안 저장 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const isExportActive = panelMode === "export";
  const isGenerateActive = panelMode === "generate";
  const isImportActive = panelMode === "import";

  return (
    <div className="space-y-4 rounded-xl bg-white p-4 shadow-sm">
      {/* Top button bar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => handleTogglePanel("generate")}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
            isGenerateActive ? "bg-sprite-500 text-white" : "border border-black/10 text-ink-600 hover:bg-sprite-50"
          }`}
        >
          ✨ AI로 문제 만들기
        </button>

        <button
          type="button"
          disabled={importing}
          onClick={handleOpenFileDialog}
          className="rounded-lg border border-black/10 px-3 py-1.5 text-sm font-semibold text-ink-600 hover:bg-sprite-50 transition disabled:opacity-40"
        >
          파일에서 가져오기
        </button>

        <button
          type="button"
          disabled={tasks.length === 0}
          onClick={() => handleTogglePanel("export")}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
            isExportActive ? "bg-sprite-500 text-white" : "border border-black/10 text-ink-600 hover:bg-sprite-50"
          } disabled:opacity-40`}
        >
          파일로 내보내기
        </button>

        <span className="text-xs text-ink-400">
          .eflsprite 파일을 창에 끌어다 놓아도 가져올 수 있어요.
        </span>
      </div>

      {/* Panel 1: Import */}
      {isImportActive && parsedPack && (
        <div className="rounded-xl border border-sprite-300 bg-sprite-50 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-ink-900">
                {parsedPack.title || "문제 파일"}
                {parsedPack.author && <span className="ml-2 text-xs font-normal text-ink-400">만든 사람: {parsedPack.author}</span>}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setParsedPack(null);
                setPanelMode(null);
              }}
              className="text-xs font-medium text-ink-400 hover:text-ink-900"
            >
              취소
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
            {parsedPack.tasks.map((taskItem, idx) => {
              const spec = TASK_SPECS[taskItem.taskType];
              let summaryText = taskItem.prompt;
              if (taskItem.taskType === "listen_repeat") {
                const sents = targetSentences(taskItem.material);
                summaryText = sents.join(" / ");
              }
              return (
                <div key={idx} className="rounded-lg bg-white p-3 shadow-xs space-y-1">
                  <div className="text-[11px] font-bold text-sprite-600">{spec?.label ?? taskItem.taskType}</div>
                  <div className="font-semibold text-sm text-ink-900">{taskItem.title || "제목 없음"}</div>
                  <div className="text-xs text-ink-600 line-clamp-2">{summaryText}</div>
                </div>
              );
            })}
          </div>

          {parsedPack.problems && parsedPack.problems.length > 0 && (
            <div className="space-y-1">
              {parsedPack.problems.map((prob, i) => (
                <div key={i} className="text-xs text-amber-700 font-medium">
                  건너뜀 — {prob}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={parsedPack.tasks.length === 0 || isBusy}
              onClick={handleExecuteImport}
              className="rounded-lg bg-sprite-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sprite-600 disabled:opacity-40"
            >
              {parsedPack.tasks.length}개 문제 추가
            </button>
          </div>
        </div>
      )}

      {/* Panel 2: Export */}
      {isExportActive && (
        <div className="rounded-xl border border-sprite-300 bg-sprite-50 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-ink-600">
              아래 목록에서 내보낼 문제를 체크하세요 ({selected ? selected.size : 0}개 선택). 저장한 파일을 학생에게 카카오톡이나 USB로 보내면 돼요.
            </p>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSelected(new Set(tasks.map((t) => t.id)))}
                className="text-sprite-700 underline hover:font-semibold"
              >
                전체 선택
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-ink-400 underline hover:font-semibold"
              >
                선택 해제
              </button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-600">세트 이름</label>
              <input
                type="text"
                value={exportTitle}
                onChange={(e) => setExportTitle(e.target.value)}
                placeholder="문제 세트 이름 (예: 3주차 라이팅)"
                className="w-full rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm focus:border-sprite-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-600">만든 사람</label>
              <input
                type="text"
                value={exportAuthor}
                onChange={(e) => setExportAuthor(e.target.value)}
                placeholder="만든 사람 (예: EK 조교)"
                className="w-full rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm focus:border-sprite-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={isBusy}
              onClick={handleExportSave}
              className="rounded-lg bg-sprite-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sprite-600 disabled:opacity-40"
            >
              파일로 저장
            </button>
          </div>
        </div>
      )}

      {/* Panel 3: Generate */}
      {isGenerateActive && (
        <div className="rounded-xl border border-sprite-300 bg-sprite-50 p-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-600">유형</label>
              <select
                value={genType}
                onChange={(e) => setGenType(e.target.value as TaskType)}
                className="w-full rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm focus:border-sprite-500 focus:outline-none"
              >
                {TASK_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.type} value={opt.type}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-600">주제</label>
              <input
                type="text"
                list="topic-ideas-list"
                value={genTopic}
                onChange={(e) => setGenTopic(e.target.value)}
                placeholder="예: campus life"
                className="w-full rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm focus:border-sprite-500 focus:outline-none"
              />
              <datalist id="topic-ideas-list">
                {TOPIC_IDEAS.map((idea, idx) => (
                  <option key={idx} value={idea} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-600">난이도</label>
              <select
                value={genLevel}
                onChange={(e) => setGenLevel(e.target.value as Level)}
                className="w-full rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm focus:border-sprite-500 focus:outline-none"
              >
                <option value="intermediate">중급 (Intermediate)</option>
                <option value="advanced">고급 (Advanced)</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-600">개수</label>
              <input
                type="number"
                min={1}
                max={5}
                value={genCount}
                onChange={(e) => setGenCount(Math.max(1, Math.min(5, Number(e.target.value))))}
                className="w-full rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm focus:border-sprite-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={generating}
              onClick={handleStartGenerate}
              className="rounded-lg bg-sprite-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sprite-600 disabled:opacity-40"
            >
              만들기
            </button>
            <span className="text-xs text-ink-400">
              문제 하나에 10–40초 · 저장하기 전에 내용을 확인하고 고칠 수 있어요.
            </span>
          </div>

          {drafts.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-black/5">
              <div className="text-xs font-bold text-ink-600">생성된 초안 목록</div>
              <div className="space-y-3">
                {drafts.map((draftItem, dIndex) => (
                  <div key={dIndex} className="rounded-xl bg-white p-4 shadow-xs space-y-3 border border-sprite-300">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                          AI 생성
                        </span>
                        <span className="text-xs font-bold text-sprite-700">
                          {TASK_SPECS[draftItem.taskType]?.label ?? draftItem.taskType}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleSaveSingleDraft(draftItem)}
                          className="text-xs font-semibold text-sprite-700 hover:underline disabled:opacity-40"
                        >
                          이 문제 저장
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDrafts((prev) => prev.filter((d) => d !== draftItem));
                          }}
                          className="text-xs text-ink-400 hover:text-red-600"
                        >
                          버리기
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <label className="mb-0.5 block text-[11px] font-semibold text-ink-400">제목</label>
                        <input
                          type="text"
                          value={draftItem.title}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDrafts((prev) =>
                              prev.map((item, idx) => (idx === dIndex ? { ...item, title: val } : item))
                            );
                          }}
                          className="w-full rounded-lg border border-black/10 px-3 py-1.5 text-sm focus:border-sprite-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="mb-0.5 block text-[11px] font-semibold text-ink-400">지시문</label>
                        <textarea
                          rows={2}
                          value={draftItem.prompt}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDrafts((prev) =>
                              prev.map((item, idx) => (idx === dIndex ? { ...item, prompt: val } : item))
                            );
                          }}
                          className="w-full rounded-lg border border-black/10 px-3 py-1.5 text-sm focus:border-sprite-500 focus:outline-none"
                        />
                      </div>

                      {draftItem.material !== null && (
                        <div>
                          <label className="mb-0.5 block text-[11px] font-semibold text-ink-400">자료</label>
                          <textarea
                            rows={2}
                            value={draftItem.material}
                            onChange={(e) => {
                              const val = e.target.value;
                              setDrafts((prev) =>
                                prev.map((item, idx) => (idx === dIndex ? { ...item, material: val } : item))
                              );
                            }}
                            className="w-full rounded-lg border border-black/10 px-3 py-1.5 text-sm focus:border-sprite-500 focus:outline-none"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handleSaveAllDrafts}
                  className="rounded-lg bg-sprite-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sprite-600 disabled:opacity-40"
                >
                  모두 저장 ({drafts.length}개)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Common status bar */}
      {(generating || importing || isBusy || genProgressText) && (
        <p className="text-xs font-semibold text-sprite-600 animate-pulse">
          {genProgressText || (importing ? "가져오는 중…" : isBusy ? "저장 중…" : "")}
        </p>
      )}

      {statusMessage && (
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-xs text-ink-600" data-selectable>
          {statusMessage}
        </pre>
      )}
    </div>
  );
}