import { useState } from "react";
import { api } from "../lib/api";
import { mapGecEdit, displaySpan } from "../lib/gecMap";
import { GUIDE } from "../lib/grammarGuide";
import type { ModelEntry, GecEdit } from "../lib/types";

interface GecLabProps {
  gec?: ModelEntry;
  runtime: boolean;
}

const DEFAULT_SAMPLE_TEXT = `Yesterday I go to library and borrow two book. She don't like the movie because it were too long. I am interesting in learn English, so I study every day in the morning with my friend.`;

export default function GecLab({ gec, runtime }: GecLabProps) {
  const [text, setText] = useState<string>(DEFAULT_SAMPLE_TEXT);
  const [keepConfidence, setKeepConfidence] = useState<number>(0.2);
  const [minErrorProb, setMinErrorProb] = useState<number>(0.4);

  const [edits, setEdits] = useState<GecEdit[] | null>(null);
  const [checkedText, setCheckedText] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleRunCheck = async () => {
    if (!gec || !runtime || isChecking) return;
    setIsChecking(true);
    setErrorMessage(null);

    const currentText = text;
    try {
      const result = await api.gecCheck(gec.id, currentText, {
        keepConfidence,
        minErrorProb,
        iterations: 3,
      });
      setEdits(result.edits);
      setCheckedText(currentText);
      setLatencyMs(result.ms);
    } catch (err) {
      setErrorMessage(String(err));
      setEdits(null);
      setCheckedText(null);
      setLatencyMs(null);
    } finally {
      setIsChecking(false);
    }
  };

  const isDisabled = !runtime || !gec || isChecking;
  const isTextChangedAfterCheck = checkedText !== null && checkedText !== text;

  return (
    <section className="rounded-xl bg-white p-6 shadow-sm space-y-4">
      <h2 className="text-sm font-bold text-ink-900">문법 모델 테스트 (GECToR)</h2>

      {/* Notices */}
      {!runtime ? (
        <p className="text-xs font-medium text-red-600">
          ONNX Runtime이 없어요 — 터미널에서 npm run fetch-engines -- --only=ort
        </p>
      ) : !gec ? (
        <p className="text-xs text-ink-400">
          위의 "문법 교정 (GECToR)" 모델을 먼저 다운로드해 주세요.
        </p>
      ) : null}

      {/* Input textarea */}
      <div>
        <textarea
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="검사할 문장을 입력하세요"
          className="w-full rounded-lg border border-black/10 p-3 text-sm focus:border-sprite-500 focus:outline-none"
        />
      </div>

      {/* Settings row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-1">
        <div className="flex flex-wrap items-center gap-6 text-xs text-ink-600">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <label htmlFor="keep-confidence" className="font-semibold cursor-pointer">$KEEP 가중치:</label>
              <input
                id="keep-confidence"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={keepConfidence}
                onChange={(e) => setKeepConfidence(Number(e.target.value))}
                className="w-20 rounded border border-black/10 px-2 py-1 text-xs focus:outline-none"
              />
            </div>
            <p className="text-[11px] text-ink-400">높을수록 확실한 오류만 고쳐요 (정밀도↑, 재현율↓)</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <label htmlFor="min-error-prob" className="font-semibold cursor-pointer">최소 오류 확률:</label>
              <input
                id="min-error-prob"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={minErrorProb}
                onChange={(e) => setMinErrorProb(Number(e.target.value))}
                className="w-20 rounded border border-black/10 px-2 py-1 text-xs focus:outline-none"
              />
            </div>
            <p className="text-[11px] text-ink-400">이 확률보다 낮은 오류는 무시해요</p>
          </div>
        </div>

        <button
          type="button"
          disabled={isDisabled}
          onClick={handleRunCheck}
          className="rounded-lg border border-sprite-500 px-4 py-2 text-sm font-semibold text-sprite-700 hover:bg-sprite-50 transition disabled:opacity-40 shrink-0"
        >
          {isChecking ? "검사 중… (처음엔 모델 로딩)" : "문법 검사"}
        </button>
      </div>

      {errorMessage && (
        <pre className="whitespace-pre-wrap text-xs text-red-600" data-selectable>
          {errorMessage}
        </pre>
      )}

      {/* Results */}
      {edits !== null && checkedText !== null && (
        <div className="space-y-3 pt-3 border-t border-black/5">
          {isTextChangedAfterCheck && (
            <div className="rounded-lg bg-amber-50 p-2.5 text-xs font-medium text-amber-800 border border-amber-200">
              문장이 바뀌었어요. 다시 검사해 주세요.
            </div>
          )}

          <div className="text-xs text-ink-400" data-selectable>
            {edits.length}개 교정 · {latencyMs ?? 0}ms
          </div>

          {edits.length === 0 ? (
            <p className="text-xs text-ink-400">오류를 발견하지 못했어요.</p>
          ) : (
            <div className="space-y-2">
              {edits.map((editItem, idx) => {
                const mapped = mapGecEdit(editItem, checkedText);
                const spanInfo = displaySpan(checkedText, editItem);
                const guideLabel = GUIDE[mapped.category]?.label || mapped.category;

                return (
                  <div key={idx} className="rounded-xl bg-sprite-50 p-3.5 space-y-2 border border-sprite-100" data-selectable>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="rounded bg-white px-2 py-0.5 text-xs font-bold text-sprite-700 border border-black/10">
                        {guideLabel}
                      </span>
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        <span className="line-through text-red-600 bg-red-50 px-1 rounded">{spanInfo.quote}</span>
                        <span className="text-ink-400">→</span>
                        <span className="font-bold text-sprite-700 bg-sprite-50 px-1 rounded">
                          {spanInfo.correction ? spanInfo.correction : "(삭제)"}
                        </span>
                      </div>
                    </div>

                    {mapped.why && <p className="text-xs text-ink-600">{mapped.why}</p>}

                    {editItem.labels && editItem.labels.length > 0 && (
                      <div className="font-mono text-[10px] text-ink-400">
                        {editItem.labels.join(" ")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}