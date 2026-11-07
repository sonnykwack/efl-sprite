// Example tasks, one per type, added from the 시작하기 page so a new user (or a Store
// reviewer) can try every feature in a minute. Original texts, not taken from ETS material,
// and disjoint from the evaluation set (docs/sample-set.md) and calibration anchors.
import { api } from "./api";
import { TASK_SPECS } from "./rubrics";
import type { NewTask, TaskType } from "./types";

const task = (taskType: TaskType, title: string, prompt: string, material: string | null): NewTask => ({
  section: TASK_SPECS[taskType].section,
  taskType,
  title,
  prompt,
  material,
  prepSeconds: TASK_SPECS[taskType].defaults.prepSeconds,
  responseSeconds: TASK_SPECS[taskType].defaults.responseSeconds,
});

export const SAMPLE_TASKS: NewTask[] = [
  task(
    "listen_repeat",
    "예시 · Listen & Repeat — Library tour",
    "You are new at the university. A librarian is showing you around the library. Listen to each sentence and repeat it exactly.",
    [
      "Welcome to the main library.",
      "The front desk is open until ten.",
      "You can borrow up to five books at a time.",
      "Quiet study rooms are on the second floor.",
      "Please return your books before the due date.",
    ].join("\n"),
  ),
  task(
    "interview",
    "예시 · Interview — Where do you study?",
    "Some students prefer to study in a library, while others prefer to study at home. Which do you prefer, and why? Give specific reasons and examples.",
    null,
  ),
  task(
    "email",
    "예시 · Email — Group project problem",
    [
      "You are taking a biology class. One member of your project group has not done his part, and the presentation is next Tuesday. Write an email to your professor, Dr. Lee.",
      "",
      "In your email, do the following:",
      "- explain the problem",
      "- describe what your group has already tried",
      "- ask for advice or a solution",
    ].join("\n"),
    null,
  ),
  task(
    "academic_discussion",
    "예시 · Academic Discussion — Phones in class",
    "Your professor is teaching a class on education. Write a post responding to the professor's question.\n\nDr. Park: Many schools are banning smartphones during class. Supporters say phones distract students, while others say phones can be useful learning tools. Should schools ban phones in class? Why or why not?",
    [
      "Mina: I think phones should be banned. Even when students use them for class, they end up checking messages and games, and it is hard for teachers to notice.",
      "Daniel: I disagree. Phones let us look up information instantly and use learning apps. Schools should teach students how to use phones responsibly instead of banning them.",
    ].join("\n"),
  ),
];

/** Add the examples that are not there yet (matched by title). Returns how many were added. */
export async function addSampleTasks(): Promise<number> {
  const existing = new Set((await api.listTasks()).map((t) => t.title));
  let added = 0;
  for (const t of SAMPLE_TASKS) {
    if (existing.has(t.title)) continue;
    await api.createTask(t);
    added++;
  }
  return added;
}
