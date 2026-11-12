import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { fmtClock } from "../lib/format";
import { MicRecorder, micErrorKo, type Recording } from "../lib/recorder";
import { TASK_SPECS } from "../lib/rubrics";
import { speak, stopSpeaking, ttsAvailable } from "../lib/speech";
import type { Task } from "../lib/types";

export interface SpeakingResult {
  audioPaths: (string | null)[];
  seconds: number;
}

const btnBase =
  "rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:opacity-40";
const btnPrimary = `${btnBase} bg-sprite-500 text-white hover:bg-sprite-600`;
const btnOutline = `${btnBase} border border-black/10 text-ink-600 hover:bg-sprite-50`;

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function LevelMeter({
  level,
  suspended,
}: {
  level: number;
  suspended: boolean;
}) {
  // level is RMS (speech ≈ 0.02–0.2); sqrt spreads it so speech fills the bar visibly.
  const pct = Math.min(100, Math.round(Math.sqrt(Math.max(0, level)) * 260));
  return (
    <div className="grid gap-1.5">
      <div className="text-xs text-ink-400">마이크 입력 레벨</div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-sprite-50">
        <div
          className="h-full rounded-full bg-sprite-500 transition-all duration-75"
          style={{ width: `${pct}%` }}
        />
      </div>
      {suspended && (
        <p className="text-xs text-amber-600">
          오디오 장치가 일시 중지 상태입니다. 마이크 권한이나 입력 장치를 확인해 주세요.
        </p>
      )}
    </div>
  );
}

export function AudioButton({
  path,
  label = "▶ 녹음 듣기",
}: {
  path: string | null;
  label?: string;
}) {
  const [playing, setPlaying] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const aliveRef = useRef<boolean>(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, []);

  if (!path) {
    return <span className="text-xs text-ink-400">녹음 없음</span>;
  }

  const handleTogglePlay = async () => {
    setErrMsg(null);

    if (playing && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setPlaying(false);
      return;
    }

    try {
      if (!audioRef.current) {
        setLoading(true);
        const buf = await api.readAudio(path);
        if (!aliveRef.current) return;

        const url = URL.createObjectURL(
          new Blob([buf], { type: "audio/wav" }),
        );
        urlRef.current = url;

        const audio = new Audio(url);
        audio.onended = () => {
          if (aliveRef.current) setPlaying(false);
        };
        audio.onerror = () => {
          if (aliveRef.current) {
            setPlaying(false);
            setErrMsg("녹음 파일을 재생할 수 없습니다.");
          }
        };
        audioRef.current = audio;
      }

      await audioRef.current.play();
      if (aliveRef.current) setPlaying(true);
    } catch (e: unknown) {
      if (aliveRef.current) {
        setPlaying(false);
        setErrMsg(
          e instanceof Error
            ? `재생 실패: ${e.message}`
            : "녹음 재생에 실패했습니다.",
        );
      }
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={loading}
        onClick={handleTogglePlay}
        className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition disabled:opacity-40 ${
          playing
            ? "bg-rose-500 text-white hover:bg-rose-600"
            : "border border-black/10 bg-white text-ink-600 hover:bg-sprite-50"
        }`}
      >
        {loading ? "불러오는 중…" : playing ? "■ 정지" : label}
      </button>
      {errMsg && <span className="text-xs text-red-600">{errMsg}</span>}
    </span>
  );
}

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
  const [phase, setPhase] = useState<
    "ready" | "listening" | "recording" | "saving"
  >("ready");
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [showText, setShowText] = useState<boolean>(() => !ttsAvailable());
  const [remaining, setRemaining] = useState<number>(task.responseSeconds);
  const [level, setLevel] = useState<number>(0);
  const [suspended, setSuspended] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<boolean>(false);

  const aliveRef = useRef<boolean>(true);
  const micRef = useRef<MicRecorder | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      clearTimer();
      stopSpeaking();
      micRef.current?.close();
      micRef.current = null;
    };
  }, []);

  const startCountdown = (seconds: number) => {
    clearTimer();
    setRemaining(seconds);
    timerRef.current = window.setInterval(() => {
      if (!aliveRef.current) {
        clearTimer();
        return;
      }
      const m = micRef.current;
      if (m) {
        setSuspended(Boolean(m.recording && m.state !== "running"));
      }
      setRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
  };

  const recordSentence = async (
    mic: MicRecorder,
    maxSeconds: number,
    silenceStopMs: number,
  ): Promise<Recording> => {
    setLevel(0);
    setSuspended(false);
    startCountdown(maxSeconds);
    try {
      return await mic.start({
        maxSeconds,
        silenceStopMs,
        onLevel: (lv) => {
          if (!aliveRef.current) return;
          setLevel(lv);
          setSuspended(Boolean(mic.recording && mic.state !== "running"));
        },
      });
    } finally {
      clearTimer();
    }
  };

  const handleStart = async () => {
    if (sentences.length === 0 || opening) return;
    setError(null);
    setOpening(true);

    let mic: MicRecorder;
    try {
      mic = await MicRecorder.open();
    } catch (e: unknown) {
      if (aliveRef.current) setError(micErrorKo(e));
      return;
    } finally {
      if (aliveRef.current) setOpening(false);
    }

    if (!aliveRef.current) {
      mic.close();
      return;
    }
    micRef.current = mic;

    setPhase("listening");
    await waitMs(800);
    if (!aliveRef.current) return;

    const audioPaths: (string | null)[] = [];
    let totalSeconds = 0;

    for (let i = 0; i < sentences.length; i++) {
      if (!aliveRef.current) return;

      const sentence = sentences[i];
      setCurrentIdx(i);
      setPhase("listening");

      try {
        await speak(sentence);
      } catch {
        if (!aliveRef.current) return;
        setShowText(true);
        const wordCount = sentence.trim().split(/\s+/).filter(Boolean).length;
        await waitMs(1500 + wordCount * 300);
      }

      if (!aliveRef.current) return;

      setPhase("recording");
      let rec: Recording;
      try {
        rec = await recordSentence(mic, task.responseSeconds, 0);
      } catch (e: unknown) {
        if (!aliveRef.current) return;
        setError(micErrorKo(e));
        mic.close();
        micRef.current = null;
        setPhase("ready");
        return;
      }

      if (!aliveRef.current) return;

      setPhase("saving");
      totalSeconds += rec.seconds;

      if (!rec.heard) {
        audioPaths.push(null);
      } else {
        try {
          const savedPath = await api.saveAudio(`lr-s${i + 1}`, rec.wav);
          if (!aliveRef.current) return;
          audioPaths.push(savedPath);
        } catch (e: unknown) {
          if (!aliveRef.current) return;
          setError(
            e instanceof Error
              ? `문장 ${i + 1} 녹음 저장 실패: ${e.message}`
              : `문장 ${i + 1} 녹음 저장에 실패했습니다.`,
          );
          audioPaths.push(null);
        }
      }
    }

    if (!aliveRef.current) return;
    mic.close();
    micRef.current = null;
    onDone({ audioPaths, seconds: totalSeconds });
  };

  const handleQuit = () => {
    aliveRef.current = false;
    clearTimer();
    stopSpeaking();
    micRef.current?.stop();
    micRef.current?.close();
    micRef.current = null;
    onQuit();
  };

  const currentSentence = sentences[currentIdx] ?? "";

  return (
    <div className="grid gap-4 rounded-xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <span className="rounded bg-sprite-50 px-2 py-0.5 text-xs font-semibold text-sprite-700">
            {TASK_SPECS[task.taskType].label}
          </span>
          <p className="mt-1 text-sm text-ink-600">{task.prompt}</p>
        </div>
        <button type="button" className={btnOutline} onClick={handleQuit}>
          그만두기
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {error}
        </div>
      )}

      {phase === "ready" ? (
        <div className="grid gap-3 rounded-lg bg-sprite-50/60 p-4 text-sm text-ink-600">
          <p>
            총 <strong>{sentences.length}문장</strong>입니다. 각 문장을 들은 뒤
            그대로 따라 말하세요. (문장당 제한 시간{" "}
            {fmtClock(task.responseSeconds)})
          </p>
          <div>
            <button type="button" className={btnPrimary} disabled={opening} onClick={handleStart}>
              {opening ? "마이크 준비 중…" : "시작"}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-ink-600">
              진행: {currentIdx + 1} / {sentences.length}
            </span>
            <span className="text-xs font-medium text-ink-400">
              {phase === "listening"
                ? "문장을 듣는 중…"
                : phase === "recording"
                  ? `남은 시간 ${fmtClock(remaining)}`
                  : "저장 중…"}
            </span>
          </div>

          <div className="rounded-lg border border-black/10 bg-sprite-50/40 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-ink-400">
                목표 문장
              </span>
              <button
                type="button"
                className="text-xs font-semibold text-sprite-700 underline"
                onClick={() => setShowText((v) => !v)}
              >
                {showText ? "문장 숨기기" : "문장 보기"}
              </button>
            </div>
            {showText ? (
              <p className="text-base font-medium text-ink-600" data-selectable>
                {currentSentence}
              </p>
            ) : (
              <p className="text-sm text-ink-400">
                소리에 집중해 듣고 따라 말해 보세요.
              </p>
            )}
          </div>

          {phase === "recording" && (
            <>
              <LevelMeter level={level} suspended={suspended} />
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-400">
                  다 말했으면 "다음"을 누르세요. 제한 시간이 끝나면 자동으로 넘어가요.
                </span>
                <button
                  type="button"
                  className={btnPrimary}
                  onClick={() => micRef.current?.stop()}
                >
                  {currentIdx + 1 < sentences.length ? "다음" : "완료"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function InterviewTask({
  task,
  onDone,
  onQuit,
}: {
  task: Task;
  onDone: (r: SpeakingResult) => void;
  onQuit: () => void;
}) {
  const [phase, setPhase] = useState<
    "ready" | "listening" | "prep" | "recording" | "saving"
  >("ready");
  const [remaining, setRemaining] = useState<number>(0);
  const [level, setLevel] = useState<number>(0);
  const [suspended, setSuspended] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<boolean>(false);

  const aliveRef = useRef<boolean>(true);
  const micRef = useRef<MicRecorder | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      clearTimer();
      stopSpeaking();
      micRef.current?.close();
      micRef.current = null;
    };
  }, []);

  const runPrepCountdown = (prepSeconds: number): Promise<void> =>
    new Promise((resolve) => {
      clearTimer();
      setRemaining(prepSeconds);
      let left = prepSeconds;
      timerRef.current = window.setInterval(() => {
        if (!aliveRef.current) {
          clearTimer();
          resolve();
          return;
        }
        left -= 1;
        setRemaining(Math.max(0, left));
        if (left <= 0) {
          clearTimer();
          resolve();
        }
      }, 1000);
    });

  const startRecordingCountdown = (maxSeconds: number) => {
    clearTimer();
    setRemaining(maxSeconds);
    timerRef.current = window.setInterval(() => {
      if (!aliveRef.current) {
        clearTimer();
        return;
      }
      const m = micRef.current;
      if (m) {
        setSuspended(Boolean(m.recording && m.state !== "running"));
      }
      setRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
  };

  const handleStart = async () => {
    if (opening) return;
    setError(null);
    setOpening(true);

    let mic: MicRecorder;
    try {
      mic = await MicRecorder.open();
    } catch (e: unknown) {
      if (aliveRef.current) setError(micErrorKo(e));
      return;
    } finally {
      if (aliveRef.current) setOpening(false);
    }

    if (!aliveRef.current) {
      mic.close();
      return;
    }
    micRef.current = mic;

    setPhase("listening");
    await waitMs(800);
    if (!aliveRef.current) return;

    try {
      await speak(task.prompt);
    } catch {
      // 음성 출력이 실패해도 질문이 화면에 표시되므로 계속 진행합니다.
    }

    if (!aliveRef.current) return;

    if (task.prepSeconds > 0) {
      setPhase("prep");
      await runPrepCountdown(task.prepSeconds);
      if (!aliveRef.current) return;
    }

    setPhase("recording");
    setLevel(0);
    setSuspended(false);
    startRecordingCountdown(task.responseSeconds);

    let rec: Recording;
    try {
      rec = await mic.start({
        maxSeconds: task.responseSeconds,
        silenceStopMs: 0,
        onLevel: (lv) => {
          if (!aliveRef.current) return;
          setLevel(lv);
          setSuspended(Boolean(mic.recording && mic.state !== "running"));
        },
      });
    } catch (e: unknown) {
      clearTimer();
      if (!aliveRef.current) return;
      setError(micErrorKo(e));
      mic.close();
      micRef.current = null;
      setPhase("ready");
      return;
    }
    clearTimer();

    if (!aliveRef.current) return;

    mic.close();
    micRef.current = null;
    setPhase("saving");

    try {
      // Nothing said → no file; AttemptPage then asks the student to check the mic.
      const savedPath = rec.heard ? await api.saveAudio("interview", rec.wav) : null;
      if (!aliveRef.current) return;
      onDone({ audioPaths: [savedPath], seconds: rec.seconds });
    } catch (e: unknown) {
      if (!aliveRef.current) return;
      setError(
        e instanceof Error
          ? `녹음 저장 실패: ${e.message}`
          : "인터뷰 녹음 저장에 실패했습니다. 다시 시도해 주세요.",
      );
      setPhase("ready");
    }
  };

  const handleQuit = () => {
    aliveRef.current = false;
    clearTimer();
    stopSpeaking();
    micRef.current?.stop();
    micRef.current?.close();
    micRef.current = null;
    onQuit();
  };

  return (
    <div className="grid gap-4 rounded-xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="rounded bg-sprite-50 px-2 py-0.5 text-xs font-semibold text-sprite-700">
          {TASK_SPECS[task.taskType].label}
        </span>
        <button type="button" className={btnOutline} onClick={handleQuit}>
          그만두기
        </button>
      </div>

      <div className="rounded-lg border border-black/10 bg-sprite-50/40 p-4">
        <span className="text-xs font-medium text-ink-400">질문</span>
        <p className="mt-1 whitespace-pre-wrap text-base font-medium text-ink-600" data-selectable>
          {task.prompt}
        </p>
        {task.material && (
          <p className="mt-2 whitespace-pre-wrap rounded bg-white p-3 text-sm text-ink-600" data-selectable>
            {task.material}
          </p>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {error}
        </div>
      )}

      {phase === "ready" && (
        <div className="flex items-center justify-between rounded-lg bg-sprite-50/60 p-4 text-sm text-ink-600">
          <span>
            {task.prepSeconds > 0
              ? `준비 시간 ${fmtClock(task.prepSeconds)} 후 ${fmtClock(task.responseSeconds)} 동안 답변을 녹음합니다.`
              : `${fmtClock(task.responseSeconds)} 동안 답변을 녹음합니다.`}
          </span>
          <button type="button" className={btnPrimary} disabled={opening} onClick={handleStart}>
            {opening ? "마이크 준비 중…" : "시작"}
          </button>
        </div>
      )}

      {phase === "listening" && (
        <p className="text-sm text-ink-400">질문을 읽는 중입니다…</p>
      )}

      {phase === "prep" && (
        <div className="flex items-center justify-between rounded-lg bg-amber-50 p-4 text-sm text-ink-600">
          <span>답변을 준비하세요.</span>
          <span className="font-semibold">남은 준비 시간 {fmtClock(remaining)}</span>
        </div>
      )}

      {phase === "recording" && (
        <div className="grid gap-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-sprite-700">녹음 중…</span>
            <span className="text-xs font-medium text-ink-400">
              남은 시간 {fmtClock(remaining)}
            </span>
          </div>
          <LevelMeter level={level} suspended={suspended} />
          <div className="flex justify-end">
            <button
              type="button"
              className={btnPrimary}
              onClick={() => micRef.current?.stop()}
            >
              답변 마침
            </button>
          </div>
        </div>
      )}

      {phase === "saving" && (
        <p className="text-sm text-ink-400">녹음 파일을 저장하는 중입니다…</p>
      )}
    </div>
  );
}