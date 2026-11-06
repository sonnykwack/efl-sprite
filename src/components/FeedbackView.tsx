// Student-facing feedback for one LLM evaluation. Used by the result page and the scoring lab.
//
// Corrections are explained on CLICK (not hover): the macOS WKWebView used by Tauri does not
// show native `title` tooltips, and click also works on touch screens.
import { GUIDE, categoryFromKind, wordDiff, type ErrorCategory } from "../lib/grammarGuide";
import type { LanguageError, LlmEvaluation } from "../lib/scoring";

const KIND_COLOR = {
  grammar: "bg-rose-100 decoration-rose-400",
  sentence: "bg-amber-100 decoration-amber-500",
  word_choice: "bg-sky-100 decoration-sky-400",
  register: "bg-violet-100 decoration-violet-400",
} as const;

/** Evaluations saved before the taxonomy existed only carry `kind`. */
const categoryOf = (e: LanguageError): ErrorCategory => e.category ?? categoryFromKind(e.kind);

export interface Selection {
  selected: number | null;
  onSelect: (i: number | null) => void;
}

export function BandBadge({ band, label = "추정 밴드" }: { band: number; label?: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-sprite-500 px-5 py-3 text-white">
      <div className="text-[11px] opacity-80">{label}</div>
      <div className="text-3xl font-bold leading-none">{band.toFixed(1)}</div>
      <div className="text-[10px] opacity-70">/ 6.0</div>
    </div>
  );
}

function Diff({ before, after }: { before: string; after: string }) {
  const style = {
    same: "text-ink-600",
    del: "rounded bg-rose-50 px-0.5 text-rose-600 line-through",
    ins: "rounded bg-sprite-100 px-0.5 font-semibold text-sprite-700",
  } as const;
  const parts = wordDiff(before, after);
  const changed = parts.filter((p) => p.op !== "same").length;
  // Heavy rewrite (most words changed): an interleaved diff is unreadable — show before → after.
  if (changed > Math.max(2, parts.length * 0.5)) {
    return (
      <span className="leading-6">
        <span className={style.del}>{before}</span> <span className="text-ink-400">→</span>{" "}
        <span className={style.ins}>{after}</span>
      </span>
    );
  }
  return (
    <span className="leading-6">
      {parts.map((p, i) => (
        <span key={i}>
          <span className={style[p.op]}>{p.text}</span>{" "}
        </span>
      ))}
    </span>
  );
}

/** Explanation card for one correction. */
export function CorrectionDetail({ e, onClose }: { e: LanguageError; onClose?: () => void }) {
  const info = GUIDE[categoryOf(e)];
  return (
    <div className="rounded-xl border border-sprite-300 bg-white p-4 text-sm shadow-sm" data-selectable>
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded bg-sprite-50 px-1.5 py-0.5 text-xs font-semibold text-sprite-700">{info.label}</span>
        {e.source === "rule" && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] text-sky-700">규칙 검사</span>}
        {e.source === "gec" && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">문법 모델</span>}
        {onClose && (
          <button onClick={onClose} className="ml-auto text-xs text-ink-400 hover:text-ink-900">
            닫기 ✕
          </button>
        )}
      </div>
      <div className="mb-2">
        <Diff before={e.quote} after={e.correction} />
      </div>
      {e.why && <p className="mb-2">{e.why}</p>}
      <p className="text-xs leading-5 text-ink-600">
        <span className="font-semibold">원칙 </span>
        {info.principle}
      </p>
      {info.examples.length > 0 && (
        <p className="mt-1 text-xs text-ink-400">예) {info.examples.join(" · ")}</p>
      )}
    </div>
  );
}

/** The student's response with every located correction highlighted; click to explain. */
export function AnnotatedResponse({
  text,
  errors,
  selected = null,
  onSelect,
}: { text: string; errors: LanguageError[] } & Partial<Selection>) {
  const spans = errors
    .map((e, idx) => ({ e, idx }))
    .filter(({ e }) => e.start >= 0 && e.end > e.start)
    .sort((a, b) => a.e.start - b.e.start)
    .filter((x, i, all) => i === 0 || x.e.start >= all[i - 1].e.end);
  const parts: JSX.Element[] = [];
  let pos = 0;
  spans.forEach(({ e, idx }) => {
    if (e.start > pos) parts.push(<span key={`t${idx}`}>{text.slice(pos, e.start)}</span>);
    parts.push(
      <mark
        key={`m${idx}`}
        role="button"
        onClick={() => onSelect?.(selected === idx ? null : idx)}
        className={`cursor-pointer rounded px-0.5 text-inherit underline decoration-2 underline-offset-2 ${KIND_COLOR[e.kind]} ${
          selected === idx ? "ring-2 ring-sprite-500" : "hover:ring-1 hover:ring-sprite-300"
        }`}
      >
        {text.slice(e.start, e.end)}
      </mark>,
    );
    pos = e.end;
  });
  if (pos < text.length) parts.push(<span key="end">{text.slice(pos)}</span>);
  const sel = selected != null ? errors[selected] : null;
  return (
    <div className="grid gap-3">
      <p className="whitespace-pre-wrap text-sm leading-7" data-selectable>
        {parts}
      </p>
      {sel ? (
        <CorrectionDetail e={sel} onClose={() => onSelect?.(null)} />
      ) : (
        spans.length > 0 && <p className="text-[11px] text-ink-400">밑줄 친 부분을 클릭하면 왜 틀렸는지와 고친 표현이 보여요.</p>
      )}
    </div>
  );
}

export function CorrectionList({ errors, selected = null, onSelect }: { errors: LanguageError[] } & Partial<Selection>) {
  if (errors.length === 0) return <p className="text-sm text-ink-400">교정할 부분을 찾지 못했어요.</p>;
  return (
    <ul className="grid gap-1" data-selectable>
      {errors.map((e, i) => {
        const info = GUIDE[categoryOf(e)];
        const open = selected === i;
        return (
          <li key={i}>
            <button
              onClick={() => onSelect?.(open ? null : i)}
              className={`w-full rounded-lg px-2 py-1.5 text-left text-sm ${open ? "bg-sprite-50" : "hover:bg-sprite-50/60"} ${
                e.located ? "" : "text-red-600"
              }`}
            >
              <span className="mr-1.5 rounded bg-white px-1.5 text-[10px] text-ink-600 ring-1 ring-black/5">{info.label}</span>
              {e.source === "rule" && <span className="mr-1.5 rounded bg-sky-100 px-1.5 text-[10px] text-sky-700">규칙</span>}
              {e.source === "gec" && <span className="mr-1.5 rounded bg-emerald-100 px-1.5 text-[10px] text-emerald-700">문법 모델</span>}
              <Diff before={e.quote} after={e.correction} />
              {!e.located && <span className="text-xs"> (답안에서 찾을 수 없음)</span>}
              {e.why && !open && <span className="mt-0.5 block text-xs text-ink-400">{e.why}</span>}
            </button>
            {open && (
              <div className="mt-1">
                <CorrectionDetail e={e} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const POINT_KO = { covered: "다룸", partial: "부족", missing: "빠짐" } as const;
const POINT_COLOR = { covered: "text-sprite-700", partial: "text-amber-600", missing: "text-red-600" } as const;

export default function FeedbackView({
  evaluation: ev,
  showAnalysis = true,
  selected = null,
  onSelect,
}: {
  evaluation: LlmEvaluation;
  showAnalysis?: boolean;
} & Partial<Selection>) {
  const caps = ev.caps ?? [];
  return (
    <div className="grid gap-5">
      {caps.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          <div className="mb-1 font-semibold">점수 상한 적용</div>
          <ul className="ml-4 list-disc text-ink-600">
            {caps.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      {ev.points && ev.points.length > 0 && (
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-2 font-semibold">요구사항 체크</div>
          <ul className="grid gap-1 text-sm">
            {ev.points.map((p, i) => (
              <li key={i} className="flex gap-2">
                <span className={`w-10 shrink-0 font-semibold ${POINT_COLOR[p.status]}`}>{POINT_KO[p.status]}</span>
                <span data-selectable>
                  {p.pointKo ?? p.point}
                  {p.pointKo && <span className="ml-1.5 text-xs text-ink-400">{p.point}</span>}
                  {p.evidence && <span className="mt-0.5 block text-xs text-ink-600">근거: “{p.evidence}”</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

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
            {c.uncapped != null && (
              <p className="mb-1 text-xs text-amber-600">
                AI 점수 {c.uncapped}점 → 상한 적용 {c.score}점
              </p>
            )}
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

      {(ev.untranslated ?? 0) > 0 && (
        <p className="-mb-2 text-xs text-ink-400">
          피드백 {ev.untranslated}개는 번역 품질 검사를 통과하지 못해 영어 원문으로 보여요.
        </p>
      )}

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-2 font-semibold">총평</div>
        <p className="text-sm" data-selectable>
          {ev.overallFeedback}
        </p>
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-2 font-semibold">
          문법 · 어휘 교정 <span className="text-xs font-normal text-ink-400">{ev.errors.length}개 · 클릭하면 설명</span>
        </div>
        <CorrectionList errors={ev.errors} selected={selected} onSelect={onSelect} />
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
