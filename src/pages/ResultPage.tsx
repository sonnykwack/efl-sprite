// 채점 결과: one attempt — the student's response with corrections in place, rubric
// feedback, model answer on demand, and the teacher's own band for the agreement study.
import { useEffect, useState } from "react";
import type { Navigate } from "../App";
import FeedbackView, { AnnotatedResponse, BandBadge } from "../components/FeedbackView";
import PageHeader from "../components/PageHeader";
import RepeatResultView from "../components/RepeatResultView";
import { AudioButton } from "../components/SpeakingTasks";
import { targetSentences } from "../lib/accuracy";
import { isRepeatEvaluation, parseAudioPaths, scoreRepeatAttempt, type RepeatEvaluation } from "../lib/repeat";
import { api, inTauri } from "../lib/api";
import { loadActiveModels } from "../lib/activeModels";
import { fmtDate } from "../lib/format";
import { TASK_SPECS } from "../lib/rubrics";
import { generateSampleAnswer, speakingStats, type LlmEvaluation } from "../lib/scoring";
import { STAGE_KO, scoreAttempt, type ScoringMode, type Stage } from "../lib/submit";
import type { AttemptDetail, AttemptSummary } from "../lib/types";

const BANDS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6];
const btn = "rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:opacity-40";

export default function ResultPage({ attemptId, navigate }: { attemptId?: number; navigate: Navigate }) {
  const [detail, setDetail] = useState<AttemptDetail | null>(null);
  const [recent, setRecent] = useState<AttemptSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const load = () => {
    if (!inTauri()) return;
    if (attemptId == null) {
      api
        .listAttempts(null, 8)
        .then(setRecent)
        .catch((e) => setError(String(e)));
      return;
    }
    api
      .getAttempt(attemptId)
      .then(setDetail)
      .catch((e) => setError(String(e)));
  };
  useEffect(load, [attemptId]);

  if (attemptId == null) {
    return (
      <>
        <PageHeader title="채점 결과" subtitle="최근 응시를 고르면 결과를 볼 수 있어요." />
        <ul className="grid gap-2">
          {recent.length === 0 && <li className="text-sm text-ink-400">아직 응시 기록이 없어요.</li>}
          {recent.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => navigate({ page: "result", attemptId: a.id })}
                className="flex w-full items-center justify-between rounded-xl bg-white p-4 text-left shadow-sm hover:ring-1 hover:ring-sprite-300"
              >
                <span>
                  <span className="font-semibold">{a.taskTitle}</span>
                  <span className="ml-2 text-xs text-ink-400">
                    {a.studentName ?? "이름 없음"} · {fmtDate(a.createdAt)}
                  </span>
                </span>
                <span className="text-sm font-semibold text-sprite-700">{a.band != null ? a.band.toFixed(1) : "미채점"}</span>
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!detail) return <p className="text-sm text-ink-400">불러오는 중…</p>;

  const spec = TASK_SPECS[detail.taskType];
  const row = detail.evaluation;
  let ev: LlmEvaluation | null = null;
  let rep: RepeatEvaluation | null = null;
  try {
    const parsed: unknown = row ? JSON.parse(row.rubricJson) : null;
    if (isRepeatEvaluation(parsed)) rep = parsed;
    else ev = parsed as LlmEvaluation | null;
  } catch {
    ev = null;
  }
  const isRepeat = detail.taskType === "listen_repeat";

  const rescore = async (mode: ScoringMode) => {
    setError(null);
    if (isRepeat) {
      // Re-transcribe the saved recordings (e.g. after installing a better Whisper model).
      try {
        await scoreRepeatAttempt(detail.id, targetSentences(detail.material), parseAudioPaths(detail.audioPath), (d, t) =>
          setBusy(`음성을 글로 옮기는 중… ${Math.min(d + 1, t)} / ${t}`),
        );
        load();
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(null);
      }
      return;
    }
    try {
      await scoreAttempt(
        {
          attemptId: detail.id,
          taskType: detail.taskType,
          prompt: detail.prompt,
          material: detail.material,
          responseText: detail.responseText,
          stats:
            detail.taskType === "interview" && detail.durationSeconds
              ? speakingStats(detail.responseText, detail.durationSeconds)
              : undefined,
        },
        mode,
        (s: Stage) => setBusy(STAGE_KO[s]),
      );
      setSelected(null);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const makeSample = async () => {
    if (!row) return;
    setBusy("모범 답안 작성 중…");
    try {
      const active = await loadActiveModels();
      if (!active.llm) throw new Error("설치된 LLM 모델이 없습니다.");
      const text = await generateSampleAnswer(
        {
          taskType: detail.taskType,
          prompt: detail.prompt,
          material: detail.material,
        },
        active.llm.id,
      );
      await api.setSampleAnswer(row.id, text.trim());
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const setTeacher = async (value: string) => {
    if (!row) return;
    await api.setTeacherScore(row.id, value === "" ? null : Number(value)).catch((e) => setError(String(e)));
    load();
  };

  return (
    <>
      <PageHeader
        title={detail.taskTitle}
        subtitle={`${spec.label} · ${detail.studentName ?? "이름 없음"} · ${fmtDate(detail.createdAt)}`}
        actions={
          <button className={`${btn} border border-black/10 text-ink-600`} onClick={() => navigate({ page: "history" })}>
            ← 기록
          </button>
        }
      />

      {!ev && !rep && (
        <section className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          아직 채점되지 않은 답안이에요.
          <div className="mt-2 flex gap-2">
            <button disabled={!!busy} className={`${btn} bg-sprite-500 text-white`} onClick={() => rescore("quick")}>
              빠른 채점
            </button>
            <button
              disabled={!!busy}
              className={`${btn} border border-sprite-500 text-sprite-700`}
              onClick={() => rescore("precise")}
            >
              정밀 채점
            </button>
          </div>
        </section>
      )}
      {busy && <p className="mb-4 animate-pulse text-sm text-sprite-700">{busy}</p>}

      {isRepeat ? (
        <div className="grid max-w-3xl gap-4">
          {rep && <RepeatResultView ev={rep} />}
          <div className="flex items-center gap-2 text-xs">
            <button disabled={!!busy} className={`${btn} border border-black/10 text-ink-600`} onClick={() => rescore("quick")}>
              {rep ? "음성 다시 인식하기" : "채점하기"}
            </button>
            {row && (
              <label className="ml-auto flex items-center gap-2 text-ink-600">
                교사 채점
                <select
                  value={row.teacherScore ?? ""}
                  onChange={(e) => setTeacher(e.target.value)}
                  className="rounded border border-black/10 px-2 py-1 text-sm"
                >
                  <option value="">—</option>
                  {BANDS.map((b) => (
                    <option key={b} value={b}>
                      {b.toFixed(1)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="grid content-start gap-4">
            <section className="rounded-xl bg-white p-5 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-600">
                  {detail.taskType === "interview" ? "말한 내용 (음성 인식)" : "학생 답안"}
                  {detail.taskType === "interview" && <AudioButton path={detail.audioPath} />}
                </h2>
                <span className="text-xs text-ink-400">
                  {detail.responseText.trim().split(/\s+/).length} 단어
                  {detail.durationSeconds != null && ` · ${Math.round(detail.durationSeconds / 60)}분 소요`}
                </span>
              </div>
              {ev ? (
                <AnnotatedResponse text={detail.responseText} errors={ev.errors} selected={selected} onSelect={setSelected} />
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-7" data-selectable>
                  {detail.responseText}
                </p>
              )}
            </section>

            <details className="rounded-xl bg-white p-5 text-sm shadow-sm">
              <summary className="cursor-pointer font-semibold text-ink-600">문제 다시 보기</summary>
              <p className="mt-2 whitespace-pre-wrap" data-selectable>
                {detail.prompt}
              </p>
              {detail.material && (
                <p className="mt-2 whitespace-pre-wrap rounded bg-sprite-50 p-2 text-ink-600" data-selectable>
                  {detail.material}
                </p>
              )}
            </details>

            {row && (
              <section className="rounded-xl bg-white p-5 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-ink-600">모범 답안</h2>
                  <button disabled={!!busy} className={`${btn} border border-sprite-500 text-sprite-700`} onClick={makeSample}>
                    {row.sampleAnswer ? "다시 만들기" : "모범 답안 만들기"}
                  </button>
                </div>
                {row.sampleAnswer ? (
                  <p className="whitespace-pre-wrap text-sm leading-7" data-selectable>
                    {row.sampleAnswer}
                  </p>
                ) : (
                  <p className="text-xs text-ink-400">같은 문제에 대한 고득점 예시 답안을 AI가 작성해요 (약 20–40초).</p>
                )}
              </section>
            )}
          </div>

          {ev && row && (
            <div className="grid content-start gap-4">
              <div className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-sm">
                <BandBadge band={ev.band} />
                <div className="grid gap-1 text-xs text-ink-600">
                  <div>
                    루브릭 합계{" "}
                    <span className="font-semibold">
                      {ev.total}/{ev.max}
                    </span>
                  </div>
                  <div>
                    {ev.samples > 1 ? `${ev.samples}회 채점 중앙값` : "1회 채점"} · {((row.latencyMs ?? 0) / 1000).toFixed(0)}초
                  </div>
                  <div className="text-ink-400">AI 추정치이며 ETS 공식 점수가 아니에요.</div>
                </div>
                <label className="ml-auto grid gap-1 text-right text-xs text-ink-600">
                  교사 채점
                  <select
                    value={row.teacherScore ?? ""}
                    onChange={(e) => setTeacher(e.target.value)}
                    className="rounded border border-black/10 px-2 py-1 text-sm"
                  >
                    <option value="">—</option>
                    {BANDS.map((b) => (
                      <option key={b} value={b}>
                        {b.toFixed(1)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <FeedbackView evaluation={ev} selected={selected} onSelect={setSelected} />
              <div className="flex gap-2 text-xs">
                <button
                  disabled={!!busy}
                  className={`${btn} border border-black/10 text-ink-600`}
                  onClick={() => rescore("quick")}
                >
                  빠른 채점으로 다시
                </button>
                <button
                  disabled={!!busy}
                  className={`${btn} border border-black/10 text-ink-600`}
                  onClick={() => rescore("precise")}
                >
                  정밀 채점으로 다시
                </button>
                <span className="self-center text-ink-400">프롬프트 {ev.version}</span>
              </div>
            </div>
          )}
        </div>
      )}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </>
  );
}
