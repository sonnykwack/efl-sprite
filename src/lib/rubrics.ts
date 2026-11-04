// Task specifications and analytic rubrics for the four TOEFL iBT (2026) task types
// the app supports. Criteria wording is our own, modelled on the public ETS score
// descriptors; scores are an ESTIMATE for practice, not an official ETS score.

import type { Section, TaskType } from "./types";

export interface Criterion {
  /** JSON key used in the LLM output schema. ASCII, stable — stored in the DB. */
  key: string;
  name: string;
  nameKo: string;
  /** Anchor descriptions for levels 5 / 3 / 1 (levels in between are interpolated). */
  anchors: { 5: string; 3: string; 1: string };
}

export interface TaskSpec {
  type: TaskType;
  section: Section;
  label: string;
  labelKo: string;
  /** How the response is scored. */
  scoring: "llm" | "accuracy";
  defaults: { prepSeconds: number; responseSeconds: number };
  promptLabel: string;
  promptPlaceholder: string;
  /** null → the task has no `material` field. */
  materialLabel: string | null;
  materialPlaceholder?: string;
  criteria: Criterion[];
  /** Target length for model answers. */
  sampleWords: string;
  /** Minimum expected words; shorter responses get content-score caps (scoring.ts). */
  minWords?: number;
  /** Criteria about content (capped for very short responses); others = language/tone. */
  contentCriteria?: string[];
}

export const SCALE_MAX = 5;

const LANGUAGE_USE: Criterion = {
  key: "language",
  name: "Language Use",
  nameKo: "언어 사용",
  anchors: {
    5: "Wide range of grammar and precise vocabulary; errors are rare and never obscure meaning.",
    3: "Adequate range; noticeable errors in grammar or word choice that occasionally obscure meaning.",
    1: "Very limited range; frequent errors make much of the response hard to understand.",
  },
};

export const TASK_SPECS: Record<TaskType, TaskSpec> = {
  listen_repeat: {
    type: "listen_repeat",
    section: "speaking",
    label: "Listen and Repeat",
    labelKo: "듣고 따라 말하기",
    scoring: "accuracy",
    defaults: { prepSeconds: 0, responseSeconds: 10 },
    promptLabel: "안내문",
    promptPlaceholder: "예: Listen to each sentence and repeat it exactly.",
    materialLabel: "따라 말할 문장 (한 줄에 한 문장)",
    materialPlaceholder: "The library closes at nine on weekdays.\nPlease submit your lab report by Friday.",
    criteria: [],
    sampleWords: "",
  },
  interview: {
    type: "interview",
    section: "speaking",
    label: "Take an Interview",
    labelKo: "인터뷰 응답",
    scoring: "llm",
    defaults: { prepSeconds: 0, responseSeconds: 45 },
    promptLabel: "인터뷰 질문",
    promptPlaceholder: "예: Some students prefer studying alone. Do you agree? Why?",
    materialLabel: null,
    criteria: [
      {
        key: "delivery",
        name: "Delivery & Fluency",
        nameKo: "전달력 · 유창성",
        anchors: {
          5: "Sustained, smooth speech at a natural pace; few hesitations, fillers or restarts.",
          3: "Generally sustained but with noticeable pauses, fillers or self-corrections.",
          1: "Fragmented speech; long pauses or very few words.",
        },
      },
      LANGUAGE_USE,
      {
        key: "development",
        name: "Topic Development",
        nameKo: "내용 전개",
        anchors: {
          5: "Directly answers the question with a clear position and well-connected reasons or examples.",
          3: "Answers the question but ideas are thin, general, or loosely connected.",
          1: "Barely addresses the question; little or no relevant support.",
        },
      },
    ],
    sampleWords: "100–120 words (about 45 seconds of speech)",
    minWords: 60,
    contentCriteria: ["development"],
  },
  email: {
    type: "email",
    section: "writing",
    label: "Write an Email",
    labelKo: "이메일 쓰기",
    scoring: "llm",
    defaults: { prepSeconds: 0, responseSeconds: 420 },
    promptLabel: "상황 및 요구사항",
    promptPlaceholder:
      "예: You ordered a textbook online but received the wrong edition. Write an email to the store. In your email:\n- describe the problem\n- explain why you need the correct edition\n- ask what they will do",
    materialLabel: null,
    criteria: [
      {
        key: "task",
        name: "Task Achievement",
        nameKo: "과제 수행",
        anchors: {
          5: "Clearly fulfils the purpose and fully addresses every required point.",
          3: "Addresses most required points; one is missing, vague, or underdeveloped.",
          1: "Purpose unclear; most required points are missing.",
        },
      },
      {
        key: "tone",
        name: "Organization & Tone",
        nameKo: "구성 · 어조",
        anchors: {
          5: "Logical order, appropriate greeting/closing, and a register well suited to the recipient.",
          3: "Mostly organized; register is sometimes inappropriate or inconsistent.",
          1: "Disorganized; register clearly inappropriate for the situation.",
        },
      },
      LANGUAGE_USE,
    ],
    sampleWords: "120–150 words",
    minWords: 100,
    contentCriteria: ["task"],
  },
  academic_discussion: {
    type: "academic_discussion",
    section: "writing",
    label: "Academic Discussion",
    labelKo: "학술 토론",
    scoring: "llm",
    defaults: { prepSeconds: 0, responseSeconds: 600 },
    promptLabel: "교수 질문",
    promptPlaceholder: "예: Should universities require all students to take a course in personal finance? Why or why not?",
    materialLabel: "학생 게시글 (2명)",
    materialPlaceholder: "Kelly: I think ...\nPaul: I disagree because ...",
    criteria: [
      {
        key: "contribution",
        name: "Relevant Contribution",
        nameKo: "토론 기여",
        anchors: {
          5: "Clear position that adds a new idea to the discussion rather than repeating classmates.",
          3: "Takes a position but largely restates classmates' ideas or drifts off topic.",
          1: "No clear position; mostly irrelevant to the professor's question.",
        },
      },
      {
        key: "support",
        name: "Support & Development",
        nameKo: "근거 · 전개",
        anchors: {
          5: "Well-elaborated reasons with specific, relevant examples; ideas clearly connected.",
          3: "Some reasons given but elaboration is limited or examples are generic.",
          1: "Little or no support for the position.",
        },
      },
      LANGUAGE_USE,
    ],
    sampleWords: "at least 100 words (aim for 120–150)",
    minWords: 100,
    contentCriteria: ["contribution", "support"],
  },
};

export const TASK_TYPES_BY_SECTION: Record<Section, TaskType[]> = {
  speaking: ["listen_repeat", "interview"],
  writing: ["email", "academic_discussion"],
};

/**
 * Mean criterion score (0–5) → estimated TOEFL 2026 band (1.0–6.0), piecewise linear.
 *
 * PROVISIONAL. v1 used band = 1 + 5·ratio, which mapped "all criteria 3/5" to 4.0 and even
 * "all 1/5" to 2.0 — measured as too generous (AD-1: AI 4.0 vs teacher 3.0–3.5; ES-1 weak
 * email: AI 4.0 vs intended ~2). This table follows the rubric wording (3 = "adequate" ≈
 * band 3.5) and agrees with the AD-1 teacher score. Re-fit it on the teacher's blind ES-1
 * scores (docs/sample-set.md) — keep it a table so refitting only changes numbers.
 */
export const BAND_MAP: [score: number, band: number][] = [
  [0, 1.0],
  [1, 1.5],
  [2, 2.5],
  [3, 3.5],
  [4, 4.5],
  [5, 6.0],
];

export function toBand(ratio: number): number {
  const s = Math.min(1, Math.max(0, ratio)) * 5;
  for (let i = 1; i < BAND_MAP.length; i++) {
    const [s0, b0] = BAND_MAP[i - 1];
    const [s1, b1] = BAND_MAP[i];
    if (s <= s1) return Math.round((b0 + ((s - s0) / (s1 - s0)) * (b1 - b0)) * 2) / 2;
  }
  return 6;
}
