// Speaking attempts: Listen and Repeat (sentence by sentence) and Take an Interview.
//
// Flow per recording: the OS voice reads the sentence/question (speech.ts) → the microphone
// records (recorder.ts, 16 kHz WAV) → the file is saved in the app's audio folder (Rust
// save_audio). Transcription and scoring happen after the last recording, on the attempt page.
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { fmtClock } from "../lib/format";
import { MicRecorder, micErrorKo, type Recording } from "../lib/recorder";
import { TASK_SPECS } from "../lib/rubrics";
import { speak, stopSpeaking, ttsAvailable } from "../lib/speech";
import type { Task } from "../lib/types";

const btn = "rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-40";
const primary = `${btn} bg-sprite-500 text-white hover:bg-sprite-600`;
const ghost = `${btn} border border-black/10 text-ink-600 hover:bg-sprite-50`;

export interface SpeakingResult {
  /** One path per sentence (listen_repeat) or one path (interview); null = not recorded. */
  audioPaths: (string | null)[];
  /** Seconds of kept audio in total. */
  seconds: number;
}

function LevelMeter({ level }: { level: number }) {
  const pct = Math.min(100, Math.round(Math.sqrt(level) * 260));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-sprite-50">
      <div className="h-full rounded-full bg-sprite-500 transition-[width] duration-75" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Header({ task, right }: { task: Task; right?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-sprite-600">{TASK_SPECS[task.taskType].label}</div>
        <h1 className="text-xl font-bold">{task.title}</h1>
      </div>
      {right}
    </header>
  );
}

/** Recording state shared by both tasks. */
function useMic() {
  const mic = useRef<MicRecorder | null>(null);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** false after unmount: a running sequence must stop instead of reopening the mic. */
  const alive = useRef(true);
  useEffect(() => {
    // Set on EVERY mount: React StrictMode (dev) mounts → unmounts → mounts again, and a flag
    // only cleared in the cleanup stayed false forever (seen 2026-11-07: "시작" opened the mic,
    // then the sequence stopped at once).
    alive.current = true;
    return () => {
      alive.current = false;
      stopSpeaking();
      mic.current?.close();
      mic.current = null;
    };
  }, []);
  const [opening, setOpening] = useState(false);
  // Must be called directly from the click handler (see MicRecorder.open).
  const open = async () => {
    if (mic.current) return true;
    setOpening(true);
    try {
      mic.current = await MicRecorder.open();
      return true;
    } catch (e) {
      setError(micErrorKo(e));
      return false;
    } finally {
      setOpening(false);
    }
  };
  /** Shown while recording if audio is not flowing (suspended AudioContext). */
  const audioStuck = () => !!mic.current && mic.current.recording && mic.current.state !== "running";
  const record = (maxSeconds: number, silenceStopMs: number): Promise<Recording> =>
    mic.current!.start({ maxSeconds, silenceStopMs, onLevel: setLevel });
  const stop = () => mic.current?.stop();
  return { open, record, stop, level, error, setError, alive, opening, audioStuck };
}

async function save(name: string, r: Recording): Promise<string | null> {
  if (!r.heard) return null; // nothing said → no file, scores 0
  return api.saveAudio(name, r.wav);
}

function StuckNote() {
  return (
    <p className="text-xs text-amber-700">
      마이크 소리가 들어오지 않고 있어요. 창을 한 번 클릭해 보세요. 계속 안 되면 앱을 다시 실행해 주세요.
    </p>
  );
}

// ------------------------------------------------------------------ Listen and Repeat

type RepeatStep =
  | { kind: "intro" }
  | { kind: "listen"; i: number }
  | { kind: "record"; i: number; startedAt: number }
  | { kind: "saving"; i: number };

export function RepeatTask({
  task,
  sentences,
  onDone,
  onQuit,
}: {
  task: Task;
  sentences: string[];
  onDone: (r: SpeakingResult) => void;
  onQuit: () => void;
}) {
  const { open, record, stop, level, error, setError, alive, opening, audioStuck } = useMic();
  const [step, setStep] = useState<RepeatStep>({ kind: "intro" });
  const [showText, setShowText] = useState(!ttsAvailable());
  const [now, setNow] = useState(performance.now());
  const paths = useRef<(string | null)[]>([]);
  const seconds = useRef(0);

  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(id);
  }, []);

  const run = async (i: number) => {
    if (!alive.current) return;
    if (i >= sentences.length) {
      onDone({ audioPaths: paths.current, seconds: seconds.current });
      return;
    }
    setStep({ kind: "listen", i });
    try {
      await speak(sentences[i]);
    } catch {
      // No voice available: show the sentence as text for a moment instead.
      setShowText(true);
      await new Promise((r) => setTimeout(r, 1500 + sentences[i].split(/\s+/).length * 300));
    }
    if (!alive.current) return;
    setStep({ kind: "record", i, startedAt: performance.now() });
    const rec = await record(task.responseSeconds, 1500);
    if (!alive.current) return;
    setStep({ kind: "saving", i });
    try {
      paths.current[i] = await save(`lr-s${i + 1}`, rec);
      seconds.current += rec.seconds;
    } catch (e) {
      setError(`녹음 저장 실패: ${String(e)}`);
      paths.current[i] = null;
    }
    run(i + 1);
  };

  const begin = async () => {
    setError(null);
    if (await open()) run(0);
  };

  const i = step.kind === "intro" ? -1 : step.i;
  const remaining = step.kind === "record" ? task.responseSeconds - (now - step.startedAt) / 1000 : task.responseSeconds;

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <Header
        task={task}
        right={
          i >= 0 && (
            <div className="rounded-xl bg-white px-4 py-2 text-sm font-semibold shadow-sm">
              {i + 1} / {sentences.length}
            </div>
          )
        }
      />

      <section className="grid gap-4 rounded-xl bg-white p-6 shadow-sm">
        {step.kind === "intro" ? (
          <>
            <p className="text-sm leading-6 text-ink-600" data-selectable>
              {task.prompt || "Listen to each sentence and repeat it exactly."}
            </p>
            <ul className="ml-4 list-disc text-sm text-ink-600">
              <li>문장 {sentences.length}개를 한 번씩 들려줘요. 끝나면 바로 녹음이 시작돼요.</li>
              <li>문장당 최대 {task.responseSeconds}초. 말을 멈추면 자동으로 다음 문장으로 넘어가요.</li>
              <li>처음 시작할 때 마이크 사용 허락을 물어볼 수 있어요.</li>
            </ul>
            <div className="flex gap-2">
              <button className={primary} onClick={begin} disabled={opening}>
                {opening ? "마이크 준비 중…" : "시작"}
              </button>
              <button className={ghost} onClick={onQuit}>
                돌아가기
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span
                className={`grid h-10 w-10 place-items-center rounded-full text-lg ${
                  step.kind === "record" ? "animate-pulse bg-red-500 text-white" : "bg-sprite-100 text-sprite-700"
                }`}
              >
                {step.kind === "record" ? "●" : step.kind === "listen" ? "♪" : "…"}
              </span>
              <div className="text-lg font-semibold">
                {step.kind === "listen" ? "잘 들어보세요" : step.kind === "record" ? "따라 말하세요" : "저장 중…"}
              </div>
              {step.kind === "record" && (
                <span className="ml-auto font-mono text-2xl font-bold tabular-nums">{fmtClock(Math.max(0, remaining))}</span>
              )}
            </div>
            {step.kind === "record" && <LevelMeter level={level} />}
            {step.kind === "record" && audioStuck() && <StuckNote />}
            {showText && (
              <p className="rounded-lg bg-sprite-50 p-3 text-lg" data-selectable>
                {sentences[i]}
              </p>
            )}
            <div className="flex gap-2">
              {step.kind === "record" && (
                <button className={primary} onClick={stop}>
                  다 말했어요
                </button>
              )}
              {!showText && (
                <button className={`${ghost} ml-auto`} onClick={() => setShowText(true)}>
                  문장 보기 (소리가 안 들릴 때)
                </button>
              )}
            </div>
          </>
        )}
      </section>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ Interview

type InterviewStep =
  | { kind: "intro" }
  | { kind: "question" }
  | { kind: "prep"; startedAt: number }
  | { kind: "record"; startedAt: number }
  | { kind: "saving" };

export function InterviewTask({
  task,
  onDone,
  onQuit,
}: {
  task: Task;
  onDone: (r: SpeakingResult) => void;
  onQuit: () => void;
}) {
  const { open, record, stop, level, error, setError, alive, opening, audioStuck } = useMic();
  const [step, setStep] = useState<InterviewStep>({ kind: "intro" });
  const [now, setNow] = useState(performance.now());
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(id);
  }, []);

  const begin = async () => {
    setError(null);
    if (!(await open())) return;
    setStep({ kind: "question" });
    await speak(task.prompt).catch(() => undefined); // the question is also shown as text
    if (task.prepSeconds > 0) {
      setStep({ kind: "prep", startedAt: performance.now() });
      await new Promise((r) => setTimeout(r, task.prepSeconds * 1000));
    }
    if (!alive.current) return;
    setStep({ kind: "record", startedAt: performance.now() });
    // No silence auto-stop: students pause to think in a 45-second answer.
    const rec = await record(task.responseSeconds, 0);
    if (!alive.current) return;
    setStep({ kind: "saving" });
    try {
      const path = await save("interview", rec);
      onDone({ audioPaths: [path], seconds: rec.seconds });
    } catch (e) {
      setError(`녹음 저장 실패: ${String(e)}`);
      setStep({ kind: "intro" });
    }
  };

  const left = (start: number, total: number) => Math.max(0, total - (now - start) / 1000);

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <Header
        task={task}
        right={
          (step.kind === "record" || step.kind === "prep") && (
            <div
              className={`rounded-xl px-4 py-2 font-mono text-2xl font-bold tabular-nums ${
                step.kind === "record" ? "bg-red-50 text-red-600" : "bg-white shadow-sm"
              }`}
            >
              {fmtClock(left(step.startedAt, step.kind === "record" ? task.responseSeconds : task.prepSeconds))}
            </div>
          )
        }
      />
      <section className="grid gap-4 rounded-xl bg-white p-6 shadow-sm">
        {step.kind === "intro" ? (
          <>
            <ul className="ml-4 list-disc text-sm text-ink-600">
              <li>질문을 읽어 준 뒤{task.prepSeconds > 0 ? ` ${task.prepSeconds}초 준비 시간 후` : ""} 바로 녹음이 시작돼요.</li>
              <li>답변 시간은 {task.responseSeconds}초예요. 일찍 끝나면 "답변 완료"를 누르세요.</li>
            </ul>
            <div className="flex gap-2">
              <button className={primary} onClick={begin} disabled={opening}>
                {opening ? "마이크 준비 중…" : "시작"}
              </button>
              <button className={ghost} onClick={onQuit}>
                돌아가기
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-lg leading-8" data-selectable>
              {task.prompt}
            </p>
            <div className="flex items-center gap-3 text-sm font-semibold">
              {step.kind === "question" && "질문을 듣는 중…"}
              {step.kind === "prep" && "답변을 준비하세요"}
              {step.kind === "record" && <span className="text-red-600">● 녹음 중 — 답변하세요</span>}
              {step.kind === "saving" && "저장 중…"}
            </div>
            {step.kind === "record" && (
              <>
                <LevelMeter level={level} />
                {audioStuck() && <StuckNote />}
                <div>
                  <button className={primary} onClick={stop}>
                    답변 완료
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </section>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

/** Play a saved recording (loaded on demand through Rust; files never leave the device). */
export function AudioButton({ path, label = "▶ 녹음 듣기" }: { path: string | null; label?: string }) {
  const [busy, setBusy] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  useEffect(
    () => () => {
      audio.current?.pause();
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );
  if (!path) return <span className="text-xs text-ink-400">녹음 없음</span>;
  const play = async () => {
    try {
      setBusy(true);
      if (!url.current) {
        const buf = await api.readAudio(path);
        url.current = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
        audio.current = new Audio(url.current);
      }
      audio.current!.currentTime = 0;
      await audio.current!.play();
    } catch (e) {
      console.warn("playback failed", e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button onClick={play} disabled={busy} className="rounded-md border border-black/10 px-2 py-0.5 text-xs text-ink-600 hover:bg-sprite-50">
      {label}
    </button>
  );
}
