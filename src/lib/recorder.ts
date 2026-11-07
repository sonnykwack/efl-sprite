// Microphone recording in the WebView → 16 kHz mono WAV bytes.
//
// Raw samples are captured with a ScriptProcessorNode (works in WebView2/Chromium and
// WKWebView/Safari 15) instead of MediaRecorder, whose container differs per engine
// (webm vs mp4). Resampling and WAV encoding are plain code in wav.ts.
//
// Permissions: macOS needs NSMicrophoneUsageDescription (src-tauri/Info.plist); the MSIX
// package needs the `microphone` capability (Day 9). The first call asks the user.

import { encodeWav, resample, rms, trimSilence, TARGET_RATE } from "./wav";

export interface Recording {
  wav: Uint8Array;
  /** Seconds of audio actually kept (after trimming). */
  seconds: number;
  /** Whether any speech above the threshold was heard. */
  heard: boolean;
}

export interface RecordOptions {
  maxSeconds: number;
  /** Stop automatically after this much silence once speech has started (0 = never). */
  silenceStopMs?: number;
  onLevel?: (level: number) => void;
  onAutoStop?: () => void;
}

const SPEECH = 0.02;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export function micErrorKo(e: unknown): string {
  const name = (e as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "마이크 사용이 허용되지 않았어요. macOS: 시스템 설정 → 개인정보 보호 및 보안 → 마이크 / Windows: 설정 → 개인 정보 → 마이크에서 EFL Sprite를 허용해 주세요.";
  if (name === "NotFoundError") return "마이크를 찾을 수 없어요. 마이크가 연결되어 있는지 확인해 주세요.";
  if (e instanceof Error && /[가-힣]/.test(e.message)) return e.message;
  return `마이크를 열 수 없어요: ${String(e)}`;
}

export class MicRecorder {
  private chunks: Float32Array[] = [];
  private proc: ScriptProcessorNode | null = null;
  private heard = false;
  private silentSince = 0;
  private resolveStop: ((r: Recording) => void) | null = null;
  private wallTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(
    private ctx: AudioContext,
    private stream: MediaStream,
    private source: MediaStreamAudioSourceNode,
  ) {}

  /**
   * Call SYNCHRONOUSLY from a click handler. WebKit (macOS WKWebView) only lets an AudioContext
   * start during a user gesture; created after an `await` its resume() can stay pending forever
   * (seen 2026-11-07: "시작" did nothing, no error). So the context is created and resumed
   * before the first await, and every wait has a time limit that turns into a visible error.
   */
  static async open(): Promise<MicRecorder> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("이 환경에서는 마이크를 사용할 수 없어요.");
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const resumed = ctx.resume().catch(() => undefined);
    let stream: MediaStream;
    try {
      console.info("[mic] requesting microphone");
      stream = await withTimeout(
        navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        }),
        15000,
        "마이크 응답이 없어요 (15초). 시스템 설정 → 개인정보 보호 및 보안 → 마이크에서 허용했는지 확인하고, 앱을 다시 실행해 주세요.",
      );
    } catch (e) {
      ctx.close().catch(() => undefined);
      throw e;
    }
    await Promise.race([resumed, sleep(1500)]);
    console.info("[mic] stream ok; audio context", ctx.state, ctx.sampleRate);
    return new MicRecorder(ctx, stream, ctx.createMediaStreamSource(stream));
  }

  /** "running" once audio flows; anything else means the recording would stay silent. */
  get state(): AudioContextState {
    return this.ctx.state;
  }

  get recording(): boolean {
    return this.proc !== null;
  }

  /** Start recording; the promise resolves when stop() is called or a limit is reached. */
  start(opts: RecordOptions): Promise<Recording> {
    if (this.proc) throw new Error("already recording");
    if (this.ctx.state !== "running") this.ctx.resume().catch(() => undefined);
    this.chunks = [];
    this.heard = false;
    this.silentSince = 0;
    const proc = this.ctx.createScriptProcessor(4096, 1, 1);
    const t0 = performance.now();
    proc.onaudioprocess = (ev) => {
      const data = new Float32Array(ev.inputBuffer.getChannelData(0));
      this.chunks.push(data);
      const level = rms(data);
      opts.onLevel?.(level);
      const now = performance.now();
      if (level >= SPEECH) {
        this.heard = true;
        this.silentSince = 0;
      } else if (this.heard && !this.silentSince) {
        this.silentSince = now;
      }
      if (opts.silenceStopMs && this.heard && this.silentSince && now - this.silentSince >= opts.silenceStopMs) {
        opts.onAutoStop?.();
        this.stop();
      } else if (now - t0 >= opts.maxSeconds * 1000) {
        opts.onAutoStop?.();
        this.stop();
      }
    };
    this.source.connect(proc);
    proc.connect(this.ctx.destination); // Chromium only fires onaudioprocess when connected
    this.proc = proc;
    // Wall-clock limit as well: if no audio callbacks arrive (suspended context), the
    // sample-based limit above never fires and the screen would wait forever.
    this.wallTimer = setTimeout(() => {
      opts.onAutoStop?.();
      this.stop();
    }, opts.maxSeconds * 1000 + 500);
    return new Promise((resolve) => (this.resolveStop = resolve));
  }

  stop(): void {
    const proc = this.proc;
    if (!proc) return;
    this.proc = null;
    if (this.wallTimer) clearTimeout(this.wallTimer);
    this.wallTimer = null;
    proc.onaudioprocess = null;
    try {
      this.source.disconnect(proc);
      proc.disconnect();
    } catch {
      /* already disconnected */
    }
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const all = new Float32Array(total);
    let o = 0;
    for (const c of this.chunks) {
      all.set(c, o);
      o += c.length;
    }
    const pcm = trimSilence(resample(all, this.ctx.sampleRate, TARGET_RATE), TARGET_RATE);
    this.resolveStop?.({ wav: encodeWav(pcm, TARGET_RATE), seconds: pcm.length / TARGET_RATE, heard: this.heard });
    this.resolveStop = null;
  }

  close(): void {
    this.stop();
    this.stream.getTracks().forEach((t) => t.stop());
    this.ctx.close().catch(() => undefined);
  }
}
