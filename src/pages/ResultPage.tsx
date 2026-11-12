import { useEffect, useState, useCallback } from "react";
import type { Navigate } from "../App";
import PageHeader from "../components/PageHeader";
import FeedbackView, { BandBadge, AnnotatedResponse } from "../components/FeedbackView";
import RepeatResultView from "../components/RepeatResultView";
import { AudioButton } from "../components/SpeakingTasks";
import { api, inTauri } from "../lib/api";
import { TASK_SPECS } from "../lib/rubrics";
import { fmtDate } from "../lib/format";
import { parseReview, effectiveErrors } from "../lib/review";
import { generateSampleAnswer, speakingStats, type LlmEvaluation } from "../lib/scoring";
import { scoreAttempt, STAGE_KO, type ScoringMode } from "../lib/submit";
import { scoreRepeatAttempt, isRepeatEvaluation, parseAudioPaths, type RepeatEvaluation } from "../lib/repeat";
import { targetSentences } from "../lib/accuracy";
import { loadActiveModels } from "../lib/activeModels";
import type { AttemptDetail, AttemptSummary } from "../lib/types";

interface ResultPageProps {
  attemptId?: number;
  navigate: Navigate;
}

const BAND_OPTIONS = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0];

const formatSecondsToReadable = (totalSeconds: number): string => {
  if (totalSeconds < 60) return `${totalSeconds}초`;
  const minutes = Math.floor(totalSeconds / 60);
  const remainderSeconds = totalSeconds % 60;
  return remainderSeconds > 0 ? `${minutes}분 ${remainderSeconds}초` : `${minutes}분`;
};

export default function ResultPage({ attemptId, navigate }: ResultPageProps) {
  const [recentAttempts, setRecentAttempts] = useState<AttemptSummary[]>([]);
  const [detail, setDetail] = useState<AttemptDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedErrorIdx, setSelectedErrorIdx] = useState<number | null>(null);

  // Busy/Progress states
  const [isScoring, setIsScoring] = useState<boolean>(false);
  const [scoringProgressText, setScoringProgressText] = useState<string>("");
  const [isSampleGenerating, setIsSampleGenerating] = useState<boolean>(false);

  const isAnyBusy = isScoring || isSampleGenerating;

  const loadData = useCallback(() => {
    if (!inTauri()) return;
    setLoading(true);
    setError(null);

    if (attemptId == null) {
      api.listAttempts(null, 8)
        .then((res) => {
          setRecentAttempts(res);
          setLoading(false);
        })
        .catch((err) => {
          setError(String(err));
          setLoading(false);
        });
    } else {
      api.getAttempt(attemptId)
        .then((res) => {
          setDetail(res);
          setLoading(false);
        })
        .catch((err) => {
          setError(String(err));
          setLoading(false);
        });
    }
  }, [attemptId]);

  useEffect(() => {
    loadData();
    setSelectedErrorIdx(null);
  }, [attemptId, loadData]);

  // ----------------------------------------------------
  // A. 목록 모드 (attemptId 없음)
  // ----------------------------------------------------
  if (attemptId == null) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="채점 결과"
          subtitle="최근 응시를 고르면 결과를 볼 수 있어요."
        />

        {loading ? (
          <p className="text-sm text-ink-400">불러오는 중…</p>
        ) : recentAttempts.length === 0 ? (
          <p className="text-sm text-ink-400">아직 응시 기록이 없어요.</p>
        ) : (
          <div className="grid gap-3">
            {recentAttempts.map((item) => {
              const spec = TASK_SPECS[item.taskType];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate({ page: "result", attemptId: item.id })}
                  className="flex items-center justify-between rounded-xl bg-white p-4 text-left shadow-sm transition hover:bg-sprite-50"
                >
                  <div className="space-y-1">
                    <div className="text-[11px] font-bold text-sprite-600">
                      {spec?.label ?? item.taskType}
                    </div>
                    <h3 className="font-bold text-ink-900">{item.taskTitle}</h3>
                    <div className="text-xs text-ink-400">
                      {item.studentName || "이름 없음"} · {fmtDate(item.createdAt)}
                    </div>
                  </div>

                  <div className="shrink-0">
                    {item.band != null ? (
                      <span className="text-base font-extrabold text-sprite-700">
                        {item.band.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-amber-700">미채점</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  // ----------------------------------------------------
  // B. 결과 모드
  // ----------------------------------------------------
  if (loading && !detail) {
    return <p className="text-sm text-ink-400">불러오는 중…</p>;
  }

  if (error && !detail) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!detail) {
    return null;
  }

  const spec = TASK_SPECS[detail.taskType];
  const isRepeat = detail.taskType === "listen_repeat";
  const review = parseReview(detail.teacherReview);
  const hasTeacherReview = review.annotations.length > 0 || Object.keys(review.aiVerdicts).length > 0;

  // Parse evaluation rubric JSON safely with unknown
  let rawRubric: unknown = null;
  if (detail.evaluation?.rubricJson) {
    try {
      rawRubric = JSON.parse(detail.evaluation.rubricJson);
    } catch {
      rawRubric = null;
    }
  }

  let evaluatedData: RepeatEvaluation | LlmEvaluation | null = rawRubric as any;
  if (evaluatedData && !isRepeatEvaluation(evaluatedData)) {
    const llmEv = evaluatedData as LlmEvaluation;
    evaluatedData = {
      ...llmEv,
      errors: effectiveErrors(llmEv.errors, review),
    };
  }

  // Teacher score handler
  const handleTeacherScoreChange = async (newScoreStr: string) => {
    if (!detail.evaluation) return;
    const scoreVal = newScoreStr ? Number(newScoreStr) : null;
    setError(null);
    try {
      await api.setTeacherScore(detail.evaluation.id, scoreVal);
      loadData();
    } catch (err) {
      setError(String(err));
    }
  };

  // Score action handler
  const handleRunScoring = async (mode: ScoringMode) => {
    setIsScoring(true);
    setError(null);
    setSelectedErrorIdx(null);
    try {
      if (isRepeat) {
        await scoreRepeatAttempt(
          detail.id,
          targetSentences(detail.material),
          parseAudioPaths(detail.audioPath),
          (done, total) => {
            setScoringProgressText(`음성을 글로 옮기는 중… ${Math.min(done + 1, total)} / ${total}`);
          }
        );
      } else {
        const stats =
          detail.taskType === "interview" && detail.durationSeconds != null
            ? speakingStats(detail.responseText, detail.durationSeconds)
            : undefined;

        await scoreAttempt(
          {
            attemptId: detail.id,
            taskType: detail.taskType,
            prompt: detail.prompt,
            material: detail.material,
            responseText: detail.responseText,
            stats,
          },
          mode,
          (stage) => {
            setScoringProgressText(STAGE_KO[stage] || "채점 중…");
          }
        );
      }
      loadData();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsScoring(false);
      setScoringProgressText("");
    }
  };

  // Sample answer generator
  const handleGenerateSampleAnswer = async () => {
    if (!detail.evaluation) return;
    setIsSampleGenerating(true);
    setError(null);
    try {
      const activeModels = await loadActiveModels();
      if (!activeModels.llm) {
        throw new Error("설치된 LLM 모델이 없습니다.");
      }
      const sampleText = await generateSampleAnswer(
        { taskType: detail.taskType, prompt: detail.prompt, material: detail.material },
        activeModels.llm.id
      );
      await api.setSampleAnswer(detail.evaluation.id, sampleText.trim());
      loadData();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsSampleGenerating(false);
    }
  };

  const wordCount = detail.responseText.trim() ? detail.responseText.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={detail.taskTitle || "제목 없음"}
        subtitle={`${spec?.labelKo ?? detail.taskType} · ${detail.studentName || "이름 없음"} · ${fmtDate(detail.createdAt)}`}
        actions={
          <div className="flex items-center gap-2">
            {!isRepeat && (
              <button
                type="button"
                onClick={() => navigate({ page: "review", attemptId: detail.id })}
                className="rounded-lg border border-sprite-500 bg-sprite-50 px-3 py-1.5 text-sm font-semibold text-sprite-700 hover:bg-sprite-100 transition"
              >
                {hasTeacherReview ? "✏️ 첨삭 이어하기" : "✏️ 직접 첨삭"}
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate({ page: "history" })}
              className="rounded-lg border border-black/10 px-3 py-1.5 text-sm font-semibold text-ink-600 hover:bg-sprite-50 transition"
            >
              ← 기록
            </button>
          </div>
        }
      />

      {/* Teacher review notice */}
      {!isRepeat && hasTeacherReview && (
        <div className="rounded-xl bg-violet-50 p-4 text-sm text-violet-900 border border-violet-200 shadow-sm">
          선생님 첨삭 {review.annotations.length}개가 반영되었어요. 선생님이 틀렸다고 표시한 AI 교정은 숨겨졌어요.
        </div>
      )}

      {/* Unscored notice */}
      {!detail.evaluation && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm space-y-3">
          <div>아직 채점되지 않은 답안이에요.</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isAnyBusy}
              onClick={() => handleRunScoring("quick")}
              className="rounded-lg bg-sprite-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sprite-600 disabled:opacity-40"
            >
              빠른 채점
            </button>
            <button
              type="button"
              disabled={isAnyBusy}
              onClick={() => handleRunScoring("precise")}
              className="rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink-600 hover:bg-sprite-50 transition disabled:opacity-40"
            >
              정밀 채점
            </button>
          </div>
        </div>
      )}

      {/* Scoring Progress message */}
      {isScoring && (
        <p className="text-xs font-semibold text-sprite-600 animate-pulse">
          {scoringProgressText || "채점 중…"}
        </p>
      )}

      {/* ==================================================== */}
      {/* B-1. 따라 말하기 결과 */}
      {/* ==================================================== */}
      {isRepeat ? (
        <div className="space-y-6">
          {evaluatedData && isRepeatEvaluation(evaluatedData) ? (
            <RepeatResultView ev={evaluatedData} />
          ) : (
            <div className="rounded-xl bg-white p-8 text-center text-sm text-ink-400 shadow-sm">
              따라 말하기 채점 결과가 없습니다.
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white p-5 shadow-sm">
            <button
              type="button"
              disabled={isAnyBusy}
              onClick={() => handleRunScoring("quick")}
              className="rounded-lg bg-sprite-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sprite-600 disabled:opacity-40"
            >
              {evaluatedData ? "음성 다시 인식하기" : "채점하기"}
            </button>

            {detail.evaluation && (
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-ink-600">교사 채점</span>
                <select
                  value={detail.evaluation.teacherScore ?? ""}
                  onChange={(e) => handleTeacherScoreChange(e.target.value)}
                  className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm"
                >
                  <option value="">—</option>
                  {BAND_OPTIONS.map((b) => (
                    <option key={b} value={b}>
                      {b.toFixed(1)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ==================================================== */
        /* B-2. 나머지 3유형 (2열 레이아웃)                     */
        /* ==================================================== */
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left Column: Response & Prompt */}
          <div className="space-y-6 lg:col-span-5">
            {/* Student Response Card */}
            <div className="rounded-xl bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-black/5 pb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-ink-900">
                    {detail.taskType === "interview" ? "말한 내용 (음성 인식)" : "학생 답안"}
                  </h3>
                  {detail.taskType === "interview" && <AudioButton path={detail.audioPath} />}
                </div>
                <span className="text-xs text-ink-400">
                  {wordCount} 단어
                  {detail.durationSeconds != null ? ` · ${formatSecondsToReadable(detail.durationSeconds)} 소요` : ""}
                </span>
              </div>

              {evaluatedData && !isRepeatEvaluation(evaluatedData) ? (
                <AnnotatedResponse
                  text={detail.responseText}
                  errors={(evaluatedData as LlmEvaluation).errors || []}
                  selected={selectedErrorIdx}
                  onSelect={setSelectedErrorIdx}
                />
              ) : (
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-900" data-selectable>
                  {detail.responseText || "답안 내용이 없어요."}
                </div>
              )}
            </div>

            {/* Task prompt view (collapsible) */}
            <details className="rounded-xl bg-white p-5 shadow-sm space-y-3">
              <summary className="cursor-pointer text-sm font-bold text-ink-900 select-none">
                문제 다시 보기
              </summary>
              <div className="space-y-3 pt-3 border-t border-black/5 text-sm text-ink-600">
                <div className="whitespace-pre-wrap" data-selectable>{detail.prompt}</div>
                {detail.material && (
                  <div className="rounded-lg bg-sprite-50 p-3 text-xs text-sprite-700 border border-sprite-100 whitespace-pre-wrap" data-selectable>
                    {detail.material}
                  </div>
                )}
              </div>
            </details>

            {/* Sample Answer Card */}
            {detail.evaluation && (
              <div className="rounded-xl bg-white p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-black/5 pb-3">
                  <h3 className="text-sm font-bold text-ink-900">모범 답안</h3>
                  <button
                    type="button"
                    disabled={isAnyBusy}
                    onClick={handleGenerateSampleAnswer}
                    className="text-xs font-semibold text-sprite-700 hover:underline disabled:opacity-40"
                  >
                    {detail.evaluation.sampleAnswer ? "다시 만들기" : "모범 답안 만들기"}
                  </button>
                </div>

                {isSampleGenerating ? (
                  <p className="text-xs font-semibold text-sprite-600 animate-pulse">
                    모범 답안 작성 중…
                  </p>
                ) : detail.evaluation.sampleAnswer ? (
                  <p className="text-sm text-ink-600 whitespace-pre-wrap" data-selectable>
                    {detail.evaluation.sampleAnswer}
                  </p>
                ) : (
                  <p className="text-xs text-ink-400">
                    같은 문제에 대한 고득점 예시 답안을 AI가 작성해요 (약 20–40초).
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Feedback & Score */}
          <div className="space-y-6 lg:col-span-7">
            {evaluatedData && !isRepeatEvaluation(evaluatedData) && (
              <>
                {/* Summary Header Card */}
                <div className="flex flex-col gap-4 rounded-xl bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <BandBadge band={(evaluatedData as LlmEvaluation).band} />
                    <div className="space-y-1 text-xs text-ink-600">
                      <div>루브릭 합계 <span className="font-bold text-ink-900">{(evaluatedData as LlmEvaluation).total ?? 0}/{(evaluatedData as LlmEvaluation).max ?? 15}</span></div>
                      <div>
                        {(evaluatedData as LlmEvaluation).samples && (evaluatedData as LlmEvaluation).samples! > 1
                          ? `${(evaluatedData as LlmEvaluation).samples}회 채점 중앙값`
                          : "1회 채점"}
                        {" "}· {Math.round((evaluatedData as LlmEvaluation).latencyMs / 1000)}초
                      </div>
                      <div>
                        ETS 방식 과제 점수 추정 <span className="font-bold text-ink-900">{Math.round((evaluatedData as LlmEvaluation).total / ((evaluatedData as LlmEvaluation).max || 15) * 5)}/5</span>
                      </div>
                      <p className="text-[11px] text-ink-400">AI 추정치이며 ETS 공식 점수가 아니에요.</p>
                    </div>
                  </div>

                  {detail.evaluation && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold text-ink-600">교사 채점</span>
                      <select
                        value={detail.evaluation.teacherScore ?? ""}
                        onChange={(e) => handleTeacherScoreChange(e.target.value)}
                        className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm"
                      >
                        <option value="">—</option>
                        {BAND_OPTIONS.map((b) => (
                          <option key={b} value={b}>
                            {b.toFixed(1)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Feedback Body View */}
                <FeedbackView
                  evaluation={evaluatedData as LlmEvaluation}
                  selected={selectedErrorIdx}
                  onSelect={setSelectedErrorIdx}
                />
              </>
            )}

            {/* Re-scoring Action Buttons */}
            {detail.evaluation && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isAnyBusy}
                    onClick={() => handleRunScoring("quick")}
                    className="rounded-lg bg-sprite-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sprite-600 disabled:opacity-40"
                  >
                    빠른 채점으로 다시
                  </button>
                  <button
                    type="button"
                    disabled={isAnyBusy}
                    onClick={() => handleRunScoring("precise")}
                    className="rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink-600 hover:bg-sprite-50 transition disabled:opacity-40"
                  >
                    정밀 채점으로 다시
                  </button>
                </div>
                {evaluatedData && !isRepeatEvaluation(evaluatedData) && (evaluatedData as LlmEvaluation).version && (
                  <span className="text-xs text-ink-400">프롬프트 {(evaluatedData as LlmEvaluation).version}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}