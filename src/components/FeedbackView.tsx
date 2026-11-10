import { GUIDE, categoryFromKind, wordDiff } from "../lib/grammarGuide";
import type { LanguageError, LlmEvaluation } from "../lib/scoring";

export interface Selection {
  selected: number | null;
  onSelect: (i: number | null) => void;
}

function Diff({ before, after }: { before: string; after: string }) {
  const diffs = wordDiff(before, after);
  const totalPieces = diffs.length;
  const changedPieces = diffs.filter((d) => d.op !== "same").length;
  const isTooManyChanges = changedPieces > Math.max(2, totalPieces * 0.5);

  if (isTooManyChanges) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium" data-selectable>
        <span className="line-through text-red-600 bg-red-50 px-1 rounded">{before}</span>
        <span className="text-ink-400">→</span>
        <span className="font-bold text-sprite-700 bg-sprite-50 px-1 rounded">{after}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm font-medium" data-selectable>
      {diffs.map((d, i) => {
        let spanNode = null;
        if (d.op === "same") {
          spanNode = <span className="text-ink-900">{d.text}</span>;
        } else if (d.op === "del") {
          spanNode = (
            <span className="line-through text-red-600 bg-red-50 px-1 rounded">
              {d.text}
            </span>
          );
        } else if (d.op === "ins") {
          spanNode = (
            <span className="font-bold text-sprite-700 bg-sprite-50 px-1 rounded">
              {d.text}
            </span>
          );
        }
        return (
          <span key={i}>
            {spanNode}
            {" "}
          </span>
        );
      })}
    </div>
  );
}

function SourceBadge({ source }: { source?: string }) {
  if (source === "rule") {
    return <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800">규칙 검사</span>;
  }
  if (source === "gec") {
    return <span className="rounded bg-sprite-100 px-1.5 py-0.5 text-[11px] font-semibold text-sprite-700">문법 모델</span>;
  }
  if (source === "teacher") {
    return <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-bold text-violet-700">선생님</span>;
  }
  return null;
}

function SourceBadgeShort({ source }: { source?: string }) {
  if (source === "rule") {
    return <span className="rounded bg-sky-100 px-1 py-0.5 text-[10px] font-semibold text-sky-800">규칙</span>;
  }
  if (source === "gec") {
    return <span className="rounded bg-sprite-100 px-1 py-0.5 text-[10px] font-semibold text-sprite-700">문법 모델</span>;
  }
  if (source === "teacher") {
    return <span className="rounded bg-violet-100 px-1 py-0.5 text-[10px] font-bold text-violet-700">선생님</span>;
  }
  return null;
}

export function BandBadge({ band, label = "추정 밴드" }: { band: number; label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl bg-sprite-500 px-5 py-4 text-white shadow-sm">
      <span className="text-xs font-medium text-sprite-100">{label}</span>
      <span className="my-0.5 text-3xl font-extrabold tracking-tight">{band.toFixed(1)}</span>
      <span className="text-xs text-sprite-100">/ 6.0</span>
    </div>
  );
}

export function CorrectionDetail({ e, onClose }: { e: LanguageError; onClose?: () => void }) {
  const cat = e.category ?? categoryFromKind(e.kind);
  const guideInfo = GUIDE[cat];

  return (
    <div className="rounded-xl border border-sprite-500 bg-white p-4 shadow-sm space-y-3" data-selectable>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {guideInfo?.label && (
            <span className="rounded bg-sprite-100 px-2 py-0.5 text-xs font-bold text-sprite-700">
              {guideInfo.label}
            </span>
          )}
          <SourceBadge source={e.source} />
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-ink-400 hover:text-ink-900 font-semibold"
          >
            닫기 ✕
          </button>
        )}
      </div>

      <Diff before={e.quote} after={e.correction} />

      {e.why && <p className="text-xs text-ink-600">{e.why}</p>}

      {guideInfo?.principle && (
        <div className="text-xs text-ink-600 space-y-1">
          <div><strong className="text-ink-900">원칙:</strong> {guideInfo.principle}</div>
          {guideInfo.examples && guideInfo.examples.length > 0 && (
            <div className="text-[11px] text-ink-400">
              예) {guideInfo.examples.join(" · ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CorrectionList({
  errors,
  selected,
  onSelect,
}: {
  errors: LanguageError[];
  selected?: number | null;
  onSelect?: (i: number | null) => void;
}) {
  if (!errors || errors.length === 0) {
    return <p className="text-xs text-ink-400">교정할 부분을 찾지 못했어요.</p>;
  }

  return (
    <div className="space-y-2">
      {errors.map((err, i) => {
        const isOpen = selected === i;
        const cat = err.category ?? categoryFromKind(err.kind);
        const guideInfo = GUIDE[cat];
        const isLocatedFalse = err.located === false;

        return (
          <div key={i} className="space-y-2">
            <button
              type="button"
              onClick={() => {
                if (onSelect) {
                  onSelect(isOpen ? null : i);
                }
              }}
              className={`w-full flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl p-3 text-left transition border border-black/5 ${
                isOpen ? "bg-sprite-50 border-sprite-300" : "bg-white hover:bg-sprite-50"
              } ${isLocatedFalse ? "border-red-300 bg-red-50/50" : ""}`}
              data-selectable
            >
              <div className="flex items-center gap-2 flex-wrap">
                {guideInfo?.label && (
                  <span className="rounded border border-black/10 bg-white px-2 py-0.5 text-xs font-semibold text-ink-900">
                    {guideInfo.label}
                  </span>
                )}
                <SourceBadgeShort source={err.source} />
                <Diff before={err.quote} after={err.correction} />
                {isLocatedFalse && (
                  <span className="text-xs text-red-600 font-medium"> (답안에서 찾을 수 없음)</span>
                )}
              </div>
            </button>

            {!isOpen && err.why && (
              <p className="text-xs text-ink-400 px-3" data-selectable>
                {err.why}
              </p>
            )}

            {isOpen && (
              <div className="pl-2">
                <CorrectionDetail e={err} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AnnotatedResponse({
  text,
  errors,
  selected,
  onSelect,
}: {
  text: string;
  errors: LanguageError[];
  selected?: number | null;
  onSelect?: (i: number | null) => void;
}) {
  const validErrors = (errors || [])
    .map((e, originalIndex) => ({ e, originalIndex }))
    .filter(
      ({ e }) =>
        e.located !== false &&
        e.start >= 0 &&
        e.end > e.start &&
        e.end <= text.length
    );

  validErrors.sort((a, b) => a.e.start - b.e.start);

  const nonOverlapping: { e: LanguageError; originalIndex: number }[] = [];
  let lastEnd = 0;
  for (const item of validErrors) {
    if (item.e.start >= lastEnd) {
      nonOverlapping.push(item);
      lastEnd = item.e.end;
    }
  }

  let currentIndex = 0;
  const parts: React.ReactNode[] = [];

  nonOverlapping.forEach(({ e, originalIndex }, idx) => {
    if (e.start > currentIndex) {
      parts.push(
        <span key={`txt-${idx}`}>{text.slice(currentIndex, e.start)}</span>
      );
    }

    const isSelected = selected === originalIndex;
    const kindColors: Record<string, string> = {
      grammar: "bg-rose-100 text-rose-900 border-b-2 border-rose-400",
      sentence: "bg-amber-100 text-amber-900 border-b-2 border-amber-400",
      word_choice: "bg-sky-100 text-sky-900 border-b-2 border-sky-400",
      register: "bg-violet-100 text-violet-900 border-b-2 border-violet-400",
    };
    const colorClass =
      kindColors[e.kind] || "bg-gray-100 text-gray-900 border-b-2 border-gray-400";

    parts.push(
      <mark
        key={`mark-${originalIndex}`}
        onClick={() => {
          if (onSelect) {
            onSelect(selected === originalIndex ? null : originalIndex);
          }
        }}
        className={`cursor-pointer px-1 rounded transition ${colorClass} ${
          isSelected ? "ring-2 ring-sprite-500 font-semibold" : ""
        }`}
      >
        {text.slice(e.start, e.end)}
      </mark>
    );
    currentIndex = e.end;
  });

  if (currentIndex < text.length) {
    parts.push(<span key="txt-end">{text.slice(currentIndex)}</span>);
  }

  const selectedError =
    selected != null && errors && errors[selected] ? errors[selected] : null;

  return (
    <div className="space-y-4">
      <div
        className="whitespace-pre-wrap text-sm leading-relaxed text-ink-900"
        data-selectable
      >
        {parts.length > 0 ? parts : text}
      </div>

      {selectedError ? (
        <CorrectionDetail
          e={selectedError}
          onClose={() => {
            if (onSelect) onSelect(null);
          }}
        />
      ) : (
        validErrors.length > 0 && (
          <p className="text-xs text-ink-400">
            밑줄 친 부분을 클릭하면 왜 틀렸는지와 고친 표현이 보여요.
          </p>
        )
      )}
    </div>
  );
}

export default function FeedbackView({
  evaluation,
  showAnalysis = true,
  selected,
  onSelect,
}: {
  evaluation: LlmEvaluation;
  showAnalysis?: boolean;
  selected?: number | null;
  onSelect?: (i: number | null) => void;
}) {
  return (
    <div className="space-y-6">
      {/* 1. Score caps */}
      {evaluation.caps && evaluation.caps.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm space-y-1">
          <div className="font-bold">점수 상한 적용</div>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-amber-800">
            {evaluation.caps.map((cap, i) => (
              <li key={i}>{cap}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 2. Points (Requirements check) */}
      {evaluation.points && evaluation.points.length > 0 && (
        <div className="rounded-xl bg-white p-6 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-ink-900">요구사항 체크</h3>
          <div className="space-y-2.5">
            {evaluation.points.map((pt, i) => {
              const statusColorMap: Record<string, { bg: string; text: string; label: string }> = {
                covered: { bg: "bg-emerald-100 text-emerald-800", text: "text-emerald-700", label: "다룸" },
                partial: { bg: "bg-amber-100 text-amber-800", text: "text-amber-700", label: "부족" },
                missing: { bg: "bg-red-100 text-red-800", text: "text-red-700", label: "빠짐" },
              };
              const statusInfo = statusColorMap[pt.status] || { bg: "bg-gray-100 text-gray-800", text: "text-gray-700", label: pt.status };

              return (
                <div key={i} className="rounded-lg bg-sprite-50 p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${statusInfo.bg}`}>
                      {statusInfo.label}
                    </span>
                    <span className="text-sm font-medium text-ink-900">
                      {pt.pointKo ? pt.pointKo : pt.point}
                    </span>
                    {pt.pointKo && (
                      <span className="text-xs text-ink-400">({pt.point})</span>
                    )}
                  </div>
                  {pt.evidence && (
                    <div className="text-xs text-ink-600 pl-2 border-l-2 border-sprite-300" data-selectable>
                      근거: “{pt.evidence}”
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Criteria */}
      {evaluation.criteria && evaluation.criteria.map((crit, idx) => (
        <div key={idx} className="rounded-xl bg-white p-6 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-ink-900">{crit.nameKo}</div>
              <div className="text-xs text-ink-400">{crit.name}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <div
                    key={s}
                    className={`h-2.5 w-5 rounded-full ${
                      s <= crit.score ? "bg-sprite-500" : "bg-sprite-100"
                    }`}
                  />
                ))}
              </div>
              <span className="text-sm font-bold text-ink-900">{crit.score}/5</span>
            </div>
          </div>

          {crit.uncapped != null && (
            <div className="text-xs font-medium text-amber-700">
              AI 점수 {crit.uncapped}점 → 상한 적용 {crit.score}점
            </div>
          )}

          {crit.comment && (
            <p className="text-sm text-ink-600" data-selectable>
              {crit.comment}
            </p>
          )}

          {crit.evidence && crit.evidence.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-black/5">
              <span className="text-xs font-semibold text-ink-400">인용</span>
              {crit.evidence.map((evItem, evIdx) => (
                <div key={evIdx} className="text-xs text-ink-600 bg-sprite-50 p-2 rounded-lg" data-selectable>
                  “{evItem}”
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* 4. Language Features */}
      {evaluation.features && (
        <div className="rounded-xl bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-black/5 pb-3">
            <div>
              <h3 className="text-sm font-bold text-ink-900">언어 지표</h3>
              <p className="text-xs text-ink-400">코드로 자동 측정 · 매번 같은 결과</p>
            </div>
            <span className="text-sm font-bold text-sprite-700">
              평균 {evaluation.features.languageScore.toFixed(1)} / 5
            </span>
          </div>

          <div className="space-y-3">
            {evaluation.features.indicators.map((ind, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-ink-900 w-32 truncate">{ind.nameKo}</span>
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <div
                          key={s}
                          className={`h-2 w-4 rounded-full ${
                            s <= ind.score ? "bg-sky-400" : "bg-sky-100"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="font-bold text-ink-900 w-12 text-right">{ind.value}</span>
                  </div>
                </div>
                {ind.what && (
                  <div className="text-[11px] text-ink-600 pl-1">
                    {ind.what}
                  </div>
                )}
                {ind.tip && (
                  <div className="text-[11px] text-sky-700 pl-1">
                    → {ind.tip}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Adjustments */}
      {evaluation.adjustments && evaluation.adjustments.length > 0 && (
        <div className="text-xs font-medium text-amber-700 space-y-1">
          {evaluation.adjustments.map((adj, i) => (
            <div key={i}>• {adj}</div>
          ))}
        </div>
      )}

      {/* 6. Untranslated notice */}
      {(evaluation.untranslated ?? 0) > 0 && (
        <p className="text-xs text-ink-400">
          피드백 {evaluation.untranslated}개는 번역 품질 검사를 통과하지 못해 영어 원문으로 보여요.
        </p>
      )}

      {/* 7. Overall Feedback */}
      {evaluation.overallFeedback && (
        <div className="rounded-xl bg-white p-6 shadow-sm space-y-2">
          <h3 className="text-sm font-bold text-ink-900">총평</h3>
          <p className="text-sm text-ink-600 whitespace-pre-wrap" data-selectable>
            {evaluation.overallFeedback}
          </p>
        </div>
      )}

      {/* 8. Grammar / Vocabulary Corrections */}
      <div className="rounded-xl bg-white p-6 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink-900">문법 · 어휘 교정</h3>
          <span className="text-xs text-ink-400">
            {evaluation.errors?.length || 0}개 · 클릭하면 설명
          </span>
        </div>
        <CorrectionList
          errors={evaluation.errors || []}
          selected={selected}
          onSelect={onSelect}
        />
      </div>

      {/* 9. Analysis */}
      {showAnalysis !== false && evaluation.analysis && (
        <details className="rounded-xl bg-white p-6 shadow-sm space-y-3 group">
          <summary className="cursor-pointer text-sm font-bold text-ink-900 select-none">
            AI가 읽은 내용 (채점 근거)
          </summary>
          <div className="space-y-3 pt-3 border-t border-black/5 text-sm text-ink-600">
            <div>
              <span className="text-xs font-bold text-ink-400 uppercase tracking-wide block mb-1">
                주장 · 목적
              </span>
              <p data-selectable>{evaluation.analysis.mainPoint}</p>
            </div>

            {evaluation.analysis.supportGiven && evaluation.analysis.supportGiven.length > 0 && (
              <div>
                <span className="text-xs font-bold text-ink-400 uppercase tracking-wide block mb-1">
                  근거 및 세부 내용
                </span>
                <ul className="list-inside list-disc space-y-1 text-xs text-ink-600">
                  {evaluation.analysis.supportGiven.map((sup, sIdx) => (
                    <li key={sIdx} data-selectable>{sup}</li>
                  ))}
                </ul>
              </div>
            )}

            {evaluation.analysis.notAddressed && evaluation.analysis.notAddressed.length > 0 && (
              <div>
                <span className="text-xs font-bold text-ink-400 uppercase tracking-wide block mb-1">
                  부족한 점
                </span>
                <p className="text-xs text-red-600" data-selectable>
                  {evaluation.analysis.notAddressed}
                </p>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}