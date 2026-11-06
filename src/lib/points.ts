// Email required-point coverage, checked by a separate focused call per point.
//
// Failure seen on 2026-11-06 (ES-1 Email 1-B, 7B): "ask about the next meeting" judged
// MISSING although the email asks "Could you let me know when the next meeting is
// scheduled?" — and the cap then cut Task Achievement 5 → 3. The status was one small field
// inside the long scoring JSON, decided without pointing at any sentence.
//
// Now: one short call per point (concurrent), schema order quote → status (find the sentence
// FIRST, then judge — the same rule as evidence → score), then a code check of the quote:
//   - "missing" but the quote is a real sentence of the email → partial (the model found it)
//   - "covered"/"partial" but the quote is not in the email      → partial / missing

import { api } from "./api";
import { snapQuote } from "./snap";
import type { RequiredPoint } from "./scoring";
import type { ChatMessage } from "./types";

const SCHEMA = {
  type: "object",
  properties: {
    quote: { type: "string", maxLength: 300 },
    status: { type: "string", enum: ["covered", "partial", "missing"] },
  },
  required: ["quote", "status"],
  additionalProperties: false,
};

function messages(taskPrompt: string, email: string, point: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You check ONE requirement of a student's email.",
        "1. quote: copy, word for word, the sentence(s) of <student_email> that do what the requirement asks. Indirect wording counts: a question such as 'Could you tell me when …?' IS asking about it. If no sentence does it, quote \"\".",
        "2. status:",
        "   covered = a sentence clearly does it (even briefly);",
        "   partial = it is only hinted at, or so vague that the reader cannot act on it;",
        "   missing = no sentence does it.",
        "Judge only this requirement. Grammar mistakes do not matter here.",
      ].join("\n"),
    },
    {
      role: "user",
      content: `<task>\n${taskPrompt.trim()}\n</task>\n\n<student_email>\n${email.trim()}\n</student_email>\n\nRequirement: ${point}`,
    },
  ];
}

/** Code check of the model's verdict against its own quote. Exported for tests. */
export function reconcile(point: string, status: string, quote: string, email: string): RequiredPoint {
  const q = quote.trim();
  const snap = q ? snapQuote(q, email) : null;
  // A real sentence: located in the email and at least 3 words long.
  const real = !!snap?.found && snap.text.split(/\s+/).length >= 3;
  const evidence = real ? snap!.text : undefined;
  let st: RequiredPoint["status"] = status === "covered" || status === "partial" ? status : "missing";
  if (st === "missing" && real) st = "partial";
  else if (st === "covered" && !real) st = q ? "partial" : "missing";
  else if (st === "partial" && !q) st = "missing";
  return { point, status: st, evidence };
}

/** Check every required point concurrently (llama-server parallel slots). */
export async function checkRequiredPoints(taskPrompt: string, email: string, points: string[]): Promise<RequiredPoint[]> {
  return Promise.all(
    points.map(async (point) => {
      try {
        const raw = await api.llmChat(messages(taskPrompt, email, point), SCHEMA);
        const d = JSON.parse(raw) as { quote?: unknown; status?: unknown };
        return reconcile(point, String(d.status ?? ""), String(d.quote ?? ""), email);
      } catch {
        // Unknown ≠ missing: never cap a score because a check call failed.
        return { point, status: "covered" as const, evidence: undefined, failed: true };
      }
    }),
  );
}
