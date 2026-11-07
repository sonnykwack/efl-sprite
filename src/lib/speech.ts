// Read a sentence aloud with the OS's own English voice (Web Speech API): on-device on both
// WebView2 (Windows voices) and WKWebView (macOS voices), no audio files to ship.
// If no voice is available the attempt screen shows the sentence as text instead.

let cached: SpeechSynthesisVoice | null | undefined;

export function ttsAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

async function voices(): Promise<SpeechSynthesisVoice[]> {
  const now = speechSynthesis.getVoices();
  if (now.length) return now;
  // Voices load asynchronously on first use.
  return new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1500);
  });
}

/** Prefer a local US English voice, then any local English voice, then any English voice. */
export async function englishVoice(): Promise<SpeechSynthesisVoice | null> {
  if (cached !== undefined) return cached;
  const list = (await voices()).filter((v) => /^en[-_]/i.test(v.lang));
  cached =
    list.find((v) => v.localService && /en[-_]US/i.test(v.lang)) ??
    list.find((v) => v.localService) ??
    list[0] ??
    null;
  return cached;
}

/** Speak and resolve when finished (with a time-based fallback if `onend` never fires). */
export async function speak(text: string, rate = 0.95): Promise<void> {
  if (!ttsAvailable()) throw new Error("no speech synthesis");
  const voice = await englishVoice();
  if (!voice) throw new Error("no English voice");
  speechSynthesis.cancel();
  return new Promise((resolve, reject) => {
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = rate;
    const words = text.split(/\s+/).length;
    const fallback = setTimeout(resolve, (words * 0.5 + 2) * 1000);
    u.onend = () => {
      clearTimeout(fallback);
      resolve();
    };
    u.onerror = (e) => {
      clearTimeout(fallback);
      reject(new Error(e.error));
    };
    speechSynthesis.speak(u);
  });
}

export function stopSpeaking(): void {
  if (ttsAvailable()) speechSynthesis.cancel();
}
