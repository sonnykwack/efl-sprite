// Student-facing feedback for one LLM evaluation. Used by the result page and the scoring lab.
import type { LanguageError, LlmEvaluation } from "../lib/scoring";

const KIND_KO = { grammar: "문법", sentence: "문장 구조", word_choice: "어휘", register: "격식" } as const;
const KIND_COLOR = {
  grammar: "bg-rose-100 decoration-rose-400",
  sentence: "bg-amber-100 decoration-amber-500",
  word_choice: "bg-sky-100 decoration-sky-400",
  register: "bg-violet-100 decoration-violet-400",
} as const;

export function BandBadge({ band, label = "추정 밴드" }: { band: number; label?: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-sprite-500 px-5 py-3 text-white">
      <div className="text-[11px] opacity-80">{label}</div>
      <div className="text-3xl font-bold leading-none">{band.toFixed(1)}</div>
      <div className="text-[10px] opacity-70">/ 6.0</div>
    </div>
  );
}

/** The student's response with every located correction highlighted in place. */
export function AnnotatedResponse({ text, errors }: { text: string; errors: LanguageError[] }) {
  const spans = errors
    .filter((e) => e.start >= 0 && e.end > e.start)
    .sort((a, b) => a.start - b.start)
    // Highlights must not nest; merge order already avoids most overlaps.
    .filter((e, i, all) => i === 0 || e.start >= all[i - 1].end);
  const parts: JSX.Element[] = [];
  let pos = 0;
  spans.forEach((e, i) => {
    if (e.start > pos) parts.push(<span key={`t${i}`}>{text.slice(pos, e.start)}</span>);
    parts.push(
      <mark
        key={`m${i}`}
        title={`${KIND_KO[e.kind]}: → ${e.correction}`}
        className={`rounded px-0.5 text-inherit underline decoration-2 underline-offset-2 ${KIND_COLOR[e.kind]}`}
      >
        {text.slice(e.start, e.end)}
      </mark>,
    );
    pos = e.end;
  });
  if (pos < text.length) parts.push(<span key="end">{text.slice(pos)}</span>);
  return (
    <p className="whitespace-pre-wrap text-sm leading-7" data-selectable>
      {parts}
    </p>
  );
}

export function CorrectionList({ errors }: { errors: LanguageError[] }) {
  if (errors.length === 0) return <p className="text-sm text-ink-400">교정할 부분을 찾지 못했어요.</p>;
  return (
    <ul className="grid gap-1.5 text-sm" data-selectable>
      {errors.map((e, i) => (
        <li key={i} className={`flex flex-wrap items-baseline gap-x-1.5 ${e.located ? "" : "text-red-600"}`}>
          <span className="rounded bg-sprite-50 px-1.5 text-[10px] text-ink-600">{KIND_KO[e.kind]}</span>
          {e.source === "rule" && (
            <span className="rounded bg-sky-100 px-1.5 text-[10px] text-sky-700" title="규칙 기반 검사">
              규칙
            </span>
          )}
          <span className="text-ink-400 line-through">{e.quote}</span>
          <span className="text-ink-400">→</span>
          <span className="font-semibold text-sprite-700">{e.correction}</span>
          {!e.located && <span className="text-xs">(답안에서 찾을 수 없음)</span>}
        </li>
      ))}
    </ul>
  );
}

export default function FeedbackView({
  evaluation: ev,
  showAnalysis = true,
}: {
  evaluation: LlmEvaluation;
  showAnalysis?: boolean;
}) {
  return (
    <div className="grid gap-5">
      <section className="grid gap-3">
        {ev.criteria.map((c) => (
          <div key={c.key} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-semibold">
                {c.nameKo} <span className="text-xs font-normal text-ink-400">{c.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span key={n} className={`h-2 w-5 rounded-full ${n <= c.score ? "bg-sprite-500" : "bg-sprite-100"}`} />
                  ))}
                </div>
                <span className="w-8 text-right text-sm font-semibold">{c.score}/5</span>
              </div>
            </div>
            <p className="text-sm" data-selectable>
              {c.comment}
            </p>
            {c.evidence.length > 0 && (
              <ul className="mt-2 grid gap-0.5 text-xs text-ink-600" data-selectable>
                {c.evidence.map((q, i) => (
                  <li key={i}>“{q}”</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-2 font-semibold">총평</div>
        <p className="text-sm" data-selectable>
          {ev.overallFeedback}
        </p>
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-2 font-semibold">
          문법 · 어휘 교정 <span className="text-xs font-normal text-ink-400">{ev.errors.length}개</span>
        </div>
        <CorrectionList errors={ev.errors} />
      </section>

      {showAnalysis && ev.analysis && (
        <details className="rounded-xl bg-white p-4 text-sm shadow-sm">
          <summary className="cursor-pointer font-semibold text-ink-600">AI가 읽은 내용 (채점 근거)</summary>
          <div className="mt-2 grid gap-1" data-selectable>
            <div>
              <span className="text-ink-400">주장 · 목적 </span>
              {ev.analysis.mainPoint}
            </div>
            <ul className="ml-4 list-disc text-ink-600">
              {ev.analysis.supportGiven.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
            <div>
              <span className="text-ink-400">부족한 점 </span>
              {ev.analysis.notAddressed}
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
