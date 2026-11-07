// 교사 첨삭: the task and the student's essay on the left; on the right, the teacher drags over
// a wrong passage → chooses the error type → writes the correction and a comment. AI
// corrections can be confirmed (맞음), rejected (틀림) or rewritten (고치기). The corrected essay
// updates live. Every change is saved immediately (attempts.teacher_review).
import { useEffect, useMemo, useRef, useState } from "react";
import type { Navigate } from "../App";
import PageHeader from "../components/PageHeader";
import { api, inTauri } from "../lib/api";
import { CATEGORIES, GUIDE, wordDiff, type ErrorCategory } from "../lib/grammarGuide";
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

const btn = "rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:opacity-40";
const primary = `${btn} bg-sprite-500 text-white hover:bg-sprite-600`;
const ghost = `${btn} border border-black/10 text-ink-600 hover:bg-sprite-50`;
const field = "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-sprite-500";

interface Draft {
  /** Annotation being edited (null = new). */
  id: string | null;
  start: number;
  end: number;
  quote: string;
  category: ErrorCategory;
  correction: string;
  comment: string;
  /** AI correction this replaces ("고치기"), marked wrong on save. */
  fromAi?: string;
}

function Diff({ before, after }: { before: string; after: string }) {
  const parts = wordDiff(before, after);
  return (
    <span className="leading-6">
      {parts.map((p, i) => (
        <span key={i}>
          <span
            className={
              p.op === "del"
                ? "rounded bg-rose-50 px-0.5 text-rose-600 line-through"
                : p.op === "ins"
                  ? "rounded bg-sprite-100 px-0.5 font-semibold text-sprite-700"
                  : "text-ink-600"
            }
          >
            {p.text}
          </span>{" "}
        </span>
      ))}
    </span>
  );
}

/** The essay with teacher (violet) and AI (rose) marks; AI items marked wrong are greyed. */
function MarkedEssay({
  text,
  teacher,
  ai,
  verdicts,
  pending,
}: {
  text: string;
  teacher: TeacherAnnotation[];
  ai: LanguageError[];
  verdicts: Record<string, AiVerdict>;
  pending: { start: number; end: number } | null;
}) {
  type Mark = { start: number; end: number; cls: string };
  const marks: Mark[] = [
    ...(pending ? [{ ...pending, cls: "bg-amber-200" }] : []),
    ...teacher.map((t) => ({ start: t.start, end: t.end, cls: "bg-violet-100 underline decoration-violet-500 decoration-2" })),
    ...ai
      .filter((e) => e.start >= 0)
      .map((e) => ({
        start: e.start,
        end: e.end,
        cls:
          verdicts[aiKey(e)] === "wrong"
            ? "bg-black/5 text-ink-400"
            : verdicts[aiKey(e)] === "ok"
              ? "bg-rose-100 underline decoration-sprite-500 decoration-2"
              : "bg-rose-50 underline decoration-rose-400 decoration-dotted",
      })),
  ];
  // First mark wins on overlap (pending > teacher > AI).
  const chosen: Mark[] = [];
  for (const m of marks) if (!chosen.some((c) => m.start < c.end && c.start < m.end)) chosen.push(m);
  chosen.sort((a, b) => a.start - b.start);
  const out: React.ReactNode[] = [];
  let pos = 0;
  chosen.forEach((m, i) => {
    if (m.start > pos) out.push(text.slice(pos, m.start));
    out.push(
      <span key={i} className={`rounded px-0.5 ${m.cls}`}>
        {text.slice(m.start, m.end)}
      </span>,
    );
    pos = m.end;
  });
  out.push(text.slice(pos));
  return <>{out}</>;
}

export default function ReviewPage({ attemptId, navigate }: { attemptId: number; navigate: Navigate }) {
  const [detail, setDetail] = useState<AttemptDetail | null>(null);
  const [review, setReview] = useState<TeacherReview | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const essayRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!inTauri()) return;
    api
      .getAttempt(attemptId)
      .then((d) => {
        setDetail(d);
        setReview(parseReview(d.teacherReview));
      })
      .catch((e) => setError(String(e)));
  }, [attemptId]);

  const ai: LanguageError[] = useMemo(() => {
    try {
      const ev = detail?.evaluation ? (JSON.parse(detail.evaluation.rubricJson) as LlmEvaluation) : null;
      return ev?.errors ?? [];
    } catch {
      return [];
    }
  }, [detail]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!detail || !review) return <p className="text-sm text-ink-400">불러오는 중…</p>;
  const text = detail.responseText;

  const persist = async (next: TeacherReview) => {
    const r = { ...next, updatedAt: new Date().toISOString() };
    setReview(r);
    try {
      await api.setTeacherReview(attemptId, JSON.stringify(r));
      setSaved(`저장됨 ${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`);
    } catch (e) {
      setError(`저장 실패: ${String(e)}`);
    }
  };

  const onSelect = () => {
    if (!essayRef.current) return;
    const off = selectionOffsets(essayRef.current);
    if (!off) return;
    const { start, end } = snapToWords(text, off.start, off.end);
    if (end <= start) return;
    const quote = text.slice(start, end);
    // Selecting inside an existing teacher correction edits it.
    const existing = review.annotations.find((a) => a.start < end && start < a.end);
    setDraft(
      existing
        ? { ...existing }
        : { id: null, start, end, quote, category: "grammar_other", correction: quote, comment: "" },
    );
    window.getSelection()?.removeAllRanges();
  };

  const saveDraft = () => {
    if (!draft) return;
    const ann: TeacherAnnotation = {
      id: draft.id ?? `t${Date.now()}`,
      start: draft.start,
      end: draft.end,
      quote: draft.quote,
      category: draft.category,
      correction: draft.correction,
      comment: draft.comment.trim(),
      createdAt: new Date().toISOString(),
    };
    const annotations = draft.id
      ? review.annotations.map((a) => (a.id === draft.id ? ann : a))
      : [...review.annotations, ann].sort((a, b) => a.start - b.start);
    const aiVerdicts = draft.fromAi ? { ...review.aiVerdicts, [draft.fromAi]: "wrong" as AiVerdict } : review.aiVerdicts;
    persist({ ...review, annotations, aiVerdicts });
    setDraft(null);
  };

  const removeAnn = (id: string) => persist({ ...review, annotations: review.annotations.filter((a) => a.id !== id) });

  const setVerdict = (e: LanguageError, v: AiVerdict | null) => {
    const aiVerdicts = { ...review.aiVerdicts };
    if (v) aiVerdicts[aiKey(e)] = v;
    else delete aiVerdicts[aiKey(e)];
    persist({ ...review, aiVerdicts });
  };

  const rewriteAi = (e: LanguageError) =>
    setDraft({
      id: null,
      start: e.start,
      end: e.end,
      quote: e.quote,
      category: e.category ?? "grammar_other",
      correction: e.correction,
      comment: "",
      fromAi: aiKey(e),
    });

  const effective = effectiveErrors(ai, review);
  const pieces = applyCorrections(text, effective);
  const judged = ai.filter((e) => review.aiVerdicts[aiKey(e)]).length;
  const okCount = ai.filter((e) => review.aiVerdicts[aiKey(e)] === "ok").length;

  return (
    <>
      <PageHeader
        title={`첨삭 — ${detail.taskTitle}`}
        subtitle={`${detail.studentName ?? "이름 없음"} · 선생님의 첨삭은 학생 결과 화면에서 AI 교정보다 우선해서 보여요.`}
        actions={
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-400">{saved}</span>
            <button className={ghost} onClick={() => navigate({ page: "result", attemptId })}>
              ← 결과로
            </button>
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---------------- left: task + essay */}
        <div className="grid content-start gap-4">
          <details className="rounded-xl bg-white p-5 text-sm shadow-sm">
            <summary className="cursor-pointer font-semibold text-ink-600">문제</summary>
            <p className="mt-2 whitespace-pre-wrap" data-selectable>
              {detail.prompt}
            </p>
            {detail.material && <p className="mt-2 whitespace-pre-wrap rounded bg-sprite-50 p-2 text-ink-600">{detail.material}</p>}
          </details>
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-600">학생 에세이</h2>
              <span className="text-[11px] text-ink-400">틀린 부분을 마우스로 드래그하세요</span>
            </div>
            <p
              ref={essayRef}
              onMouseUp={onSelect}
              className="cursor-text whitespace-pre-wrap text-[15px] leading-8 select-text"
              style={{ userSelect: "text", WebkitUserSelect: "text" }}
              data-selectable
            >
              <MarkedEssay text={text} teacher={review.annotations} ai={ai} verdicts={review.aiVerdicts} pending={draft} />
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-ink-400">
              <span><span className="rounded bg-violet-100 px-1">선생님</span> 교사 첨삭</span>
              <span><span className="rounded bg-rose-50 px-1">AI</span> 검토 전</span>
              <span><span className="rounded bg-rose-100 px-1">AI ✓</span> 맞음</span>
              <span><span className="rounded bg-black/5 px-1 text-ink-400">AI ✗</span> 틀림 (학생에게 숨김)</span>
            </div>
          </section>
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-600">수정된 에세이</h2>
              <button className="text-xs text-sprite-700 underline" onClick={() => navigator.clipboard?.writeText(correctedText(pieces))}>
                복사
              </button>
            </div>
            <p className="whitespace-pre-wrap text-[15px] leading-8" data-selectable>
              {pieces.map((p, i) =>
                p.op === "same" ? (
                  <span key={i}>{p.text}</span>
                ) : p.op === "del" ? (
                  <span key={i} className="text-rose-500 line-through decoration-rose-400">
                    {p.text}
                  </span>
                ) : (
                  <span key={i} className="rounded bg-sprite-100 px-0.5 font-semibold text-sprite-700">
                    {p.text}
                  </span>
                ),
              )}
            </p>
          </section>
        </div>

        {/* ---------------- right: editor + lists */}
        <div className="grid content-start gap-4">
          {draft ? (
            <section className="grid gap-3 rounded-xl border-2 border-sprite-500 bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold">{draft.id ? "첨삭 수정" : draft.fromAi ? "AI 교정 고치기" : "새 첨삭"}</div>
              <div className="rounded bg-amber-50 px-2 py-1 text-sm" data-selectable>
                “{draft.quote}”
              </div>
              <label className="grid gap-1 text-xs text-ink-600">
                오류 유형
                <select className={field} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as ErrorCategory })}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {GUIDE[c].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-ink-600">
                고친 표현 (코멘트만 달려면 그대로 두세요)
                <input className={field} value={draft.correction} onChange={(e) => setDraft({ ...draft, correction: e.target.value })} autoFocus />
              </label>
              {draft.correction !== draft.quote && (
                <div className="text-sm">
                  <Diff before={draft.quote} after={draft.correction} />
                </div>
              )}
              <label className="grid gap-1 text-xs text-ink-600">
                코멘트 (학생에게 보이는 설명)
                <textarea
                  className={`${field} h-20`}
                  placeholder="예: 주어 Many of us는 복수라서 was가 아니라 were를 써야 해요."
                  value={draft.comment}
                  onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
                />
              </label>
              <p className="text-[11px] text-ink-400">원칙: {GUIDE[draft.category].principle}</p>
              <div className="flex gap-2">
                <button className={primary} onClick={saveDraft}>
                  {draft.id ? "수정 저장" : "첨삭 추가"}
                </button>
                <button className={ghost} onClick={() => setDraft(null)}>
                  취소
                </button>
                {draft.id && (
                  <button className={`${btn} ml-auto text-red-600`} onClick={() => (removeAnn(draft.id!), setDraft(null))}>
                    삭제
                  </button>
                )}
              </div>
            </section>
          ) : (
            <section className="rounded-xl border border-dashed border-sprite-300 bg-white/60 p-5 text-sm text-ink-600">
              왼쪽 에세이에서 틀린 부분을 드래그하면 여기서 오류 유형을 고르고 고친 표현과 코멘트를 달 수 있어요. 이미 첨삭한 부분을 드래그하면 수정할 수 있어요.
            </section>
          )}

          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-ink-600">선생님 첨삭 {review.annotations.length}개</h2>
            {review.annotations.length === 0 && <p className="text-xs text-ink-400">아직 없어요.</p>}
            <ul className="grid gap-2">
              {review.annotations.map((a) => (
                <li key={a.id} className="rounded-lg bg-violet-50/60 p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-white px-1.5 text-[10px] text-ink-600 ring-1 ring-black/5">{GUIDE[a.category].label}</span>
                    <Diff before={a.quote} after={a.correction} />
                    <span className="ml-auto flex shrink-0 gap-2 text-xs">
                      <button className="text-sprite-700" onClick={() => setDraft({ ...a })}>
                        수정
                      </button>
                      <button className="text-ink-400 hover:text-red-600" onClick={() => removeAnn(a.id)}>
                        삭제
                      </button>
                    </span>
                  </div>
                  {a.comment && <p className="mt-1 text-xs text-ink-600">{a.comment}</p>}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold text-ink-600">AI 교정 검토</h2>
            <p className="mb-2 text-xs text-ink-400">
              {ai.length}개 중 {judged}개 검토{judged > 0 ? ` · 맞음 ${okCount}개 (${Math.round((okCount / judged) * 100)}%)` : ""} · 틀림으로 표시하면 학생에게 보이지 않아요.
            </p>
            {ai.length === 0 && <p className="text-xs text-ink-400">AI 교정이 없어요.</p>}
            <ul className="grid gap-2">
              {ai.map((e) => {
                const k = aiKey(e);
                const v = review.aiVerdicts[k];
                return (
                  <li key={k} className={`rounded-lg p-2 text-sm ${v === "wrong" ? "bg-black/5 opacity-60" : v === "ok" ? "bg-sprite-50" : "bg-rose-50/50"}`}>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-white px-1.5 text-[10px] text-ink-600 ring-1 ring-black/5">{GUIDE[e.category ?? "grammar_other"].label}</span>
                      <span className="text-[10px] text-ink-400">{e.source === "gec" ? "문법 모델" : e.source === "rule" ? "규칙" : "AI"}</span>
                      <Diff before={e.quote} after={e.correction} />
                    </div>
                    {e.why && <p className="mt-1 text-xs text-ink-600">{e.why}</p>}
                    <div className="mt-1.5 flex gap-1.5 text-xs">
                      <button
                        className={`rounded px-2 py-0.5 ${v === "ok" ? "bg-sprite-500 text-white" : "border border-black/10"}`}
                        onClick={() => setVerdict(e, v === "ok" ? null : "ok")}
                      >
                        ✓ 맞음
                      </button>
                      <button
                        className={`rounded px-2 py-0.5 ${v === "wrong" ? "bg-rose-500 text-white" : "border border-black/10"}`}
                        onClick={() => setVerdict(e, v === "wrong" ? null : "wrong")}
                      >
                        ✗ 틀림
                      </button>
                      {e.start >= 0 && (
                        <button className="rounded border border-black/10 px-2 py-0.5" onClick={() => rewriteAi(e)}>
                          ✎ 고치기
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
