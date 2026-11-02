// Objective scoring for Listen and Repeat: compare the Whisper transcript with the
// target sentence word by word (Levenshtein alignment). No LLM involved.

export type WordOp =
  | { op: "ok"; ref: string; hyp: string }
  | { op: "sub"; ref: string; hyp: string }
  | { op: "del"; ref: string } // said nothing for this target word
  | { op: "ins"; hyp: string }; // extra word not in the target

export interface RepeatResult {
  target: string;
  transcript: string;
  /** 1 − (substitutions + deletions + insertions) / target words, clamped to 0–1. */
  accuracy: number;
  ops: WordOp[];
}

const NUMBER_WORDS: Record<string, string> = {
  "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five",
  "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten", "11": "eleven", "12": "twelve",
};

/**
 * Lower-case, unify apostrophes, drop punctuation, spell out small numbers
 * (Whisper writes "9" where the target says "nine").
 */
export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter(Boolean)
    .map((w) => NUMBER_WORDS[w] ?? w);
}

export function alignWords(ref: string[], hyp: string[]): WordOp[] {
  const n = ref.length;
  const m = hyp.length;
  // dp[i][j] = edit distance between ref[0..i) and hyp[0..j)
  const dp: number[][] = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j - 1] + cost, dp[i - 1][j] + 1, dp[i][j - 1] + 1);
    }
  }
  const ops: WordOp[] = [];
  let i = n;
  let j = m;
  // Backtrace. On ties prefer match > deletion/insertion > substitution, so a repeated or
  // skipped word is shown as exactly that ("extra 'to'", "missing 'your'") instead of a
  // chain of substitutions. The error count is identical either way.
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && ref[i - 1] === hyp[j - 1] && dp[i][j] === dp[i - 1][j - 1]) {
      ops.push({ op: "ok", ref: ref[i - 1], hyp: hyp[j - 1] });
      i--; j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.push({ op: "del", ref: ref[i - 1] });
      i--;
    } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      ops.push({ op: "ins", hyp: hyp[j - 1] });
      j--;
    } else {
      ops.push({ op: "sub", ref: ref[i - 1], hyp: hyp[j - 1] });
      i--; j--;
    }
  }
  return ops.reverse();
}

export function scoreRepeat(target: string, transcript: string): RepeatResult {
  const ref = normalizeWords(target);
  const hyp = normalizeWords(transcript);
  const ops = alignWords(ref, hyp);
  const errors = ops.filter((o) => o.op !== "ok").length;
  const accuracy = ref.length === 0 ? 0 : Math.max(0, 1 - errors / ref.length);
  return { target, transcript, accuracy, ops };
}

/** Target sentences of a listen_repeat task (one per non-empty line). */
export function targetSentences(material: string | null): string[] {
  return (material ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}
