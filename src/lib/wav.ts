// Pure audio helpers (no browser APIs, unit-testable in Node): resample to 16 kHz, trim
// silence, encode 16-bit PCM WAV — the format whisper.cpp expects.

export const TARGET_RATE = 16000;

/**
 * Downsample with a box low-pass: each output sample is the mean of the input samples it
 * covers. Good enough for speech recognition (energy above 8 kHz is not needed) and identical
 * on every WebView — no OfflineAudioContext differences between WebView2 and WKWebView.
 */
export function resample(input: Float32Array, fromRate: number, toRate = TARGET_RATE): Float32Array {
  if (fromRate === toRate) return input.slice();
  const ratio = fromRate / toRate;
  const n = Math.floor(input.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = i * ratio;
    const b = Math.min(input.length, a + ratio);
    let sum = 0;
    let w = 0;
    for (let k = Math.floor(a); k < Math.ceil(b); k++) {
      // fractional weight of input sample k inside [a, b)
      const wk = Math.min(b, k + 1) - Math.max(a, k);
      if (wk > 0) {
        sum += input[k] * wk;
        w += wk;
      }
    }
    out[i] = w > 0 ? sum / w : 0;
  }
  return out;
}

export function rms(x: Float32Array, start = 0, end = x.length): number {
  let s = 0;
  for (let i = start; i < end; i++) s += x[i] * x[i];
  return end > start ? Math.sqrt(s / (end - start)) : 0;
}

/**
 * Cut leading/trailing silence (keeps `padMs` around speech). Whisper tends to invent words
 * ("Thank you.") on long silent stretches. Returns the input unchanged if no speech is found.
 */
export function trimSilence(x: Float32Array, rate: number, threshold = 0.015, padMs = 250): Float32Array {
  const win = Math.max(1, Math.round(rate * 0.02)); // 20 ms frames
  let first = -1;
  let last = -1;
  for (let i = 0; i + win <= x.length; i += win) {
    if (rms(x, i, i + win) >= threshold) {
      if (first < 0) first = i;
      last = i + win;
    }
  }
  if (first < 0) return x;
  const pad = Math.round((rate * padMs) / 1000);
  return x.slice(Math.max(0, first - pad), Math.min(x.length, last + pad));
}

/** Mono 16-bit PCM WAV. */
export function encodeWav(samples: Float32Array, rate = TARGET_RATE): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(bytes.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}
