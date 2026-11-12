import { useEffect, useMemo, useRef, useState } from "react";
import type { Navigate } from "../App";
import PageHeader from "../components/PageHeader";
import { api, inTauri } from "../lib/api";
import {
  CATEGORIES,
  GUIDE,
  wordDiff,
  type ErrorCategory,
  type ErrorKind,
} from "../lib/grammarGuide";
import {
  aiKey,
  applyCorrections,
  correctedText,
  effectiveErrors,
  parseReview,
  selectionOffsets,
  snapToWords,
  type AiVerdict,
  type TeacherAnnotation,
  type TeacherReview,
} from "../lib/review";
import type { LanguageError, LlmEvaluation } from "../lib/scoring";
import type { AttemptDetail } from "../lib/types";

interface AnnotationDraft {
  id: string | null;
  start: number;
  end: number;
  quote: string;
  category: ErrorCategory;
  correction: string;
  comment: string;
  createdAt?: string;
  fromAi?: string;
}

interface TextSpan {
  start: number;
  end: number;
  text: string;
  annotation?: TeacherAnnotation;
  aiError?: LanguageError;
  isDraft: boolean;
}

const KIND_STYLE: Record<ErrorKind, string> = {
  grammar: "bg-violet-100 underline decoration-violet-500 decoration-2",
  sentence: "bg-sky-100 underline decoration-sky-500 decoration-2",
  word_choice: "bg-amber-100 underline decoration-amber-500 decoration-2",
  register: "bg-emerald-100 underline decoration-emerald-500 decoration-2",
};

function buildPassageSpans(
  text: string,
  annotations: TeacherAnnotation[],
  aiErrors: LanguageError[],
  draft: AnnotationDraft | null,
): TextSpan[] {
  if (!text) return [];

  const points = new Set<number>([0, text.length]);
  const addRange = (s: number, e: number) => {
    const start = Math.max(0, Math.min(text.length, s));
    const end = Math.max(start, Math.min(text.length, e));
    if (start < end) {
      points.add(start);
      points.add(end);
    }
  };

  for (const a of annotations) {
    addRange(a.start, a.end);
  }
  if (draft) {
    addRange(draft.start, draft.end);
  }

  const validAiErrors = aiErrors.filter(
    (err) => err.start >= 0 && err.end > err.start,
  );
  for (const err of validAiErrors) {
    addRange(err.start, err.end);
  }

  const sorted = Array.from(points).sort((a, b) => a - b);
  const spans: TextSpan[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (start >= end) continue;

    const isDraft = Boolean(draft && draft.start <= start && end <= draft.end);
    const annotation = annotations.find((a) => a.start <= start && end <= a.end);
    const aiError = annotation
      ? undefined
      : validAiErrors.find((e) => e.start <= start && end <= e.end);

    spans.push({
      start,
      end,
      text: text.slice(start, end),
      annotation,
      aiError,
      isDraft,
    });
  }

  return spans;
}

function WordDiffInline({ before, after }: { before: string; after: string }) {
  const tokens = wordDiff(before, after);
  return (
    <span className="leading-6">
      {tokens.map((tok, idx) => (
        <span
          key={idx}
          className={
            tok.op === "del"
              ? "mr-1 rounded bg-rose-50 px-1 text-rose-600 line-through"
              : tok.op === "ins"
                ? "mr-1 rounded bg-sprite-100 px-1 font-semibold text-sprite-700"
                : "mr-1 text-ink-600"
          }
        >
          {tok.text}
        </span>
      ))}
    </span>
  );
}

export default function ReviewPage({
  attemptId,
  navigate,
}: {
  attemptId: number;
  navigate: Navigate;
}) {
  const [detail, setDetail] = useState<AttemptDetail | null>(null);
  const [review, setReview] = useState<TeacherReview | null>(null);
  const [draft, setDraft] = useState<AnnotationDraft | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedLabel, setLastSavedLabel] = useState<string>("");

  const passageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!inTauri()) return;
    let cancelled = false;
    setLoadError(null);

    api
      .getAttempt(attemptId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setReview(parseReview(d.teacherReview));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  const aiErrors: LanguageError[] = useMemo(() => {
    if (!detail?.evaluation?.rubricJson) return [];
    try {
      const parsed = JSON.parse(detail.evaluation.rubricJson) as LlmEvaluation;
      return parsed.errors ?? [];
    } catch {
      return [];
    }
  }, [detail]);

  if (!inTauri()) {
    return (
      <p className="text-sm text-ink-400">
        데스크톱 앱 환경에서만 첨삭 기능을 사용할 수 있습니다.
      </p>
    );
  }

  if (loadError) {
    return <p className="text-sm text-red-600">{loadError}</p>;
  }

  if (!detail || !review) {
    return <p className="text-sm text-ink-400">답안을 불러오는 중…</p>;
  }

  const text = detail.responseText;
  const annotations = review.annotations;
  const aiVerdicts = review.aiVerdicts;

  const persistReview = async (nextReview: TeacherReview): Promise<boolean> => {
    const updated: TeacherReview = {
      ...nextReview,
      version: 1,
      updatedAt: new Date().toISOString(),
    };
    setSaving(true);
    setSaveError(null);
    try {
      await api.setTeacherReview(attemptId, JSON.stringify(updated));
      setReview(updated);
      setLastSavedLabel(
        `저장 완료 ${new Date().toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
        })}`,
      );
      return true;
    } catch (err: unknown) {
      setSaveError(
        err instanceof Error
          ? `저장 실패: ${err.message}`
          : `저장 실패: ${String(err)}`,
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openAnnotationForEdit = (ann: TeacherAnnotation) => {
    setSelectedAnnotationId(ann.id);
    setDraft({
      id: ann.id,
      start: ann.start,
      end: ann.end,
      quote: ann.quote,
      category: ann.category,
      correction: ann.correction,
      comment: ann.comment,
      createdAt: ann.createdAt,
    });
  };

  const handlePassageMouseUp = () => {
    const container = passageRef.current;
    if (!container) return;

    const raw = selectionOffsets(container);
    if (!raw) return;

    const { start, end } = snapToWords(text, raw.start, raw.end);
    if (end <= start) return;

    const quote = text.slice(start, end);
    if (!quote.trim()) return;

    const overlapping = annotations.find((a) => a.start < end && start < a.end);
    if (overlapping) {
      openAnnotationForEdit(overlapping);
    } else {
      setSelectedAnnotationId(null);
      setDraft({
        id: null,
        start,
        end,
        quote,
        category: "grammar_other",
        correction: quote,
        comment: "",
      });
    }
    window.getSelection()?.removeAllRanges();
  };

  const handleStartFromAi = (err: LanguageError) => {
    if (err.start < 0 || err.end <= err.start) return;

    const overlapping = annotations.find(
      (a) => a.start < err.end && err.start < a.end,
    );
    if (overlapping) {
      openAnnotationForEdit(overlapping);
      return;
    }

    setSelectedAnnotationId(null);
    setDraft({
      id: null,
      start: err.start,
      end: err.end,
      quote: err.quote,
      category: err.category,
      correction: err.correction,
      comment: err.why ?? "",
      fromAi: aiKey(err),
    });
  };

  const isDraftUnchangedAndEmpty =
    draft !== null &&
    draft.correction.trim() === draft.quote.trim() &&
    draft.comment.trim() === "";

  const handleSaveDraft = async () => {
    if (!draft || saving || isDraftUnchangedAndEmpty) return;

    const normalizedCorrection =
      draft.correction.trim() === "" ? draft.quote : draft.correction;

    const item: TeacherAnnotation = {
      id: draft.id ?? crypto.randomUUID(),
      start: draft.start,
      end: draft.end,
      quote: draft.quote,
      category: draft.category,
      correction: normalizedCorrection,
      comment: draft.comment.trim(),
      createdAt: draft.createdAt ?? new Date().toISOString(),
    };

    const nextAnnotations = draft.id
      ? annotations.map((a) => (a.id === draft.id ? item : a))
      : [...annotations, item].sort((a, b) => a.start - b.start);

    const nextVerdicts: Record<string, AiVerdict> = draft.fromAi
      ? { ...aiVerdicts, [draft.fromAi]: "wrong" }
      : aiVerdicts;

    const ok = await persistReview({
      ...review,
      annotations: nextAnnotations,
      aiVerdicts: nextVerdicts,
    });
    if (ok) {
      setSelectedAnnotationId(item.id);
      setDraft(null);
    }
  };

  const handleDeleteAnnotation = async (id: string) => {
    if (saving) return;
    const nextAnnotations = annotations.filter((a) => a.id !== id);
    const ok = await persistReview({
      ...review,
      annotations: nextAnnotations,
    });
    if (ok) {
      if (selectedAnnotationId === id) setSelectedAnnotationId(null);
      if (draft?.id === id) setDraft(null);
    }
  };

  const handleToggleVerdict = async (err: LanguageError, verdict: AiVerdict) => {
    if (saving) return;
    const key = aiKey(err);
    const nextVerdicts = { ...aiVerdicts };
    if (nextVerdicts[key] === verdict) {
      delete nextVerdicts[key];
    } else {
      nextVerdicts[key] = verdict;
    }
    await persistReview({
      ...review,
      aiVerdicts: nextVerdicts,
    });
  };

  const activeCorrections = effectiveErrors(aiErrors, review);
  const correctedPieces = applyCorrections(text, activeCorrections);
  const fullCorrectedText = correctedText(correctedPieces);
  const spans = buildPassageSpans(text, annotations, aiErrors, draft);

  const judgedCount = aiErrors.filter(
    (e) => aiVerdicts[aiKey(e)] !== undefined,
  ).length;
  const okCount = aiErrors.filter(
    (e) => aiVerdicts[aiKey(e)] === "ok",
  ).length;

  const btnBase =
    "rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:opacity-40";
  const btnPrimary = `${btnBase} bg-sprite-500 text-white hover:bg-sprite-600`;
  const btnOutline = `${btnBase} border border-black/10 text-ink-600 hover:bg-sprite-50`;
  const inputBase =
    "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-sprite-500";

  return (
    <>
      <PageHeader
        title={`첨삭 — ${detail.taskTitle}`}
        subtitle={`${detail.studentName ?? "이름 없음"} · 교사 첨삭은 학생 결과 화면에서 AI 교정보다 우선 반영됩니다.`}
        actions={
          <div className="flex items-center gap-3">
            {lastSavedLabel && (
              <span className="text-xs text-ink-400">{lastSavedLabel}</span>
            )}
            <button
              type="button"
              className={btnOutline}
              onClick={() => navigate({ page: "result", attemptId })}
            >
              결과 보기
            </button>
          </div>
        }
      />

      {saveError && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {saveError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid content-start gap-4">
          <details className="rounded-xl bg-white p-5 text-sm shadow-sm">
            <summary className="cursor-pointer font-semibold text-ink-600">
              문제 보기
            </summary>
            <p className="mt-2 whitespace-pre-wrap text-ink-600" data-selectable>
              {detail.prompt}
            </p>
            {detail.material && (
              <p
                className="mt-2 whitespace-pre-wrap rounded-lg bg-sprite-50 p-3 text-ink-600"
                data-selectable
              >
                {detail.material}
              </p>
            )}
          </details>

          <section className="rounded-xl bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-600">학생 답안</h2>
              <span className="text-xs text-ink-400">
                문구를 드래그해 첨삭을 추가하세요
              </span>
            </div>

            <div
              ref={passageRef}
              onMouseUp={handlePassageMouseUp}
              data-selectable
              className="cursor-text whitespace-pre-wrap rounded-lg border border-black/10 p-3 text-[15px] leading-8"
            >
              {spans.map((span) => {
                const isSelected =
                  span.annotation !== undefined &&
                  span.annotation.id === selectedAnnotationId;

                let spanClass = "";
                if (span.isDraft) {
                  spanClass = "rounded bg-amber-200 px-0.5 font-medium";
                } else if (span.annotation) {
                  const baseColor =
                    KIND_STYLE[GUIDE[span.annotation.category].kind];
                  spanClass = isSelected
                    ? `rounded px-0.5 font-semibold ring-2 ring-sprite-500 ${baseColor}`
                    : `rounded px-0.5 ${baseColor}`;
                } else if (span.aiError) {
                  const v = aiVerdicts[aiKey(span.aiError)];
                  spanClass =
                    v === "wrong"
                      ? "rounded bg-black/5 px-0.5 text-ink-400"
                      : v === "ok"
                        ? "rounded bg-rose-100 px-0.5 underline decoration-sprite-500 decoration-2"
                        : "rounded bg-rose-50 px-0.5 underline decoration-rose-400 decoration-dotted";
                }

                return (
                  <span
                    key={`${span.start}-${span.end}`}
                    onClick={
                      span.annotation
                        ? () => openAnnotationForEdit(span.annotation!)
                        : undefined
                    }
                    className={spanClass}
                  >
                    {span.text}
                  </span>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-400">
              <span>
                <span className="rounded bg-violet-100 px-1.5 py-0.5 text-ink-600">
                  선생님
                </span>{" "}
                교사 첨삭
              </span>
              <span>
                <span className="rounded bg-rose-50 px-1.5 py-0.5 text-ink-600">
                  AI
                </span>{" "}
                판정 전
              </span>
              <span>
                <span className="rounded bg-rose-100 px-1.5 py-0.5 text-ink-600">
                  AI ✓
                </span>{" "}
                맞음
              </span>
              <span>
                <span className="rounded bg-black/5 px-1.5 py-0.5 text-ink-400">
                  AI ✗
                </span>{" "}
                틀림
              </span>
            </div>
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-600">
                고친 글 미리보기
              </h2>
              <button
                type="button"
                className="text-xs text-sprite-700 underline"
                onClick={() => navigator.clipboard?.writeText(fullCorrectedText)}
              >
                복사
              </button>
            </div>
            <p
              className="whitespace-pre-wrap text-[15px] leading-8 text-ink-600"
              data-selectable
            >
              {correctedPieces.map((piece, idx) =>
                piece.op === "same" ? (
                  <span key={idx}>{piece.text}</span>
                ) : piece.op === "del" ? (
                  <span
                    key={idx}
                    className="text-rose-500 line-through decoration-rose-400"
                  >
                    {piece.text}
                  </span>
                ) : (
                  <span
                    key={idx}
                    className="rounded bg-sprite-100 px-0.5 font-semibold text-sprite-700"
                  >
                    {piece.text}
                  </span>
                ),
              )}
            </p>
          </section>
        </div>

        <div className="grid content-start gap-4">
          {draft ? (
            <section className="grid gap-3 rounded-xl border-2 border-sprite-500 bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold text-ink-600">
                {draft.id
                  ? "첨삭 수정"
                  : draft.fromAi
                    ? "AI 교정 고치기"
                    : "새 첨삭 작성"}
              </div>

              <div
                className="rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-ink-600"
                data-selectable
              >
                “{draft.quote}”
              </div>

              <label className="grid gap-1 text-xs text-ink-600">
                오류 분류
                <select
                  className={inputBase}
                  value={draft.category}
                  disabled={saving}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      category: e.target.value as ErrorCategory,
                    })
                  }
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {GUIDE[cat].label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-xs text-ink-600">
                고친 표현 (코멘트만 남기려면 원문 그대로 두세요)
                <input
                  type="text"
                  className={inputBase}
                  value={draft.correction}
                  disabled={saving}
                  onChange={(e) =>
                    setDraft({ ...draft, correction: e.target.value })
                  }
                />
              </label>

              {draft.correction !== draft.quote && (
                <div className="text-sm">
                  <WordDiffInline
                    before={draft.quote}
                    after={draft.correction}
                  />
                </div>
              )}

              <label className="grid gap-1 text-xs text-ink-600">
                선생님 코멘트
                <textarea
                  className={`${inputBase} h-20`}
                  value={draft.comment}
                  disabled={saving}
                  placeholder="학생에게 전달할 설명을 입력하세요."
                  onChange={(e) =>
                    setDraft({ ...draft, comment: e.target.value })
                  }
                />
              </label>

              <p className="text-xs text-ink-400">
                문법 가이드: {GUIDE[draft.category].principle}
              </p>

              {isDraftUnchangedAndEmpty && (
                <p className="text-xs text-rose-600">
                  고친 표현을 수정하거나 코멘트를 입력해야 저장할 수 있습니다.
                </p>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={saving || isDraftUnchangedAndEmpty}
                  onClick={handleSaveDraft}
                >
                  {saving
                    ? "저장 중…"
                    : draft.id
                      ? "수정 저장"
                      : "첨삭 추가"}
                </button>
                <button
                  type="button"
                  className={btnOutline}
                  disabled={saving}
                  onClick={() => setDraft(null)}
                >
                  취소
                </button>
                {draft.id && (
                  <button
                    type="button"
                    className={`${btnBase} ml-auto text-red-600 hover:bg-rose-50`}
                    disabled={saving}
                    onClick={() => handleDeleteAnnotation(draft.id!)}
                  >
                    삭제
                  </button>
                )}
              </div>
            </section>
          ) : (
            <section className="rounded-xl border border-dashed border-sprite-300 bg-white/60 p-5 text-sm text-ink-600">
              왼쪽 학생 답안에서 구절을 드래그하면 오류 분류와 고친 표현, 코멘트를 작성할 수 있습니다.
            </section>
          )}

          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-ink-600">
              선생님 첨삭 ({annotations.length}개)
            </h2>
            {annotations.length === 0 ? (
              <p className="text-xs text-ink-400">등록된 첨삭이 없습니다.</p>
            ) : (
              <ul className="grid gap-2">
                {annotations.map((ann) => {
                  const isSelected = ann.id === selectedAnnotationId;
                  return (
                    <li
                      key={ann.id}
                      onClick={() =>
                        setSelectedAnnotationId((prev) =>
                          prev === ann.id ? null : ann.id,
                        )
                      }
                      className={`cursor-pointer rounded-lg p-3 text-sm transition ${
                        isSelected
                          ? "bg-violet-100/70 ring-2 ring-sprite-500"
                          : "bg-violet-50/60 hover:bg-violet-100/40"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-white px-1.5 py-0.5 text-[11px] font-medium text-ink-600 ring-1 ring-black/5">
                          {GUIDE[ann.category].label}
                        </span>
                        <WordDiffInline
                          before={ann.quote}
                          after={ann.correction}
                        />
                        <span className="ml-auto flex shrink-0 gap-2 text-xs">
                          <button
                            type="button"
                            disabled={saving}
                            className="font-medium text-sprite-700 disabled:opacity-40"
                            onClick={(e) => {
                              e.stopPropagation();
                              openAnnotationForEdit(ann);
                            }}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            className="text-ink-400 hover:text-red-600 disabled:opacity-40"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteAnnotation(ann.id);
                            }}
                          >
                            삭제
                          </button>
                        </span>
                      </div>
                      {ann.comment && (
                        <p className="mt-1.5 text-xs text-ink-600">
                          {ann.comment}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-600">
                AI 교정 목록 ({aiErrors.length}개)
              </h2>
              <span className="text-xs text-ink-400">
                판정 {judgedCount}개 중 ✓ {okCount}개
                {judgedCount > 0
                  ? ` (${Math.round((okCount / judgedCount) * 100)}%)`
                  : ""}
              </span>
            </div>

            {aiErrors.length === 0 ? (
              <p className="text-xs text-ink-400">AI가 제안한 교정이 없습니다.</p>
            ) : (
              <ul className="grid gap-2">
                {aiErrors.map((err) => {
                  const key = aiKey(err);
                  const verdict = aiVerdicts[key];

                  return (
                    <li
                      key={key}
                      className={`rounded-lg p-3 text-sm ${
                        verdict === "wrong"
                          ? "bg-black/5 opacity-60"
                          : verdict === "ok"
                            ? "bg-sprite-50"
                            : "bg-rose-50/50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-white px-1.5 py-0.5 text-[11px] font-medium text-ink-600 ring-1 ring-black/5">
                          {GUIDE[err.category].label}
                        </span>
                        <span className="text-[11px] text-ink-400">
                          {err.source === "gec"
                            ? "문법 모델"
                            : err.source === "rule"
                              ? "규칙"
                              : "AI"}
                        </span>
                        <WordDiffInline
                          before={err.quote}
                          after={err.correction}
                        />
                      </div>

                      {err.why && (
                        <p className="mt-1.5 text-xs text-ink-600">{err.why}</p>
                      )}

                      <div className="mt-2 flex gap-1.5 text-xs">
                        <button
                          type="button"
                          disabled={saving}
                          className={`rounded px-2.5 py-1 disabled:opacity-40 ${
                            verdict === "ok"
                              ? "bg-sprite-500 font-semibold text-white"
                              : "border border-black/10 text-ink-600 hover:bg-sprite-50"
                          }`}
                          onClick={() => handleToggleVerdict(err, "ok")}
                        >
                          ✓ 맞음
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          className={`rounded px-2.5 py-1 disabled:opacity-40 ${
                            verdict === "wrong"
                              ? "bg-rose-500 font-semibold text-white"
                              : "border border-black/10 text-ink-600 hover:bg-rose-50"
                          }`}
                          onClick={() => handleToggleVerdict(err, "wrong")}
                        >
                          ✗ 틀림
                        </button>
                        {err.start >= 0 && (
                          <button
                            type="button"
                            disabled={saving}
                            className="rounded border border-black/10 px-2.5 py-1 text-ink-600 hover:bg-sprite-50 disabled:opacity-40"
                            onClick={() => handleStartFromAi(err)}
                          >
                            고치기
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}