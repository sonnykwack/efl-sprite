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

| v3 + rules + snap, parallel ×3 | ko | 3.00 ± 0.00 | 3.00 ± 0.00 | 3.00 ± 0.00 | 4.00 | 4.0 | 13.7 (dupes) | 67% → 96% | 74 (parallel) |

Total for 3 samples + translation: 3B-v3 63.6 s, 7B-v3 140.0 s (sequential), 7B hybrid 92.8 s
(parallel, −34%).

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

### Hybrid run (2026-11-04, 7B)
- Zero variance (SD 0 on all criteria). All five teacher points now covered (fragment, "so",
  "thing", "some" by rules; shallow reasoning by the LLM analysis).
- Grounding 67% raw → 96% after snapping.
- Band 4.0 vs teacher 3.0–3.5. Criterion scores (3/3/3) look reasonable; the linear
  total→band map is probably too generous. NOT re-fitted on one sample — calibrate the
  mapping on the held-out teacher-scored set (Day 10).
- Parallel slots: per-request time 42 s → 74 s, total 140 s → 93 s.
- Issues fixed afterwards: duplicate corrections (LLM whole-sentence rewrite + rule on the
  same "Because" fragment) → span-based merge (rules first, then most specific LLM item,
  ≥ 60% overlap = duplicate, reading order); snapped quotes spilling into the next sentence
  ("… students face. Also") → trimmed; LLM corrections capped at 6. Replay of this run:
  12 distinct corrections, none duplicated.
- Given SD 0, a single sample may be enough for 7B: plan "quick (1×)" vs "precise (3×)".

## ES-1 first pass (2026-11-04, 7B, v3 hybrid, quick 1×) — teacher feedback
- 8 answers scored 3.5–5.0 although designed levels span ~2–5; Email 2-B (55 words,
  demanding tone, intended ~2) got **4.0**. Teacher: "scores too generous overall".
- Corrections: hover did not show the fix (macOS WKWebView shows no `title` tooltips) and
  there was no explanation of WHY each phrase was wrong.

### Changes → prompt v4
- Calibration anchors (`src/lib/calibration.ts`): scored weak / adequate / strong examples for
  email and academic discussion, on topics disjoint from AD-1 and ES-1.
- "Use the full scale" instruction; required-points coverage for emails.
- Deterministic caps: < 50% of min words → content ≤ 1, < 80% → ≤ 2; missing email points cap
  Task Achievement. Shown to the student with the reason.
- Band table (`BAND_MAP`): mean criterion score 3 → 3.5 (was 4.0), 2 → 2.5, 1 → 1.5.
  Provisional — refit on the teacher's blind ES-1 scores.
- Error taxonomy (`src/lib/grammarGuide.ts`): the model classifies (11 categories) and writes
  a one-line sentence-specific reason; the principle text is curated, not generated.
- UI: click an underlined phrase → card with word-level diff, reason, principle, examples.
- Offline replay of Email 2-B: fully lenient model output (3/3/3) → band 3.0 (was 4.0) from caps
  + table alone; with an anchored-style output (2/1/2) → **2.0**.

## Grammar model (2026-11-06)
Why: across runs the 7B LLM missed learner errors (fragment, "so", vague words) and sometimes
"corrected" correct text. Candidates (reported CoNLL-2014 F0.5 on learner English):
GECToR RoBERTa ≈ 0.52 vs LanguageTool ≈ 0.17; Harper (rules) not evaluated on learner text.
Chosen: GECToR (letheviet/gector-roberta-base-5k-onnx, MIT; gotutiyan/gector port).
- Tags → taxonomy by code (`gecMap.ts`); fixed Korean reasons; LLM keeps tone/word choice.
- Verified here: tokenizer/tag/edit logic unit tests; full ONNX Runtime 1.31.1 path with a
  synthetic GECToR-shaped model (caught a repeated-insertion bug: "pay a a a" → guard added).
- To measure on the Mac: Settings → 문법 모델 테스트 (latency, edits), then ES-1 re-scoring.

### Caveat
AD-1 informed the v2/v3 prompt design, so it is no longer an unbiased test. Final numbers for
the report must come from held-out responses scored by the teacher (plan: Day 10, 11/12).
