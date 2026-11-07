// Listen and Repeat result: per sentence, the target with each word marked as said / wrong /
// missing, what Whisper heard, the 0–5 score and the student's own recording.
import type { WordOp } from "../lib/accuracy";
import type { RepeatEvaluation } from "../lib/repeat";
import { BandBadge } from "./FeedbackView";
import { AudioButton } from "./SpeakingTasks";

function TargetWords({ ops }: { ops: WordOp[] }) {
  return (
    <span className="leading-7">
      {ops.map((o, i) =>
        o.op === "ok" ? (
          <span key={i} className="text-ink-900">
            {o.ref}{" "}
          </span>
        ) : o.op === "sub" ? (
          <span key={i}>
            <span className="rounded bg-rose-50 px-0.5 text-rose-600 line-through">{o.ref}</span>
            <span className="ml-0.5 rounded bg-amber-100 px-0.5 text-[13px] text-amber-800">{o.hyp}</span>{" "}
          </span>
        ) : o.op === "del" ? (
          <span key={i} className="rounded bg-rose-50 px-0.5 text-rose-600 underline decoration-dotted">
            {o.ref}{" "}
          </span>
        ) : (
          <span key={i} className="rounded bg-amber-100 px-0.5 text-[13px] text-amber-800">
            +{o.hyp}{" "}
          </span>
        ),
      )}
    </span>
  );
}

export default function RepeatResultView({ ev }: { ev: RepeatEvaluation }) {
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-sm">
        <BandBadge band={ev.band} />
        <div className="grid gap-1 text-xs text-ink-600">
          <div>
            문장 점수 합계 <span className="font-semibold">{ev.total}/{ev.max}</span> · 단어 정확도{" "}
            <span className="font-semibold">{Math.round(ev.accuracy * 100)}%</span>
          </div>
          <div>음성 인식 {ev.whisperModel} · {(ev.latencyMs / 1000).toFixed(0)}초</div>
          <div className="text-ink-400">AI 추정치이며 ETS 공식 점수가 아니에요. 발음 자체는 평가하지 않아요.</div>
        </div>
      </div>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-ink-400">
          <span><span className="rounded bg-rose-50 px-1 text-rose-600 line-through">단어</span> 틀리게 말함</span>
          <span><span className="rounded bg-amber-100 px-1 text-amber-800">단어</span> 실제로 들린 말</span>
          <span><span className="rounded bg-rose-50 px-1 text-rose-600 underline decoration-dotted">단어</span> 빠뜨림</span>
        </div>
        <ol className="grid gap-3">
          {ev.items.map((it, i) => (
            <li key={i} className="grid gap-1 border-t border-black/5 pt-3 first:border-0 first:pt-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-ink-400">{i + 1}</span>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span key={n} className={`h-1.5 w-4 rounded-full ${n <= it.score ? "bg-sprite-500" : "bg-sprite-100"}`} />
                  ))}
                </div>
                <span className="text-xs font-semibold">{it.score}/5</span>
                <span className="text-xs text-ink-400">{Math.round(it.accuracy * 100)}%</span>
                <span className="ml-auto">
                  <AudioButton path={it.audioPath} />
                </span>
              </div>
              <div className="text-[15px]" data-selectable>
                <TargetWords ops={it.ops} />
              </div>
              <div className="text-xs text-ink-400" data-selectable>
                들린 말: {it.transcript || "(인식된 말 없음)"}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
