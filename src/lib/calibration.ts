// Calibration anchors: short example responses with FIXED scores, shown to the model before
// it scores a real response. Small models collapse toward the middle of a scale ("everything
// is a 3"); seeing what a 1 and a 5 look like widens their use of the scale.
//
// Topics deliberately differ from every evaluation text (AD-1 and the held-out set ES-1),
// so anchors cannot leak answers into the measurements.

import type { TaskType } from "./types";

export interface Anchor {
  label: string;
  prompt: string;
  material?: string;
  response: string;
  scores: Record<string, number>;
  why: string;
}

export const ANCHORS: Partial<Record<TaskType, Anchor[]>> = {
  email: [
    {
      label: "weak",
      prompt:
        "You missed a quiz because you were sick. Write to Professor Lee. In your email:\n- explain what happened\n- ask whether you can take a make-up quiz\n- offer to provide a doctor's note",
      response: "Professor Lee, I was sick so I miss quiz. I want to take quiz again. When can I take? Please answer fast. Thanks.",
      scores: { task: 1, tone: 1, language: 2 },
      why: "Very short; the doctor's-note point is missing and the request is barely developed. Abrupt, demanding tone for a professor. Basic errors (miss → missed, article missing) but meaning is clear.",
    },
    {
      label: "adequate",
      prompt:
        "You missed a quiz because you were sick. Write to Professor Lee. In your email:\n- explain what happened\n- ask whether you can take a make-up quiz\n- offer to provide a doctor's note",
      response:
        "Dear Professor Lee,\nI am writing because I could not attend the quiz on Monday. I had a high fever on Sunday night and I went to the hospital in the morning. I am feeling better now. I know the quiz is important for our grade, so I want to ask if I can take a make-up quiz. I can come to your office any time this week. Also, I have a doctor's note, so I can send it to you if you need.\nThank you for your understanding.\nBest regards,\nJun",
      scores: { task: 4, tone: 3, language: 3 },
      why: "All three points addressed with some detail. Polite and organized, but simple and slightly informal ('Also,', 'if you need'). Mostly accurate, limited range.",
    },
    {
      label: "strong",
      prompt:
        "You missed a quiz because you were sick. Write to Professor Lee. In your email:\n- explain what happened\n- ask whether you can take a make-up quiz\n- offer to provide a doctor's note",
      response:
        "Dear Professor Lee,\nI'm writing to let you know that I missed Monday's quiz because I came down with a high fever over the weekend and spent the morning at the campus clinic. I'm recovering well and will be back in class on Wednesday.\nWould it be possible for me to take a make-up quiz? I'm available during your office hours on Thursday or at any other time that suits you. I've also obtained a note from the clinic doctor, which I'd be happy to forward if you need documentation.\nThank you for considering my request.\nBest regards,\nJun Park",
      scores: { task: 5, tone: 5, language: 5 },
      why: "Every point fully developed, ideal register for a professor, wide and accurate language.",
    },
  ],
  academic_discussion: [
    {
      label: "weak",
      prompt: "Should cities ban cars from downtown areas on weekends? Why or why not?",
      material:
        "Ana: Yes. Without cars, the air would be cleaner and people could walk safely.\nBen: No. Shops downtown would lose customers who drive in from the suburbs.",
      response: "I agree with Ana. Cars is bad for air. If no cars, air is clean. Also people can walk. So ban cars is good idea.",
      scores: { contribution: 1, support: 1, language: 2 },
      why: "Only repeats Ana's points; nothing new. No real reasons or examples. Frequent basic errors but understandable.",
    },
    {
      label: "adequate",
      prompt: "Should cities ban cars from downtown areas on weekends? Why or why not?",
      material:
        "Ana: Yes. Without cars, the air would be cleaner and people could walk safely.\nBen: No. Shops downtown would lose customers who drive in from the suburbs.",
      response:
        "I partly agree with Ben. Many people live far from downtown and they need a car to go shopping. But I think the city can solve this problem. For example, in my city there is a free shuttle bus from the big parking lot to the market on weekends, and the market became more crowded than before. So if the city makes parking lots outside and gives shuttle buses, people can still come and the air will be cleaner. I think this way is better than just banning cars.",
      scores: { contribution: 3, support: 3, language: 3 },
      why: "Takes a position and adds a compromise idea with a local example, but the reasoning is not developed in depth. Clear meaning, some informal connectors and simple structures.",
    },
    {
      label: "strong",
      prompt: "Should cities ban cars from downtown areas on weekends? Why or why not?",
      material:
        "Ana: Yes. Without cars, the air would be cleaner and people could walk safely.\nBen: No. Shops downtown would lose customers who drive in from the suburbs.",
      response:
        "Ben raises a fair concern, but I think the evidence points the other way: pedestrian zones often help local businesses. When people are not rushing between parking spaces, they tend to stay longer, browse more shops, and stop at cafés. A car-free weekend market in my hometown, for instance, doubled its foot traffic within a year, and several stores extended their weekend hours as a result. The real challenge is access for visitors from the suburbs, which cities can address with park-and-ride lots and frequent shuttles. With that support in place, a weekend ban would deliver Ana's environmental benefits without sacrificing the economic vitality Ben is worried about.",
      scores: { contribution: 5, support: 5, language: 5 },
      why: "Engages both classmates and adds a new argument, specific example with consequences, precise academic language.",
    },
  ],
};

/** Prompt section with the anchors for a task type (empty string if none). */
export function anchorText(taskType: TaskType): string {
  const list = ANCHORS[taskType];
  if (!list?.length) return "";
  const body = list
    .map((a, i) => {
      const scores = Object.entries(a.scores).map(([k, v]) => `${k}=${v}`).join(", ");
      return [
        `### Example ${i + 1} (${a.label})`,
        `Task: ${a.prompt}`,
        a.material ? `Classmates: ${a.material.replace(/\n/g, " / ")}` : "",
        `Response: ${a.response.replace(/\n/g, " ")}`,
        `Scores: ${scores}`,
        `Why: ${a.why}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
  return [
    "## Calibration examples (already scored by an experienced rater — match this standard; do NOT quote them)",
    body,
  ].join("\n");
}
