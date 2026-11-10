import { BandBadge } from "./FeedbackView";
import { AudioButton } from "./SpeakingTasks";
import type { RepeatEvaluation } from "../lib/repeat";
import type { WordOp } from "../lib/accuracy";

interface RepeatResultViewProps {
  ev: RepeatEvaluation;
}

export default function RepeatResultView({ ev }: RepeatResultViewProps) {
  const isZeroTotal = ev.total === 0;
  const accuracyPercent = Math.round(ev.accuracy * 100);
  const latencySeconds = Math.round(ev.latencyMs / 1000);

  return (
    <div className="space-y-6">
      {/* ① Summary Card */}
      <section className="flex flex-col gap-4 rounded-xl bg-white p-6 shadow-sm sm:flex-row sm:items-center">
        <div className="shrink-0">
          <BandBadge band={ev.band} />
        </div>

        <div className="flex-1 space-y-1.5 text-sm">
          <div>
            문장 점수 합계 <span className="font-bold">{ev.total}</span> / <span className="font-bold">{ev.max}</span> · 단어 정확도 <span className="font-bold">{accuracyPercent}%</span>
          </div>
          <div className="text-xs text-ink-600">
            음성 인식 {ev.whisperModel} · {latencySeconds}초
          </div>
          {isZeroTotal && (
            <div className="text-xs text-amber-700 font-medium">
              인식된 말이 없어요. 밴드는 1.0이 가장 낮은 값이라 0점이어도 1.0으로 표시돼요.
            </div>
          )}
          <p className="text-[11px] text-ink-400">
            AI 추정치이며 ETS 공식 점수가 아니에요. 발음 자체는 평가하지 않아요.
          </p>
        </div>
      </section>

      {/* ② Sentence List Card */}
      <section className="rounded-xl bg-white p-6 shadow-sm space-y-4">
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-ink-600 border-b border-black/5 pb-3">
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-red-100 px-1 py-0.5 text-red-700 line-through">단어</span>
            <span>틀리게 말함</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-amber-100 px-1 py-0.5 text-amber-900">단어</span>
            <span>실제로 들린 말</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-red-100 px-1 py-0.5 text-red-700 underline decoration-dotted">단어</span>
            <span>빠뜨림</span>
          </div>
        </div>

        {/* Sentences */}
        <div className="divide-y divide-black/5">
          {ev.items.map((item, idx) => {
            const itemPercent = Math.round(item.accuracy * 100);

            return (
              <div key={idx} className="py-4 first:pt-0 last:pb-0 space-y-2">
                {/* Upper line */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-ink-400">{idx + 1}</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((starIdx) => (
                        <div
                          key={starIdx}
                          className={`h-2 w-4 rounded-full ${
                            starIdx <= item.score ? "bg-sprite-500" : "bg-sprite-100"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-xs font-bold text-ink-900">{item.score}/5</span>
                    <span className="text-xs text-ink-400">{itemPercent}%</span>
                  </div>

                  <AudioButton path={item.audioPath} />
                </div>

                {/* Middle line: Word comparison with explicit spaces for data-selectable */}
                <div className="text-base font-medium leading-relaxed text-ink-950" data-selectable>
                  {item.ops.map((opItem: WordOp, opIdx: number) => {
                    let element = null;
                    switch (opItem.op) {
                      case "ok":
                        element = <span key={opIdx}>{opItem.ref}</span>;
                        break;
                      case "sub":
                        element = (
                          <span key={opIdx} className="inline-flex items-center gap-1 mx-0.5">
                            <span className="text-red-600 line-through">{opItem.ref}</span>
                            <span className="rounded bg-amber-100 px-1 py-0.5 text-amber-900 text-sm">{opItem.hyp}</span>
                          </span>
                        );
                        break;
                      case "del":
                        element = (
                          <span key={opIdx} className="text-red-600 underline decoration-dotted underline-offset-4">
                            {opItem.ref}
                          </span>
                        );
                        break;
                      case "ins":
                        element = (
                          <span key={opIdx} className="rounded bg-amber-100 px-1 py-0.5 text-amber-900 text-sm mx-0.5">
                            +{opItem.hyp}
                          </span>
                        );
                        break;
                    }
                    return (
                      <span key={opIdx}>
                        {element}
                        {" "}
                      </span>
                    );
                  })}
                </div>

                {/* Bottom line */}
                <div className="text-xs text-ink-400" data-selectable>
                  들린 말: {item.transcript ? item.transcript : "(인식된 말 없음)"}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}