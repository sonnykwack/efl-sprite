// Settings → 채점 실험실. Measures what the report needs:
//  - consistency: same response scored N times → per-criterion mean / SD
//  - grounding:   share of evidence quotes that really occur in the response
//  - latency
//  - Listen and Repeat accuracy on the bundled JFK sample
import { useState } from "react";
import { api } from "../lib/api";
import FeedbackView, { AnnotatedResponse } from "./FeedbackView";
import { scoreRepeat, type RepeatResult } from "../lib/accuracy";
import { TASK_SPECS } from "../lib/rubrics";
import {
  combineSamples,
  evaluateOnce,
  translateToKorean,
  type FeedbackLang,
  type LlmEvaluation,
  type PromptVersion,
  type ScorableTask,
} from "../lib/scoring";
import type { ModelEntry } from "../lib/types";

const SAMPLE_TASK: ScorableTask = {
  taskType: "academic_discussion",
  prompt:
    "Many universities now offer courses entirely online. Do you think online courses are as effective as traditional classroom courses? Why or why not?",
  material:
    "Kelly: I think online courses can be just as effective. Students can watch lectures again whenever they want, so they understand difficult concepts better.\n" +
    "Paul: I disagree. In a classroom, students can ask questions immediately and learn from discussions with classmates. Online, it is easy to get distracted.",
};

// Deliberately intermediate (≈ band 3.5–4): clear position and a personal example,
// but agreement/article errors and some overlap with Paul's post.
const SAMPLE_RESPONSE =
  "I agree with Paul that online course is not effective as classroom course. Because in classroom, the professor can check if students is understanding and change the way of teaching. " +
  "For example, when I took a statistics class last semester, my professor noticed that many of us was confused about the probability, so she explained it again with more easy examples. " +
  "This kind of thing is very hard in online class because professor cannot see students face. Also, I think students need some pressure to study hard. " +
  "If you are at home, you can easily watch YouTube instead of lecture. However, online courses can be good for working people who don't have time. " +
  "But for university students, I believe classroom is better choice.";

const JFK_TARGET =
  "And so, my fellow Americans, ask not what your country can do for you; ask what you can do for your country.";

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

export default function ScoringLab({ llms, whisperId }: { llms: ModelEntry[]; whisperId?: string }) {
  const [runs, setRuns] = useState<LlmEvaluation[]>([]);
  const [final, setFinal] = useState<LlmEvaluation | null>(null);
  const [lang, setLang] = useState<FeedbackLang>("ko");
  const [versionPick, setVersionPick] = useState<PromptVersion | "auto">("auto");
  const [pickedLlm, setPickedLlm] = useState<string>("");
  const [wallMs, setWallMs] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const llm =
    llms.find((m) => m.id === pickedLlm) ?? llms.find((m) => m.recommended) ?? llms[0];
  const llmId = llm?.id;
  // "auto" = the prompt version measured to work best with the chosen model (catalog).
  const version: PromptVersion =
    versionPick === "auto" ? ((llm?.prompt as PromptVersion | undefined) ?? "v3") : versionPick;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repeat, setRepeat] = useState<RepeatResult | null>(null);
  const criteria = TASK_SPECS.academic_discussion.criteria;

  const runConsistency = async (n: number) => {
    if (!llmId) return setError("설치된 LLM 모델이 없습니다.");
    setRuns([]);
    setSelected(null);
    setFinal(null);
    setWallMs(null);
    setError(null);
    try {
      setBusy("모델 준비 중…");
      await api.llmStart(llmId);
      // Same as production: all samples sent at once → llama-server parallel slots.
      setBusy(`채점 ${n}회 동시 실행 중…`);
      const wall0 = performance.now();
      const out = await Promise.all(
        Array.from({ length: n }, () => evaluateOnce(SAMPLE_TASK, SAMPLE_RESPONSE, { modelId: llmId, lang, version })),
      );
      setRuns(out);
      // What the app will actually show: median of the samples (+ Korean translation in v2).
      let combined = combineSamples(out);
      if (version !== "v1" && lang === "ko") {
        setBusy("한국어 번역 중…");
        const t0 = performance.now();
        combined = await translateToKorean(combined);
        combined = { ...combined, latencyMs: combined.latencyMs + Math.round(performance.now() - t0) };
      }
      setWallMs(Math.round(performance.now() - wall0));
      setFinal(combined);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const runRepeat = async () => {
    if (!whisperId) return setError("설치된 Whisper 모델이 없습니다.");
    setError(null);
    setBusy("전사 중…");
    try {
      const transcript = await api.transcribe("__sample__", whisperId);
      setRepeat(scoreRepeat(JFK_TARGET, transcript));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const btn =
    "rounded-lg border border-sprite-500 px-3 py-1.5 text-sm text-sprite-700 hover:bg-sprite-50 disabled:opacity-40";
  const shown = final ?? runs[0];

  return (
    <section className="mb-6 rounded-xl bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold text-ink-600">채점 실험실</h2>
      <p className="mb-4 text-xs text-ink-400">
        같은 답안을 여러 번 채점해 점수 흔들림(표준편차), 근거 인용의 실제 존재 비율, 소요 시간을 측정합니다.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button disabled={!!busy} onClick={() => runConsistency(3)} className={btn}>
          Academic Discussion 샘플 3회 채점
        </button>
        <button disabled={!!busy} onClick={runRepeat} className={btn}>
          Listen &amp; Repeat 정확도 (JFK 샘플)
        </button>
        <label className="ml-auto flex items-center gap-2 text-xs text-ink-600">
          모델
          <select
            value={llmId ?? ""}
            onChange={(e) => setPickedLlm(e.target.value)}
            className="rounded border border-black/10 px-2 py-1"
          >
            {llms.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-600">
          프롬프트
          <select
            value={versionPick}
            onChange={(e) => setVersionPick(e.target.value as PromptVersion | "auto")}
            className="rounded border border-black/10 px-2 py-1"
          >
            <option value="auto">자동 (모델 권장: {llm?.prompt ?? "v3"})</option>
            <option value="v4">v4 (보정 + 문법 설명)</option>
            <option value="v3">v3 (분석 후 채점)</option>
            <option value="v2">v2</option>
            <option value="v1">v1 (초기)</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-600">
          피드백 언어
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as FeedbackLang)}
            className="rounded border border-black/10 px-2 py-1"
          >
            <option value="ko">한국어</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>
      {busy && <p className="mb-2 text-xs text-sprite-700">{busy}</p>}
      {error && (
        <pre className="mb-2 whitespace-pre-wrap text-xs text-red-600" data-selectable>
          {error}
        </pre>
      )}

      {runs.length > 0 && (
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-right text-xs" data-selectable>
            <thead className="text-ink-400">
              <tr>
                <th className="py-1 text-left">회차</th>
                {criteria.map((c) => (
                  <th key={c.key}>{c.nameKo}</th>
                ))}
                <th>합계</th>
                <th>밴드</th>
                <th>교정 수</th>
                <th title="모델 인용이 답안과 정확히 일치한 비율 → 원문 보정 후 비율">근거 실재율 (원문→보정)</th>
                <th>시간</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r, i) => (
                <tr key={i} className="border-t border-black/5">
                  <td className="py-1 text-left">#{i + 1}</td>
                  {r.criteria.map((c) => (
                    <td key={c.key}>{c.score}</td>
                  ))}
                  <td>
                    {r.total}/{r.max}
                  </td>
                  <td>{r.band.toFixed(1)}</td>
                  <td>{r.errors.length}</td>
                  <td>
                    {Math.round(mean(r.criteria.map((c) => c.grounded)) * 100)}% →{" "}
                    {Math.round(mean(r.criteria.map((c) => c.groundedAfterSnap)) * 100)}%
                  </td>
                  <td>{(r.latencyMs / 1000).toFixed(1)}s</td>
                </tr>
              ))}
              {runs.length > 1 && (
                <tr className="border-t border-black/20 font-semibold">
                  <td className="py-1 text-left">평균 ± SD</td>
                  {criteria.map((c, k) => {
                    const xs = runs.map((r) => r.criteria[k].score);
                    return (
                      <td key={c.key}>
                        {mean(xs).toFixed(2)} ± {sd(xs).toFixed(2)}
                      </td>
                    );
                  })}
                  <td>
                    {mean(runs.map((r) => r.total)).toFixed(2)} ± {sd(runs.map((r) => r.total)).toFixed(2)}
                  </td>
                  <td>{mean(runs.map((r) => r.band)).toFixed(2)}</td>
                  <td>{mean(runs.map((r) => r.errors.length)).toFixed(1)}</td>
                  <td>
                    {Math.round(mean(runs.flatMap((r) => r.criteria.map((c) => c.grounded))) * 100)}% →{" "}
                    {Math.round(mean(runs.flatMap((r) => r.criteria.map((c) => c.groundedAfterSnap))) * 100)}%
                  </td>
                  <td>{wallMs != null ? `${(wallMs / 1000).toFixed(1)}s (병렬)` : "—"}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {shown && (
        <details className="mb-4 rounded-lg bg-sprite-50 p-3 text-xs" open>
          <summary className="cursor-pointer font-semibold text-ink-600">
            {final
              ? `최종 결과 (${version} · 중앙값 ${final.samples}회 · 밴드 ${final.band.toFixed(1)} · 번역 포함 총 ${((wallMs ?? final.latencyMs) / 1000).toFixed(1)}s)`
              : "1회차 상세 피드백"}
          </summary>
          <div className="mt-3 grid gap-4">
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <AnnotatedResponse text={SAMPLE_RESPONSE} errors={shown.errors} selected={selected} onSelect={setSelected} />
            </div>
            <FeedbackView evaluation={shown} selected={selected} onSelect={setSelected} />
          </div>
        </details>
      )}

      {repeat && (
        <div className="rounded-lg bg-sprite-50 p-3 text-xs" data-selectable>
          <div className="mb-1 font-semibold">정확도 {Math.round(repeat.accuracy * 100)}%</div>
          <div className="mb-2 leading-6">
            {repeat.ops.map((o, i) =>
              o.op === "ok" ? (
                <span key={i}>{o.ref} </span>
              ) : o.op === "sub" ? (
                <span key={i} className="rounded bg-amber-200 px-0.5" title={`said “${o.hyp}”`}>
                  {o.ref}→{o.hyp}{" "}
                </span>
              ) : o.op === "del" ? (
                <span key={i} className="rounded bg-red-200 px-0.5 line-through" title="missing">
                  {o.ref}{" "}
                </span>
              ) : (
                <span key={i} className="rounded bg-sky-200 px-0.5" title="extra word">
                  +{o.hyp}{" "}
                </span>
              ),
            )}
          </div>
          <div className="text-ink-400">전사: {repeat.transcript}</div>
        </div>
      )}
    </section>
  );
}
