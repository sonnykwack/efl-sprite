import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import { api, inTauri } from "../lib/api";
import type { AppInfo, DownloadProgress, ModelEntry } from "../lib/types";

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(0);

export default function SettingsPage() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [progress, setProgress] = useState<Record<string, DownloadProgress>>({});
  const [log, setLog] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    api.appInfo().then(setInfo).catch((e) => setLog(String(e)));
    api.listModels().then(setModels).catch((e) => setLog(String(e)));
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

  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(true);
    setLog(`${label} 실행 중…`);
    const t0 = performance.now();
    try {
      const out = await fn();
      setLog(`${label} (${((performance.now() - t0) / 1000).toFixed(1)}s)\n\n${out}`);
    } catch (e) {
      setLog(`${label} 실패\n\n${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const firstInstalled = (kind: ModelEntry["kind"]) =>
    models.find((m) => m.kind === kind && m.installed);

  const testWhisper = () => {
    const m = firstInstalled("whisper");
    if (!m) return setLog("설치된 Whisper 모델이 없습니다.");
    run(`Whisper 테스트 (${m.name})`, () => api.transcribe("__sample__", m.id));
  };

  const testLlm = () => {
    const m = firstInstalled("llm");
    if (!m) return setLog("설치된 LLM 모델이 없습니다.");
    run(`LLM 테스트 (${m.name})`, async () => {
      await api.llmStart(m.id);
      return api.llmChat([
        { role: "system", content: "You are a concise English tutor." },
        { role: "user", content: "In one sentence, encourage a student before a TOEFL speaking test." },
      ]);
    });
  };

  if (!inTauri()) {
    return (
      <>
        <PageHeader title="설정 · 모델" />
        <p className="text-sm text-ink-600">앱(npm run tauri dev)에서 실행해야 모델을 관리할 수 있습니다.</p>
      </>
    );
  }

  return (
    <>
      <PageHeader title="설정 · 모델" subtitle="온디바이스 AI 엔진과 모델을 관리합니다." />

      {info && (
        <section className="mb-6 grid grid-cols-2 gap-x-6 gap-y-1 rounded-xl bg-white p-5 text-sm shadow-sm">
          <div className="text-ink-400">버전</div>
          <div>{info.version}</div>
          <div className="text-ink-400">플랫폼</div>
          <div>
            {info.platform} / {info.arch}
          </div>
          <div className="text-ink-400">Whisper 엔진</div>
          <div>{info.engines.whisper ? "✅ 설치됨" : "❌ 없음 — npm run fetch-engines"}</div>
          <div className="text-ink-400">LLM 엔진 (llama-server)</div>
          <div>{info.engines.llama ? "✅ 설치됨" : "❌ 없음 — npm run fetch-engines"}</div>
          <div className="text-ink-400">모델 폴더</div>
          <div className="truncate" data-selectable title={info.modelsDir}>
            {info.modelsDir}
          </div>
        </section>
      )}

      {(["whisper", "llm"] as const).map((kind) => (
        <section key={kind} className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-ink-600">
            {kind === "whisper" ? "음성 인식 (Whisper)" : "채점 · 생성 (LLM)"}
          </h2>
          <ul className="grid gap-2">
            {models
              .filter((m) => m.kind === kind)
              .map((m) => {
                const p = progress[m.id];
                const downloading = p && !p.done;
                return (
                  <li key={m.id} className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-sm">
                    <div className="flex-1">
                      <div className="font-semibold">
                        {m.name}
                        {m.recommended && (
                          <span className="ml-2 rounded bg-sprite-100 px-1.5 py-0.5 text-[11px] text-sprite-700">
                            추천
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-ink-400">
                        약 {m.sizeMb.toLocaleString()} MB · VRAM {m.minVramGb} GB 이상 권장 · {m.notes}
                      </div>
                      {downloading && (
                        <div className="mt-2 h-1.5 overflow-hidden rounded bg-sprite-100">
                          <div
                            className="h-full bg-sprite-500 transition-all"
                            style={{ width: p.total ? `${(p.downloaded / p.total) * 100}%` : "30%" }}
                          />
                        </div>
                      )}
                      {p?.error && <div className="mt-1 text-xs text-red-600">{p.error}</div>}
                    </div>
                    {downloading ? (
                      <span className="text-xs text-ink-600">
                        {mb(p.downloaded)}
                        {p.total ? ` / ${mb(p.total)}` : ""} MB
                      </span>
                    ) : m.installed ? (
                      <button
                        onClick={() => api.deleteModel(m.id).then(refresh)}
                        className="text-xs text-ink-400 hover:text-red-600"
                      >
                        삭제
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          // Show the progress bar right away so the button can't be clicked twice.
                          setProgress((prev) => ({
                            ...prev,
                            [m.id]: { id: m.id, downloaded: 0, total: null, done: false, error: null },
                          }));
                          api.downloadModel(m.id).catch((e) => setLog(String(e)));
                        }}
                        className="rounded-lg bg-sprite-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sprite-600"
                      >
                        다운로드
                      </button>
                    )}
                  </li>
                );
              })}
          </ul>
        </section>
      ))}

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-ink-600">엔진 연결 테스트</h2>
        <div className="mb-3 flex gap-2">
          <button
            disabled={busy}
            onClick={testWhisper}
            className="rounded-lg border border-sprite-500 px-3 py-1.5 text-sm text-sprite-700 disabled:opacity-40"
          >
            Whisper 샘플 전사
          </button>
          <button
            disabled={busy}
            onClick={testLlm}
            className="rounded-lg border border-sprite-500 px-3 py-1.5 text-sm text-sprite-700 disabled:opacity-40"
          >
            LLM 한 문장 생성
          </button>
        </div>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-sprite-50 p-3 text-xs" data-selectable>
          {log || "—"}
        </pre>
      </section>
    </>
  );
}
