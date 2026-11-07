// Teacher review of an essay (교사 첨삭): the teacher's own corrections plus a verdict on each
// AI correction. Stored as JSON on the attempt (attempts.teacher_review, migration v3).
//
// What the student sees afterwards (effectiveErrors):
//   teacher corrections  >  AI corrections the teacher did not mark wrong
// An AI correction overlapping a teacher correction is hidden (the teacher's word is final).
// Verdicts also give a measurable number for the report: the precision of AI corrections as
// judged by a teacher (aiPrecision).

import { KIND_OF, type ErrorCategory } from "./grammarGuide";
import type { LanguageError } from "./scoring";

export interface TeacherAnnotation {
  id: string;
  /** UTF-16 offsets into the response text. */
  start: number;
  end: number;
  quote: string;
  category: ErrorCategory;
  /** Replacement text; equal to the quote when the teacher only comments. */
  correction: string;
  comment: string;
  createdAt: string;
}

export type AiVerdict = "ok" | "wrong";

export interface TeacherReview {
  version: 1;
  annotations: TeacherAnnotation[];
  /** Key = aiKey(error). */
  aiVerdicts: Record<string, AiVerdict>;
  updatedAt: string;
}

export const emptyReview = (): TeacherReview => ({ version: 1, annotations: [], aiVerdicts: {}, updatedAt: "" });

export function parseReview(json: string | null | undefined): TeacherReview {
  if (!json) return emptyReview();
  try {
    const r = JSON.parse(json) as Partial<TeacherReview>;
    return {
      version: 1,
      annotations: Array.isArray(r.annotations) ? r.annotations : [],
      aiVerdicts: r.aiVerdicts && typeof r.aiVerdicts === "object" ? r.aiVerdicts : {},
      updatedAt: r.updatedAt ?? "",
    };
  } catch {
    return emptyReview();
  }
}

/** Stable identity of an AI correction (survives reloads; changes if the essay is re-scored). */
export const aiKey = (e: Pick<LanguageError, "start" | "end" | "quote" | "correction">) =>
  `${e.start}:${e.end}:${e.quote}→${e.correction}`;

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  a.start >= 0 && b.start >= 0 && a.start < b.end && b.start < a.end;

export function annotationToError(a: TeacherAnnotation): LanguageError {
  return {
    kind: KIND_OF(a.category),
    category: a.category,
    why: a.comment,
    quote: a.quote,
    correction: a.correction,
    grounded: true,
    located: true,
    source: "teacher",
    start: a.start,
    end: a.end,
  };
}

/** Corrections the student sees, in reading order. */
export function effectiveErrors(ai: LanguageError[], review: TeacherReview): LanguageError[] {
  const teacher = review.annotations.map(annotationToError);
  const kept = ai.filter((e) => review.aiVerdicts[aiKey(e)] !== "wrong" && !teacher.some((t) => overlaps(t, e)));
  return [...teacher, ...kept].sort((a, b) => (a.start < 0 ? 1e9 : a.start) - (b.start < 0 ? 1e9 : b.start));
}

export interface Piece {
  text: string;
  op: "same" | "del" | "ins";
}

/**
 * Apply non-overlapping corrections to the text (earlier/teacher items win on overlap).
 * Returns pieces for display (deleted text struck through, inserted text highlighted).
 */
export function applyCorrections(text: string, items: { start: number; end: number; correction: string }[]): Piece[] {
  const sorted = items.filter((i) => i.start >= 0 && i.end >= i.start && i.end <= text.length);
  const chosen: typeof sorted = [];
  for (const i of sorted) if (!chosen.some((c) => overlaps(c, i) || (c.start === i.start && c.end === i.end))) chosen.push(i);
  chosen.sort((a, b) => a.start - b.start);
  const out: Piece[] = [];
  let pos = 0;
  for (const c of chosen) {
    if (c.start > pos) out.push({ text: text.slice(pos, c.start), op: "same" });
    const before = text.slice(c.start, c.end);
    if (before !== c.correction) {
      if (before) out.push({ text: before, op: "del" });
      if (c.correction) out.push({ text: c.correction, op: "ins" });
    } else {
      out.push({ text: before, op: "same" });
    }
    pos = c.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), op: "same" });
  return out;
}

/** The corrected essay as plain text. */
export const correctedText = (pieces: Piece[]) =>
  pieces
    .filter((p) => p.op !== "del")
    .map((p) => p.text)
    .join("")
    .replace(/ {2,}/g, " ");

/** Teacher-judged precision of AI corrections over many reviews. */
export function aiPrecision(reviews: TeacherReview[]): { ok: number; wrong: number } {
  let ok = 0;
  let wrong = 0;
  for (const r of reviews)
    for (const v of Object.values(r.aiVerdicts)) {
      if (v === "ok") ok++;
      else if (v === "wrong") wrong++;
    }
  return { ok, wrong };
}

/** Offsets of the current selection inside `root` (text content coordinates), or null. */
export function selectionOffsets(root: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const pre = document.createRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  const end = start + range.toString().length;
  return end > start ? { start, end } : null;
}

/** Grow a selection to whole words and trim surrounding spaces ("ent to schoo" → "went to school"). */
export function snapToWords(text: string, start: number, end: number): { start: number; end: number } {
  const isWord = (c: string | undefined) => !!c && /[A-Za-z0-9'’-]/.test(c);
  let a = start;
  let b = end;
  while (a < b && /\s/.test(text[a])) a++;
  while (b > a && /\s/.test(text[b - 1])) b--;
  while (a > 0 && isWord(text[a - 1]) && isWord(text[a])) a--;
  while (b < text.length && isWord(text[b]) && isWord(text[b - 1])) b++;
  return { start: a, end: b };
}
