# Scoring experiments log

Measurements from Settings → 채점 실험실. Each row = 3 single-sample runs of the same
response; "final" = per-criterion median of the 3 runs (what the app shows).
Criteria: Contribution / Support / Language, 0–5 each. Band = linear map to 1.0–6.0.

## Sample AD-1 (Academic Discussion, online vs. classroom courses, ~130 words)
Text: `src/components/ScoringLab.tsx` (`SAMPLE_TASK`, `SAMPLE_RESPONSE`).

### Teacher reference (TOEFL instructor, 2026-11-02)
- **Band 3.0–3.5**
- Notes: sentence fragment starting with "Because"; subject–verb agreement ("many of us was");
  "so" → "therefore / thus" preferred; "thing" — vocabulary could be improved; missing
  possessive ("students face"); "some" — better word available; reasons lack depth.

### Model runs — Qwen2.5-3B-Instruct Q4_K_M, Apple Silicon (Metal)
| Prompt | Lang | Contribution | Support | Language | Mean band | Final band | Corrections | Grounded | s/run |
|---|---|---|---|---|---|---|---|---|---|
| v1 | ko | 1.67 ± 0.94 | 1.00 ± 0.00 | 1.67 ± 0.94 | 2.33 | — | 0 | 100% | 5.2 |
| v2 | ko | 3.00 ± 0.00 | 1.67 ± 0.94 | 3.00 ± 0.00 | 3.67 | 3.5 | 3 | 67% | 7.7 |
| v2 | en | 3.00 ± 0.00 | 2.00 ± 0.82 | 2.33 ± 0.94 | 3.50 | 3.5 | 3.7 | 81% | 8.7 |
| v3 | ko | 2.33 ± 0.94 | 2.67 ± 0.47 | 3.00 ± 0.00 | 3.67 | 4.0 | 7.7 (junk) | 33% | 19.5 |

### Model runs — Qwen2.5-7B-Instruct Q4_K_M, Apple Silicon (Metal)
| Prompt | Lang | Contribution | Support | Language | Mean band | Final band | Corrections | Grounded | s/run |
|---|---|---|---|---|---|---|---|---|---|
| v3 | ko | 3.33 ± 0.47 | 3.00 ± 0.00 | 2.33 ± 0.47 | 3.83 | **3.5** | 6.7 | 57% | 42.2 |

Total for 3 sequential samples + translation: 3B-v3 63.6 s, 7B-v3 140.0 s.

### Observations
- v1: ~1 band below the teacher; comments generic or wrong (told the student to use
  "I believe" in a sentence that already does); none of the real grammar errors flagged.
- v2: band within the teacher range. Caught agreement and possessive errors. Missed the
  fragment, register ("so"), and vague vocabulary — the teacher's main points.
  Support scored 1 despite a concrete personal example (statistics class); comments copied
  rubric anchor text; one "error" quoted a classmate's post (caught by the grounding check).
  Korean vs English output: same scores → translation step does not hurt scoring.
- v3 changes: analysis before scoring, tagged blocks, typed corrections with a teacher-derived
  checklist (generic examples only — no phrases from AD-1, to avoid leakage).

- v3 on 3B: overloaded — duplicated/incorrect corrections ("hard → harder" ×3), quotes taken
  from its own corrected analysis (grounding 33%), band above the teacher range.
- v3 on 7B: best result. Every criterion SD ≤ 0.47, final band 3.5 (teacher 3.0–3.5).
  Analysis recognised the statistics-class example and the shallow reasoning (same point the
  teacher made). Corrections real (agreement ×2, comparative, article, "not as … as").
  Still missed: the "Because" fragment, "so" → "therefore", "thing", "some", possessive.
  Quotes often in corrected form (grounding 57%). Too slow: 140 s for 3 samples.

### Changes after D/E (hybrid scoring)
- Rule-based checks (`src/lib/rules.ts`) for fragments, informal connectors/openers and vague
  words — offline replay on AD-1 catches the fragment, "so", "Also/But", "thing", "some",
  "very hard". Possessive still LLM-only.
- Quote snapping (`src/lib/snap.ts`): model quotes are mapped to the closest original span;
  report raw grounding AND after-snap grounding. Offline replay of a 7B-style output:
  evidence grounding raw 33% → 100% after snapping; "students are understanding" (quoted in
  corrected form) recovered as "students is understanding".
- llama-server `--parallel 3`: the 3 samples run concurrently.
- Per-model prompt (catalog `prompt`): 3B → v2, 7B → v3. 7B is now the recommended model.

### Caveat
AD-1 informed the v2/v3 prompt design, so it is no longer an unbiased test. Final numbers for
the report must come from held-out responses scored by the teacher (plan: Day 10, 11/12).
