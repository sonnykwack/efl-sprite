import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Navigate } from "../App";
import PageHeader from "../components/PageHeader";
import { api, inTauri } from "../lib/api";
import { addSampleTasks } from "../lib/sampleTasks";
import type {
  AppInfo,
  DownloadProgress,
  ModelEntry,
  ModelKind,
} from "../lib/types";

interface HomePageProps {
  navigate: Navigate;
}

interface OnboardingStepCardProps {
  stepNumber: number;
  completed: boolean;
  heading: string;
  children: ReactNode;
}

function OnboardingStepCard({
  stepNumber,
  completed,
  heading,
  children,
}: OnboardingStepCardProps) {
  return (
    <section className="flex items-start gap-4 rounded-xl border border-black/5 bg-white p-5 shadow-sm">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          completed
            ? "bg-sprite-600 text-white"
            : "bg-sprite-100 text-sprite-700"
        }`}
      >
        {completed ? "✓" : stepNumber}
      </div>
      <div className="min-w-0 flex-1 space-y-2.5">
        <h2
          className={`text-base font-bold ${
            completed ? "text-ink-400" : "text-ink-900"
          }`}
        >
          {heading}
        </h2>
        <div className="text-sm text-ink-600">{children}</div>
      </div>
    </section>
  );
}

const MODEL_CATEGORIES: readonly { kind: ModelKind; title: string }[] = [
  { kind: "llm", title: "채점 AI (LLM)" },
  { kind: "whisper", title: "음성 인식 (Whisper)" },
  { kind: "gec", title: "문법 교정 모델 (선택)" },
];

function selectSuggestedModel(
  catalog: ModelEntry[],
  targetKind: ModelKind
): ModelEntry | undefined {
  const candidates = catalog.filter((entry) => entry.kind === targetKind);
  return (
    candidates.find((entry) => entry.recommended) ?? candidates[0]
  );
}

function formatProgressStatus(progress: DownloadProgress): string {
  if (progress.total && progress.total > 0) {
    const ratio = Math.round((progress.downloaded / progress.total) * 100);
    return `${ratio}%`;
  }
  const megabytes = Math.round(progress.downloaded / (1024 * 1024));
  return `${megabytes} MB`;
}

function extractErrorReason(err: unknown): string {
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }
  if (typeof err === "string" && err.trim().length > 0) {
    return err;
  }
  return "알 수 없는 오류";
}

export default function HomePage({ navigate }: HomePageProps) {
  const isDesktopApp = inTauri();

  const [engineInfo, setEngineInfo] = useState<AppInfo | null>(null);
  const [modelCatalog, setModelCatalog] = useState<ModelEntry[]>([]);
  const [totalTasks, setTotalTasks] = useState<number>(0);
  const [hasAttemptHistory, setHasAttemptHistory] = useState<boolean>(false);

  const [progressByModelId, setProgressByModelId] = useState<
    Record<string, DownloadProgress>
  >({});
  const [isBatchDownloading, setIsBatchDownloading] = useState<boolean>(false);
  const [isCreatingSamples, setIsCreatingSamples] = useState<boolean>(false);
  const [noticeMessage, setNoticeMessage] = useState<string>("");

  const syncDashboardData = useCallback(async () => {
    if (!isDesktopApp) {
      return;
    }

    try {
      const fetchedInfo = await api.appInfo();
      setEngineInfo(fetchedInfo);
    } catch (err) {
      setNoticeMessage(
        `앱 정보를 불러오지 못했어요: ${extractErrorReason(err)}`
      );
    }

    try {
      const fetchedModels = await api.listModels();
      setModelCatalog(fetchedModels);
    } catch (err) {
      // 모델 목록 로드 실패 시 별도 처리 또는 조용히 유지
    }

    try {
      const taskList = await api.listTasks();
      setTotalTasks(taskList.length);
    } catch {
      // 문제 개수 조회 실패는 조용히 무시
    }

    try {
      const recentAttempts = await api.listAttempts(null, 1);
      setHasAttemptHistory(recentAttempts.length > 0);
    } catch {
      // 응시 기록 조회 실패는 조용히 무시
    }
  }, [isDesktopApp]);

  useEffect(() => {
    if (!isDesktopApp) {
      return;
    }
    void syncDashboardData();
  }, [isDesktopApp, syncDashboardData]);

  useEffect(() => {
    if (!isDesktopApp) {
      return;
    }

    let isDisposed = false;
    const unlistenPromise = api.onDownloadProgress((update) => {
      if (isDisposed) {
        return;
      }
      setProgressByModelId((prev) => ({
        ...prev,
        [update.id]: update,
      }));
      if (update.error) {
        setNoticeMessage(`다운로드 오류 발생 (${update.id}): ${update.error}`);
      }
      if (update.done) {
        void syncDashboardData();
      }
    });

    return () => {
      isDisposed = true;
      void unlistenPromise.then((unsubscribe) => {
        unsubscribe();
      });
    };
  }, [isDesktopApp, syncDashboardData]);

  if (!isDesktopApp) {
    return (
      <div>
        <PageHeader title="시작하기" />
        <p className="text-sm text-ink-600">
          앱(npm run tauri dev)에서 실행해 주세요.
        </p>
      </div>
    );
  }

  const isEngineReady = Boolean(
    engineInfo && engineInfo.engines.llama && engineInfo.engines.whisper
  );

  const isKindInstalled = (kind: ModelKind): boolean =>
    modelCatalog.some((entry) => entry.kind === kind && entry.installed);

  const isModelsReady = isKindInstalled("llm") && isKindInstalled("whisper");
  const isTasksReady = totalTasks >= 1;
  const isFirstAttemptDone = hasAttemptHistory;

  const missingSuggestedModels: ModelEntry[] = [];
  for (const category of MODEL_CATEGORIES) {
    if (!isKindInstalled(category.kind)) {
      const suggested = selectSuggestedModel(modelCatalog, category.kind);
      if (suggested) {
        missingSuggestedModels.push(suggested);
      }
    }
  }

  const missingTotalGb = (
    missingSuggestedModels.reduce((sum, item) => sum + item.sizeMb, 0) / 1024
  ).toFixed(1);

  const hasActiveProgress = Object.values(progressByModelId).some(
    (entry) => !entry.done && !entry.error
  );
  const isDownloadingNow = isBatchDownloading || hasActiveProgress;

  const handleDownloadSuggestedBatch = async () => {
    if (isDownloadingNow || missingSuggestedModels.length === 0) {
      return;
    }

    setIsBatchDownloading(true);
    setNoticeMessage("");

    try {
      for (const targetModel of missingSuggestedModels) {
        try {
          await api.downloadModel(targetModel.id);
        } catch (err) {
          setNoticeMessage(
            `${targetModel.name} 다운로드 실패: ${extractErrorReason(
              err
            )} — 설정 · 모델에서 다시 시도할 수 있어요.`
          );
          break;
        }
      }
      await syncDashboardData();
    } finally {
      setIsBatchDownloading(false);
    }
  };

  const handleInsertSampleTasks = async () => {
    if (isCreatingSamples) {
      return;
    }

    setIsCreatingSamples(true);
    try {
      const insertedCount = await addSampleTasks();
      if (insertedCount >= 1) {
        setNoticeMessage(`예시 문제 ${insertedCount}개를 추가했어요.`);
      } else {
        setNoticeMessage("예시 문제가 이미 모두 있어요.");
      }
      await syncDashboardData();
    } catch (err) {
      setNoticeMessage(
        `예시 문제 추가 실패: ${extractErrorReason(err)}`
      );
    } finally {
      setIsCreatingSamples(false);
    }
  };

  const canGoAttempt = isModelsReady && isTasksReady;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="시작하기"
        subtitle="EFL Sprite는 영어 말하기·쓰기 답안을 이 컴퓨터 안에서 AI로 채점해요. 녹음과 답안은 외부로 전송되지 않아요."
      />

      <div className="space-y-4">
        <OnboardingStepCard
          stepNumber={1}
          completed={isEngineReady}
          heading="AI 엔진 확인"
        >
          {engineInfo === null ? (
            <p className="text-ink-400">확인 중…</p>
          ) : isEngineReady ? (
            <p>음성 인식과 채점 엔진이 준비되어 있어요.</p>
          ) : (
            <p className="font-medium text-red-600">
              {import.meta.env.DEV
                ? "엔진이 없어요 — 터미널에서 npm run fetch-engines를 실행하세요."
                : "엔진 파일이 없어요. 앱을 삭제한 뒤 다시 설치해 주세요."}
            </p>
          )}
        </OnboardingStepCard>

        <OnboardingStepCard
          stepNumber={2}
          completed={isModelsReady}
          heading="AI 모델 받기 (처음 한 번)"
        >
          <ul className="space-y-2">
            {MODEL_CATEGORIES.map(({ kind, title }) => {
              const installed = isKindInstalled(kind);
              const suggested = selectSuggestedModel(modelCatalog, kind);
              const activeProgress = suggested
                ? progressByModelId[suggested.id]
                : undefined;
              const isCurrentlyDownloading = Boolean(
                activeProgress && !activeProgress.done && !activeProgress.error
              );

              return (
                <li
                  key={kind}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={
                        installed
                          ? "font-bold text-sprite-600"
                          : "text-ink-400"
                      }
                    >
                      {installed ? "✓" : "○"}
                    </span>
                    <span className="text-ink-900">{title}</span>
                    {!installed && suggested ? (
                      <span className="text-xs text-ink-400">
                        {suggested.name} · 약{" "}
                        {suggested.sizeMb.toLocaleString()} MB
                      </span>
                    ) : null}
                  </div>

                  {isCurrentlyDownloading && activeProgress ? (
                    <span className="shrink-0 text-xs font-medium text-sprite-600">
                      {formatProgressStatus(activeProgress)}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {missingSuggestedModels.length > 0 ? (
            <div className="mt-4 space-y-2.5 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isDownloadingNow}
                  onClick={() => void handleDownloadSuggestedBatch()}
                  className="rounded-lg bg-sprite-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sprite-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDownloadingNow
                    ? "받는 중…"
                    : `추천 모델 한 번에 받기 (약 ${missingTotalGb} GB)`}
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ page: "settings" })}
                  className="rounded-lg border border-black/10 bg-white px-3.5 py-2 text-xs font-medium text-ink-600 hover:bg-sprite-50"
                >
                  직접 고르기
                </button>
              </div>
              <p className="text-xs text-ink-400">
                메모리 16 GB 이상 권장 · 적으면 설정에서 작은 모델(3B)을 고르세요.
              </p>
            </div>
          ) : null}
        </OnboardingStepCard>

        <OnboardingStepCard
          stepNumber={3}
          completed={isTasksReady}
          heading="문제 준비"
        >
          <p className="leading-relaxed">
            선생님이 직접 문제를 만들 수도 있고, 유형별 예시 문제 4개(듣고 따라 말하기 · 인터뷰 · 이메일 · 토론 글)로 바로 시작할 수도 있어요.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isCreatingSamples}
              onClick={() => void handleInsertSampleTasks()}
              className="rounded-lg bg-sprite-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sprite-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              예시 문제 추가
            </button>
            <button
              type="button"
              onClick={() => navigate({ page: "tasks" })}
              className="rounded-lg border border-black/10 bg-white px-3.5 py-2 text-xs font-medium text-ink-600 hover:bg-sprite-50"
            >
              문제 직접 만들기
            </button>
          </div>
        </OnboardingStepCard>

        <OnboardingStepCard
          stepNumber={4}
          completed={isFirstAttemptDone}
          heading="첫 응시"
        >
          <p className="leading-relaxed">
            문제를 고르고 답안을 쓰거나 말하면 AI가 채점하고, 틀린 부분을 클릭하면 이유를 보여줘요. 채점은 PC 성능에 따라 30초–2분 걸려요.
          </p>
          <div className="mt-3">
            <button
              type="button"
              disabled={!canGoAttempt}
              onClick={() => navigate({ page: "attempt" })}
              className="rounded-lg bg-sprite-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sprite-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              응시하러 가기 →
            </button>
          </div>
        </OnboardingStepCard>
      </div>

      {noticeMessage ? (
        <p className="mt-4 text-xs text-ink-600">{noticeMessage}</p>
      ) : null}

      <p className="mt-6 text-xs text-ink-400">
        TOEFL 스타일 연습용 앱이며 ETS와 관련이 없어요. 점수는 AI 추정치이고 공식 점수가 아니에요.
      </p>
    </div>
  );
}