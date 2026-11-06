// Settings → 문법 모델 테스트: run the GECToR grammar model on any text and inspect each edit
// (tags → category → Korean reason). Used to verify the model on a new machine and to tune
// the precision knobs.
import { useState } from "react";
import { api } from "../lib/api";
import { GUIDE } from "../lib/grammarGuide";
import { displaySpan, mapGecEdit } from "../lib/gecMap";
import type { GecEdit, ModelEntry } from "../lib/types";

// Generic learner errors (not from any evaluation text).
const SAMPLE =
  "Yesterday I go to library and borrow two book. She don't like the movie because it were too long. " +
  "I am interesting in learn English, so I study every day in the morning with my friend.";

export default function GecLab({ gec, runtime }: { gec?: ModelEntry; runtime: boolean }) {
  const [text, setText] = useState(SAMPLE);
  const [keep, setKeep] = useState(0.2);
  const [minErr, setMinErr] = useState(0.4);
  const [edits, setEdits] = useState<GecEdit[] | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!gec) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.gecCheck(gec.id, text, { keepConfidence: keep, minErrorProb: minErr, iterations: 3 });
      setEdits(r.edits);
      setMs(r.ms);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-6 rounded-xl bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold text-ink-600">문법 모델 테스트 (GECToR)</h2>
      {!runtime && <p className="mb-2 text-xs text-red-600">ONNX Runtime이 없어요 — 터미널에서 npm run fetch-engines -- --only=ort</p>}
      {!gec && <p className="mb-2 text-xs text-ink-400">위의 "문법 교정 (GECToR)" 모델을 먼저 다운로드해 주세요.</p>}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="mb-2 h-20 w-full rounded-lg border border-black/10 p-2 text-sm outline-none focus:border-sprite-500"
      />
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-ink-600">
        <label className="flex items-center gap-1" title="높을수록 확실한 오류만 고쳐요 (정밀도↑, 재현율↓)">
          $KEEP 가중치
          <input type="number" step={0.05} min={0} max={1} value={keep} onChange={(e) => setKeep(Number(e.target.value))} className="w-16 rounded border border-black/10 px-1" />
        </label>
        <label className="flex items-center gap-1" title="이 확률보다 낮은 오류는 무시해요">
          최소 오류 확률
          <input type="number" step={0.05} min={0} max={1} value={minErr} onChange={(e) => setMinErr(Number(e.target.value))} className="w-16 rounded border border-black/10 px-1" />
        </label>
        <button
          disabled={!gec || !runtime || busy}
          onClick={run}
          className="ml-auto rounded-lg border border-sprite-500 px-3 py-1.5 text-sm text-sprite-700 disabled:opacity-40"
        >
          {busy ? "검사 중… (처음엔 모델 로딩)" : "문법 검사"}
        </button>
      </div>
      {error && (
        <pre className="mb-2 whitespace-pre-wrap text-xs text-red-600" data-selectable>
          {error}
        </pre>
      )}
      {edits && (
        <div className="grid gap-1 text-sm" data-selectable>
          <div className="text-xs text-ink-400">
            {edits.length}개 교정 · {ms}ms
          </div>
          {edits.map((e, i) => {
            const m = mapGecEdit(e);
            const span = displaySpan(text, e);
            return (
              <div key={i} className="rounded-lg bg-sprite-50 px-2 py-1">
                <span className="mr-1.5 rounded bg-white px-1.5 text-[10px] text-ink-600">{GUIDE[m.category].label}</span>
                <span className="text-rose-600 line-through">{span.quote}</span> → <span className="font-semibold text-sprite-700">{span.correction || "(삭제)"}</span>
                <span className="ml-2 text-xs text-ink-600">{m.why}</span>
                <span className="ml-2 font-mono text-[10px] text-ink-400">{e.labels.join(" ")}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
