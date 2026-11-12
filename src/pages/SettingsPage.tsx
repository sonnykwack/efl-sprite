import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import GecLab from "../components/GecLab";
import ScoringLab from "../components/ScoringLab";
import { api, inTauri } from "../lib/api";
import type { AppInfo, DownloadProgress, ModelEntry, ModelKind } from "../lib/types";

const formatBytesToMegabytes = (byteValue: number): string => (byteValue / (1024 * 1024)).toFixed(0);

const resolveEngineStatusText = (isInstalled: boolean, developmentMode: boolean, installScriptCommand: string): string => {
  if (isInstalled) return "✅ 설치됨";
  return developmentMode ? `❌ 없음 — ${installScriptCommand}` : "❌ 없음 — 앱을 다시 설치해 주세요";
};

export default function SettingsPage() {
  const [details, setDetails] = useState<AppInfo | null>(null);
  const [catalog, setCatalog] = useState<ModelEntry[]>([]);
  const [transferProgressMap, setTransferProgressMap] = useState<Record<string, DownloadProgress>>({});
  const [diagnosticLog, setDiagnosticLog] = useState<string>("");
  const [isOperationLocked, setIsOperationLocked] = useState<boolean>(false);

  const fetchDashboardData = () => {
    api.appInfo()
      .then((res) => setDetails(res))
      .catch((err) => setDiagnosticLog(String(err)));

    api.listModels()
      .then((res) => setCatalog(res))
      .catch((err) => setDiagnosticLog(String(err)));
  };

  useEffect(() => {
    if (!inTauri()) return;
    fetchDashboardData();

    const progressSubscriptionPromise = api.onDownloadProgress((updatePayload) => {
      setTransferProgressMap((prevMap) => ({ ...prevMap, [updatePayload.id]: updatePayload }));
      if (updatePayload.done) {
        fetchDashboardData();
      }
    });

    return () => {
      progressSubscriptionPromise.then((unsubscribe) => unsubscribe());
    };
  }, []);

  const runDiagnosticProcedure = async (taskTitle: string, actionCallback: () => Promise<string>) => {
    setIsOperationLocked(true);
    setDiagnosticLog(`${taskTitle} 실행 중…`);
    const startTimeStamp = performance.now();

    try {
      const outcomeMessage = await actionCallback();
      const elapsedSeconds = ((performance.now() - startTimeStamp) / 1000).toFixed(1);
      setDiagnosticLog(`${taskTitle} (${elapsedSeconds}s)\n\n${outcomeMessage}`);
    } catch (err) {
      setDiagnosticLog(`${taskTitle} 실패\n\n${String(err)}`);
    } finally {
      setIsOperationLocked(false);
    }
  };

  const findActiveWhisperModel = () => catalog.find((m) => m.kind === "whisper" && m.installed);
  const findActiveLlmModel = () => catalog.find((m) => m.kind === "llm" && m.installed);

  const triggerWhisperDiagnostic = () => {
    const targetModel = findActiveWhisperModel();
    if (!targetModel) {
      setDiagnosticLog("설치된 Whisper 모델이 없습니다.");
      return;
    }
    runDiagnosticProcedure(`Whisper 테스트 (${targetModel.name})`, () => api.transcribe("__sample__", targetModel.id));
  };

  const triggerLlmDiagnostic = () => {
    const targetModel = findActiveLlmModel();
    if (!targetModel) {
      setDiagnosticLog("설치된 LLM 모델이 없습니다.");
      return;
    }
    runDiagnosticProcedure(`LLM 테스트 (${targetModel.name})`, async () => {
      await api.llmStart(targetModel.id);
      return api.llmChat([
        { role: "system", content: "You are a concise English tutor." },
        { role: "user", content: "In one sentence, encourage a student before a TOEFL speaking test." },
      ]);
    });
  };

  if (!inTauri()) {
    return (
      <div className="space-y-4">
        <PageHeader title="설정 · 모델" />
        <p className="text-sm text-ink-600">앱(npm run tauri dev)에서 실행해야 모델을 관리할 수 있습니다.</p>
      </div>
    );
  }

  const isDevEnvironment = import.meta.env.DEV;
  const engineEngines = details?.engines;

  return (
    <div className="space-y-6">
      <PageHeader title="설정 · 모델" subtitle="온디바이스 AI 엔진과 모델을 관리합니다." />

      {details && (
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <span className="text-ink-400">버전</span>
            <span className="font-medium">{details.version}</span>

            <span className="text-ink-400">플랫폼</span>
            <span className="font-medium">{details.platform} / {details.arch}</span>

            <span className="text-ink-400">Whisper 엔진</span>
            <span>{resolveEngineStatusText(!!engineEngines?.whisper, isDevEnvironment, "npm run fetch-engines")}</span>

            <span className="text-ink-400">LLM 엔진 (llama-server)</span>
            <span>{resolveEngineStatusText(!!engineEngines?.llama, isDevEnvironment, "npm run fetch-engines")}</span>

            <span className="text-ink-400">문법 모델 런타임 (ONNX)</span>
            <span>{resolveEngineStatusText(!!engineEngines?.onnxruntime, isDevEnvironment, "npm run fetch-engines -- --only=ort")}</span>

            <span className="text-ink-400">모델 폴더</span>
            <span className="truncate font-mono text-xs text-ink-600" data-selectable title={details.modelsDir}>
              {details.modelsDir}
            </span>
          </div>
        </section>
      )}

      {(["whisper", "llm", "gec"] as ModelKind[]).map((groupKind) => {
        const labelMap: Record<ModelKind, string> = {
          whisper: "음성 인식 (Whisper)",
          llm: "채점 · 생성 (LLM)",
          gec: "문법 교정 (GECToR)",
        };

        const filteredList = catalog.filter((entry) => entry.kind === groupKind);

        return (
          <section key={groupKind} className="space-y-3">
            <h3 className="text-sm font-bold text-ink-600">{labelMap[groupKind]}</h3>
            <div className="grid gap-2">
              {filteredList.map((modelEntry) => {
                const currentProgress = transferProgressMap[modelEntry.id];
                const activeDownloading = currentProgress && !currentProgress.done && !currentProgress.error;

                return (
                  <div key={modelEntry.id} className="flex items-center justify-between gap-4 rounded-xl bg-white p-4 shadow-sm">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink-900">{modelEntry.name}</span>
                        {modelEntry.recommended && (
                          <span className="rounded bg-sprite-100 px-1.5 py-0.5 text-[10px] font-semibold text-sprite-700">
                            추천
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ink-400">
                        약 {modelEntry.sizeMb.toLocaleString()} MB
                        {modelEntry.minVramGb > 0 ? ` · VRAM ${modelEntry.minVramGb} GB 이상 권장` : ""}
                        {modelEntry.notes ? ` · ${modelEntry.notes}` : ""}
                      </p>
                      {modelEntry.license && (
                        <p className="text-[11px] text-ink-400">라이선스: {modelEntry.license}</p>
                      )}
                      {activeDownloading && (
                        <div className="w-48 overflow-hidden rounded-full bg-sprite-50 h-1.5 mt-2">
                          <div
                            className="bg-sprite-500 h-full transition-all duration-300"
                            style={{
                              width: currentProgress.total
                                ? `${(currentProgress.downloaded / currentProgress.total) * 100}%`
                                : "35%",
                            }}
                          />
                        </div>
                      )}
                      {currentProgress?.error && (
                        <p className="text-xs text-red-600">{currentProgress.error}</p>
                      )}
                    </div>

                    <div className="shrink-0">
                      {activeDownloading ? (
                        <span className="text-xs font-medium text-ink-600">
                          {formatBytesToMegabytes(currentProgress.downloaded)}
                          {currentProgress.total ? ` / ${formatBytesToMegabytes(currentProgress.total)}` : ""} MB
                        </span>
                      ) : modelEntry.installed ? (
                        <button
                          type="button"
                          onClick={() => {
                            api.deleteModel(modelEntry.id)
                              .then(fetchDashboardData)
                              .catch((err) => setDiagnosticLog(String(err)));
                          }}
                          className="text-xs font-medium text-ink-400 hover:text-red-600"
                        >
                          삭제
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setTransferProgressMap((prev) => ({
                              ...prev,
                              [modelEntry.id]: { id: modelEntry.id, downloaded: 0, total: null, done: false, error: null },
                            }));
                            api.downloadModel(modelEntry.id).catch((failErr) => {
                              setTransferProgressMap((prev) => ({
                                ...prev,
                                [modelEntry.id]: {
                                  id: modelEntry.id,
                                  downloaded: 0,
                                  total: null,
                                  done: true,
                                  error: String(failErr),
                                },
                              }));
                              setDiagnosticLog(String(failErr));
                            });
                          }}
                          className="rounded-lg bg-sprite-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sprite-600"
                        >
                          다운로드
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <GecLab
        gec={catalog.find((m) => m.kind === "gec" && m.installed)}
        runtime={details?.engines.onnxruntime ?? false}
      />

      <ScoringLab
        llms={catalog.filter((m) => m.kind === "llm" && m.installed)}
        whisperId={findActiveWhisperModel()?.id}
      />

      <section className="rounded-xl bg-white p-5 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-ink-600">엔진 연결 테스트</h3>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isOperationLocked}
            onClick={triggerWhisperDiagnostic}
            className="rounded-lg border border-sprite-300 px-3 py-1.5 text-xs font-semibold text-sprite-700 hover:bg-sprite-50 disabled:opacity-40"
          >
            Whisper 샘플 전사
          </button>
          <button
            type="button"
            disabled={isOperationLocked}
            onClick={triggerLlmDiagnostic}
            className="rounded-lg border border-sprite-300 px-3 py-1.5 text-xs font-semibold text-sprite-700 hover:bg-sprite-50 disabled:opacity-40"
          >
            LLM 한 문장 생성
          </button>
        </div>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-sprite-50 p-3 font-mono text-xs text-ink-900" data-selectable>
          {diagnosticLog || "—"}
        </pre>
      </section>
    </div>
  );
}