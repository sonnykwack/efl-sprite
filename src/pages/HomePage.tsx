// 시작하기: first-run checklist. Every step shows its live state, so the same page works for
// a new student, a teacher setting up a classroom PC, and a Store reviewer.
import { useEffect, useState } from "react";
import type { Navigate } from "../App";
import PageHeader from "../components/PageHeader";
import { api, inTauri } from "../lib/api";
import { addSampleTasks } from "../lib/sampleTasks";
import type { AppInfo, DownloadProgress, ModelEntry, ModelKind } from "../lib/types";

const btn = "rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:opacity-40";

const KIND_KO: Record<ModelKind, string> = {
  llm: "채점 AI (LLM)",
  whisper: "음성 인식 (Whisper)",
  gec: "문법 교정 모델 (선택)",
};

function Step({
  n,
  done,
  title,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex gap-4 rounded-xl bg-white p-5 shadow-sm">
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${
          done ? "bg-sprite-500 text-white" : "bg-sprite-50 text-sprite-700"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <div className="grid flex-1 gap-2">
        <div className={`font-semibold ${done ? "text-ink-400" : ""}`}>{title}</div>
        {children}
      </div>
    </li>
  );
}

export default function HomePage({ navigate }: { navigate: Navigate }) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [taskCount, setTaskCount] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [progress, setProgress] = useState<Record<string, DownloadProgress>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    api.appInfo().then(setInfo).catch((e) => setMsg(String(e)));
    api.listModels().then(setModels).catch((e) => setMsg(String(e)));
    api.listTasks().then((t) => setTaskCount(t.length)).catch(() => undefined);
    api.listAttempts(null, 1).then((a) => setAttemptCount(a.length)).catch(() => undefined);
  };

  useEffect(() => {
    if (!inTauri()) return;
    refresh();
    const un = api.onDownloadProgress((p) => {
      setProgress((prev) => ({ ...prev, [p.id]: p }));
      if (p.done) refresh();
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  if (!inTauri()) {
    return (
      <>
        <PageHeader title="시작하기" />
        <p className="text-sm text-ink-600">앱(npm run tauri dev)에서 실행해 주세요.</p>
      </>
    );
  }

  const engineOk = !!info && info.engines.llama && info.engines.whisper;
  const recommended = (kind: ModelKind) => models.find((m) => m.kind === kind && m.recommended) ?? models.find((m) => m.kind === kind);
  const installed = (kind: ModelKind) => models.some((m) => m.kind === kind && m.installed);
  const needed = (["llm", "whisper", "gec"] as const).filter((k) => !installed(k)).map(recommended).filter(Boolean) as ModelEntry[];
  const neededMb = needed.reduce((s, m) => s + m.sizeMb, 0);
  const modelsOk = installed("llm") && installed("whisper");

  const downloadAll = async () => {
    setMsg(null);
    // One after another: parallel downloads of several GB only compete for bandwidth.
    for (const m of needed) {
      try {
        await api.downloadModel(m.id);
      } catch (e) {
        setMsg(`${m.name} 다운로드 실패: ${String(e)} — 설정 · 모델에서 다시 시도할 수 있어요.`);
        break;
      }
    }
    refresh();
  };

  const addSamples = async () => {
    setBusy(true);
    try {
      const n = await addSampleTasks();
      setMsg(n ? `예시 문제 ${n}개를 추가했어요.` : "예시 문제가 이미 모두 있어요.");
      refresh();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  };

  const downloading = Object.values(progress).some((p) => !p.done);

  return (
    <>
      <PageHeader
        title="시작하기"
        subtitle="EFL Sprite는 영어 말하기·쓰기 답안을 이 컴퓨터 안에서 AI로 채점해요. 녹음과 답안은 외부로 전송되지 않아요."
      />
      <ol className="grid max-w-3xl gap-3">
        <Step n={1} done={engineOk} title="AI 엔진 확인">
          {!info ? (
            <p className="text-sm text-ink-400">확인 중…</p>
          ) : engineOk ? (
            <p className="text-sm text-ink-400">음성 인식과 채점 엔진이 준비되어 있어요.</p>
          ) : (
            <p className="text-sm text-red-600">
              {import.meta.env.DEV
                ? "엔진이 없어요 — 터미널에서 npm run fetch-engines를 실행하세요."
                : "엔진 파일이 없어요. 앱을 삭제한 뒤 다시 설치해 주세요."}
            </p>
          )}
        </Step>

        <Step n={2} done={modelsOk} title="AI 모델 받기 (처음 한 번)">
          <ul className="grid gap-1 text-sm">
            {(["llm", "whisper", "gec"] as const).map((k) => {
              const m = recommended(k);
              const p = m ? progress[m.id] : undefined;
              return (
                <li key={k} className="flex items-center gap-2">
                  <span className={installed(k) ? "text-sprite-700" : "text-ink-400"}>{installed(k) ? "✓" : "○"}</span>
                  <span>{KIND_KO[k]}</span>
                  {m && !installed(k) && <span className="text-xs text-ink-400">{m.name} · 약 {m.sizeMb.toLocaleString()} MB</span>}
                  {p && !p.done && (
                    <span className="ml-auto text-xs text-sprite-700">
                      {p.total ? `${Math.round((p.downloaded / p.total) * 100)}%` : `${Math.round(p.downloaded / 1048576)} MB`}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {needed.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button className={`${btn} bg-sprite-500 text-white`} disabled={downloading} onClick={downloadAll}>
                {downloading ? "받는 중…" : `추천 모델 한 번에 받기 (약 ${(neededMb / 1024).toFixed(1)} GB)`}
              </button>
              <button className={`${btn} border border-black/10 text-ink-600`} onClick={() => navigate({ page: "settings" })}>
                직접 고르기
              </button>
              <span className="text-xs text-ink-400">메모리 16 GB 이상 권장 · 적으면 설정에서 작은 모델(3B)을 고르세요.</span>
            </div>
          )}
        </Step>

        <Step n={3} done={taskCount > 0} title="문제 준비">
          <p className="text-sm text-ink-600">
            선생님이 직접 문제를 만들 수도 있고, 유형별 예시 문제 4개(듣고 따라 말하기 · 인터뷰 · 이메일 · 토론 글)로 바로 시작할 수도 있어요.
          </p>
          <div className="flex gap-2">
            <button className={`${btn} bg-sprite-500 text-white`} disabled={busy} onClick={addSamples}>
              예시 문제 추가
            </button>
            <button className={`${btn} border border-black/10 text-ink-600`} onClick={() => navigate({ page: "tasks" })}>
              문제 직접 만들기
            </button>
          </div>
        </Step>

        <Step n={4} done={attemptCount > 0} title="첫 응시">
          <p className="text-sm text-ink-600">
            문제를 고르고 답안을 쓰거나 말하면 AI가 채점하고, 틀린 부분을 클릭하면 이유를 보여줘요. 채점은 PC 성능에 따라 30초–2분 걸려요.
          </p>
          <div>
            <button
              className={`${btn} bg-sprite-500 text-white`}
              disabled={!modelsOk || taskCount === 0}
              onClick={() => navigate({ page: "attempt" })}
            >
              응시하러 가기 →
            </button>
          </div>
        </Step>
      </ol>
      {msg && <p className="mt-4 max-w-3xl text-sm text-ink-600">{msg}</p>}
      <p className="mt-6 max-w-3xl text-xs text-ink-400">
        TOEFL 스타일 연습용 앱이며 ETS와 관련이 없어요. 점수는 AI 추정치이고 공식 점수가 아니에요.
      </p>
    </>
  );
}
