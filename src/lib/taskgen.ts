// AI task generation with the local LLM (no internet). One call per task, output constrained
// by a JSON schema per task type, then assembled into the same shape a teacher would type.
// Generated tasks are drafts: the teacher reviews/edits before saving.

import { api } from "./api";
import { TASK_SPECS } from "./rubrics";
import type { NewTask, TaskType } from "./types";

export type Level = "intermediate" | "advanced";

export const TOPIC_IDEAS = [
  "campus life", "technology", "environment", "education", "health",
  "work and careers", "city life", "arts and culture", "science", "money and shopping",
];

const s = (maxLength: number) => ({ type: "string", maxLength });

const SCHEMAS: Record<TaskType, object> = {
  listen_repeat: {
    type: "object",
    properties: {
      title: s(60),
      context: s(200),
      sentences: { type: "array", items: s(140), minItems: 7, maxItems: 7 },
    },
    required: ["title", "context", "sentences"],
    additionalProperties: false,
  },
  interview: {
    type: "object",
    properties: { title: s(60), question: s(400) },
    required: ["title", "question"],
    additionalProperties: false,
  },
  email: {
    type: "object",
    properties: {
      title: s(60),
      situation: s(600),
      recipient: s(60),
      points: { type: "array", items: s(80), minItems: 3, maxItems: 3 },
    },
    required: ["title", "situation", "recipient", "points"],
    additionalProperties: false,
  },
  academic_discussion: {
    type: "object",
    properties: {
      title: s(60),
      course: s(60),
      professor: s(40),
      professor_post: s(700),
      students: {
        type: "array",
        minItems: 2,
        maxItems: 2,
        items: {
          type: "object",
          properties: { name: s(20), post: s(500) },
          required: ["name", "post"],
          additionalProperties: false,
        },
      },
    },
    required: ["title", "course", "professor", "professor_post", "students"],
    additionalProperties: false,
  },
};

const INSTRUCTIONS: Record<TaskType, string> = {
  listen_repeat:
    "Write a TOEFL-style 'Listen and Repeat' set: a short campus or daily-life context (e.g. a tour guide or a staff member giving information) and 7 sentences that person says. Sentences get gradually longer: about 5 words first, about 16–18 words last. Natural spoken English, no names that are hard to pronounce, no numbers written as digits.",
  interview:
    "Write one TOEFL-style 'Take an Interview' question: an interviewer asks the student's opinion or experience on a familiar topic. It must be answerable in 45 seconds with reasons and an example. Ask ONE clear question (it may have a short follow-up 'why?').",
  email:
    "Write a TOEFL-style 'Write an Email' task: a realistic situation (2–4 sentences, second person 'You …') that requires writing an email to a specific person, and exactly 3 things the email must do (short imperative phrases starting with a verb, e.g. 'explain the problem').",
  academic_discussion:
    "Write a TOEFL-style 'Academic Discussion' task: a professor's post (3–5 sentences) introducing a debatable question in a university course, ending with a clear question; then two students' replies (2–3 sentences each) taking DIFFERENT positions with one reason each. Students' names are simple first names.",
};

const LEVEL_TEXT: Record<Level, string> = {
  intermediate: "Use vocabulary and topics suitable for intermediate learners (CEFR B1–B2).",
  advanced: "Use more academic vocabulary and a more abstract topic (CEFR B2–C1).",
};

function assemble(type: TaskType, d: Record<string, unknown>): NewTask {
  const spec = TASK_SPECS[type];
  const base = {
    section: spec.section,
    taskType: type,
    title: String(d.title ?? "").trim() || spec.label,
    prepSeconds: spec.defaults.prepSeconds,
    responseSeconds: spec.defaults.responseSeconds,
  };
  switch (type) {
    case "listen_repeat":
      return {
        ...base,
        prompt: `${String(d.context ?? "").trim()} Listen to each sentence and repeat it exactly.`.trim(),
        material: (d.sentences as string[]).map((x) => x.trim()).filter(Boolean).join("\n"),
      };
    case "interview":
      return { ...base, prompt: String(d.question ?? "").trim(), material: null };
    case "email":
      return {
        ...base,
        prompt: [
          String(d.situation ?? "").trim(),
          `Write an email to ${String(d.recipient ?? "the person").trim()}.`,
          "",
          "In your email, do the following:",
          ...(d.points as string[]).map((p) => `- ${p.trim()}`),
        ].join("\n"),
        material: null,
      };
    case "academic_discussion": {
      const students = d.students as { name: string; post: string }[];
      return {
        ...base,
        prompt: `Your professor is teaching a class on ${String(d.course ?? "").trim()}. Write a post responding to the professor's question.\n\n${String(d.professor ?? "Professor").trim()}: ${String(d.professor_post ?? "").trim()}`,
        material: students.map((x) => `${x.name.trim()}: ${x.post.trim()}`).join("\n"),
      };
    }
  }
}

/** Generate one task draft. `avoid` = titles already generated (variety within a batch). */
export async function generateTask(
  modelId: string,
  type: TaskType,
  opts: { topic: string; level: Level; avoid: string[] },
): Promise<NewTask> {
  await api.llmStart(modelId);
  const topic = opts.topic.trim() || TOPIC_IDEAS[Math.floor(Math.random() * TOPIC_IDEAS.length)];
  const raw = await api.llmChat(
    [
      {
        role: "system",
        content: `You write original practice tasks for an English academy (TOEFL iBT 2026 style). Never copy real test items. ${LEVEL_TEXT[opts.level]} Output only the JSON.`,
      },
      {
        role: "user",
        content: `${INSTRUCTIONS[type]}\nTopic area: ${topic}.${opts.avoid.length ? `\nDo NOT repeat these existing tasks: ${opts.avoid.join("; ")}.` : ""}`,
      },
    ],
    SCHEMAS[type],
  );
  return assemble(type, JSON.parse(raw) as Record<string, unknown>);
}
