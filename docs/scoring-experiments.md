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
| v3 | ko | _pending_ | | | | | | | |
| v3 | ko (7B) | _pending_ | | | | | | | |

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

### Caveat
AD-1 informed the v2/v3 prompt design, so it is no longer an unbiased test. Final numbers for
the report must come from held-out responses scored by the teacher (plan: Day 10, 11/12).
