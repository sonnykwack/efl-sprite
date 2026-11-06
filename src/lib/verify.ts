// Second opinion on LLM corrections before the student sees them.
//
// Failure seen on 2026-11-06 (AD 3, a strong, essentially correct response; 7B + GECToR):
// the grammar model found nothing, yet the scorer listed 4 "errors", all wrong —
// "library or cleaned" as agreement, "match" and "than counting" as fragments, and
// "reflection essay → paper". Asked to find errors inside a long scoring prompt, the model
// produces some whether or not they exist.
//
// A short, separate yes/no judgment is a much easier task than generating corrections:
// each item is shown with its full sentence and the model must give a reason BEFORE the
// verdict (same evidence-first rule as scoring). Only "error"/"unnatural" survive.
// Precision first: if the check call fails, the item is dropped.

import { api } from "./api";
import type { LanguageError } from "./scoring";
import type { ChatMessage } from "./types";

const SCHEMA = {
  type: "object",
  properties: {
    reason: { type: "string", maxLength: 240 },
    verdict: { type: "string", enum: ["error", "unnatural", "acceptable"] },
  },
  required: ["reason", "verdict"],
  additionalProperties: false,
};

const SYSTEM = [
  "You are a strict but fair English teacher checking ONE suggested correction to a student's writing.",
  "Decide whether the ORIGINAL words are really wrong in this sentence.",
  "reason: one short sentence explaining your judgment, written BEFORE the verdict.",
  "verdict:",
  "  error = the original is grammatically wrong or the word is used incorrectly;",
  "  unnatural = grammatical, but a teacher would clearly mark it as unnatural or too informal for academic writing;",
  "  acceptable = the original is correct and natural; the suggestion is only a different way to say it.",
  "Most suggestions you see are style preferences. If the original is fine, answer acceptable.",
].join("\n");

/** The full sentence that contains [start, end) — the model judges words in context. */
export function sentenceAround(text: string, start: number, end: number): string {
  let a = start;
  while (a > 0 && !/[.!?\n]/.test(text[a - 1])) a--;
  let b = end;
  while (b < text.length && !/[.!?\n]/.test(text[b])) b++;
  return text.slice(a, Math.min(text.length, b + 1)).trim();
}

async function judge(e: LanguageError, response: string): Promise<boolean> {
  const sentence = e.start >= 0 ? sentenceAround(response, e.start, e.end) : e.quote;
  const msgs: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `Sentence: ${sentence}\nOriginal words: "${e.quote}"\nSuggested: "${e.correction}"`,
    },
  ];
  try {
    const d = JSON.parse(await api.llmChat(msgs, SCHEMA)) as { verdict?: unknown };
    return d.verdict === "error" || d.verdict === "unnatural";
  } catch {
    return false;
  }
}

/** Keep rule and grammar-model items as they are; verify each LLM item concurrently. */
export async function verifyLlmCorrections(errors: LanguageError[], response: string): Promise<LanguageError[]> {
  const keep = await Promise.all(errors.map((e) => (e.source === "llm" ? judge(e, response) : Promise.resolve(true))));
  return errors.filter((_, i) => keep[i]);
}
