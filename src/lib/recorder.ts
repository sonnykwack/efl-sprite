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

export function micErrorKo(e: unknown): string {
  const name = (e as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "마이크 사용이 허용되지 않았어요. macOS: 시스템 설정 → 개인정보 보호 및 보안 → 마이크 / Windows: 설정 → 개인 정보 → 마이크에서 EFL Sprite를 허용해 주세요.";
  if (name === "NotFoundError") return "마이크를 찾을 수 없어요. 마이크가 연결되어 있는지 확인해 주세요.";
  return `마이크를 열 수 없어요: ${String(e)}`;
}

export class MicRecorder {
  private chunks: Float32Array[] = [];
  private proc: ScriptProcessorNode | null = null;
  private heard = false;
  private silentSince = 0;
  private resolveStop: ((r: Recording) => void) | null = null;

  private constructor(
    private ctx: AudioContext,
    private stream: MediaStream,
    private source: MediaStreamAudioSourceNode,
  ) {}

  /** Call from a click handler (WKWebView only lets an AudioContext start after a gesture). */
  static async open(): Promise<MicRecorder> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("이 환경에서는 마이크를 사용할 수 없어요.");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    await ctx.resume();
    return new MicRecorder(ctx, stream, ctx.createMediaStreamSource(stream));
  }

  get recording(): boolean {
    return this.proc !== null;
  }

  /** Start recording; the promise resolves when stop() is called or a limit is reached. */
  start(opts: RecordOptions): Promise<Recording> {
    if (this.proc) throw new Error("already recording");
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
    return new Promise((resolve) => (this.resolveStop = resolve));
  }

  stop(): void {
    const proc = this.proc;
    if (!proc) return;
    this.proc = null;
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
