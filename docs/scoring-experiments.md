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
- First real run (MacBook Pro, CPU, 2026-11-06): generic 3-sentence learner sample with 7
  planted errors → **7/7 found**, plus a real missing article ("to library" → "to the library"),
  0 wrong corrections; 905 ms incl. model load. "don't → didn't" (past, given "Yesterday")
  instead of the planted "doesn't" — grammatical. Fixes after: label-width mismatch
  (output wider than config id2label), adjacent edits split per word, "two book → books"
  explained as plural (GECToR uses VB→VBZ for noun -s).
- To measure next: ES-1 re-scoring with v4 + grammar model.

## Korean feedback quality (2026-11-06)
- Teacher: scores now at the intended level, but feedback unnatural — "반응은 …" and Chinese
  output ("반응은 가난한人们的翻译结果：[") repeated in several fields.
- Causes: Qwen drifts into Chinese when unstable; literal "the response" → 반응; one long
  JSON-array translation call degenerated and the broken string filled several slots; no
  output validation.
- Fix (`src/lib/translate.ts`): charset grammar (Hangul + ASCII without `"`/`\` + curly
  quotes) — checked with llama.cpp's own json-schema-to-grammar converter; one call per text,
  concurrent; glossary (response → 답안) + 2 examples; validation (CJK/kana, Hangul ratio,
  meta-talk, length, duplicate outputs) with retry, then English fallback; deterministic
  반응 → 답안 post-fix; scorer told to address the student ("You …"), never "the response".
- Offline: the observed garbage, an English echo and meta-talk are rejected; a model that
  always returns garbage yields English originals, never broken text.

## ES-1 teacher scores, first comparison (2026-11-06, 7B v4 + GECToR, quick 1×)
| Task | AI | Teacher | Diff |
|---|---|---|---|
| Email 1 (strong, "Hi Mark") | 4.0 | 4.0 | 0 — but only because a FALSE "missing point" cap cut Task 5 → 3 |
| Email 1 (weak) | 4.0 | 3.5 | +0.5 |
| Email 2-A (polite, some errors) | 5.0 | 4.0 | +1.0 |
| Email 2-B (55 words, demanding) | 3.0 | 1.5 | +1.5 |
| AD 2 ×2, AD 3 ×2 | 3.5, 3.5, 4.0, 3.0 | same | 0 (4/4 exact) |
MAE 0.38, within ±0.5 75%, bias +0.38. All misses are emails.

Teacher notes: the model does not reliably tell whether a required point is in the email;
some corrections are incomprehensible (two-sentence quote + "주 건물 앞에 연구실을 추가하여…").

Causes found:
- Point coverage was one small field inside the long scoring JSON, judged without quoting.
  "ask about the next meeting" → missing despite "Could you let me know when the next meeting
  is scheduled?".
- 7B gave Organization & Tone 4/5 to "Hello manager. … I want answer quickly." and Language 3–4
  to error-heavy emails.
- Corrections: LLM quotes spanning sentences; deletions of correct words ("again",
  "at night"); categories not matching the edit; grammar-model edits on adjacent words split
  ("is → has", "a → been" explained as an article); translations that copied a few-shot
  example or capitalised English words ("NIGHT에"); 합니다체 mixed in.

Changes:
- `points.ts`: one focused call per required point, schema quote → status, code reconciles the
  verdict with the quote (a real quoted sentence is never "missing"; a failed call never caps).
- Caps: email demanding-tone phrases (rules.ts TONE: "Hello manager", "I want answer",
  "you must", "Please + verb." orders) ≥ 2 → tone ≤ 2, 1 → ≤ 3; writing grammar errors from
  GEC/rules per 100 words ≥ 8 → language ≤ 2, ≥ 4 → ≤ 3. Caps applied after the median.
- `tidy.ts`: LLM corrections narrowed to the changed words (+1 context word), multi-sentence
  spans dropped, pure deletions dropped when GEC ran, article/preposition categories
  recomputed from the aligned diff; adjacent GEC replacements joined ("is a → has been",
  verb form).
- Translation validation: reject copies of a worked example, missing quoted English, English
  words not in the source; first attempt must be 해요체.
- BAND_MAP refit 1: 2 → 2.0, 4 → 4.0 (AD bands unchanged; their means were 2.67–3.67).
- History shows per-criterion scores, so the next refit can use totals, not only bands.

Offline checks: the four bad corrections from the screenshot are dropped or narrowed
("have same" → "have the same", article); Email 2-B gets 3 tone hits, Email 1-B / 2-A none;
quoted sentence + "missing" → partial. Expected (not yet measured): Email 2-B 6/15 → 2.0,
Email 1-B 13/15 → 4.5, Email 2-A Language capped → ≈ 4.0.

## LLM corrections on a correct response (2026-11-06, AD 3 strong, teacher 3.5 = AI 3.5)
- Grammar model: 0 edits (right — the response is essentially correct). LLM: 4 items, all
  wrong: "library or cleaned" (agreement), "match" / "than counting" (fragment),
  "reflection essay → paper" (word choice). Asked for errors inside a long scoring prompt,
  the 7B model produces some whether or not they exist.
- Alternatives considered: a larger tagger (GECToR DeBERTa-large, ~3× size, no ONNX export
  published → own export + slower CPU inference) — it would not fix this, since the false
  items came from the LLM, not the tagger.
- Change (precision first): when the grammar model ran, grammar categories belong to it and
  to the rules; the LLM may only list word_choice / register / run_on / possessive /
  word_form (≤ 3, "an empty list is normal"), and each remaining item gets a separate short
  verification call (`verify.ts`: full sentence, reason → verdict error / unnatural /
  acceptable; failure = drop).
- Expected on this response: 3 items removed by category, "essay → paper" judged by the
  verifier. To measure: false items per correct response, and recall on Email 2-B.

## Email 2-B after precision-first (2026-11-06)
- 8 items, no invented ones: 3 tone rules (greeting, "Please + verb", "I want answer"),
  grammar model: start, can, maybe, in (the), want (to).
- Two grammar-model problems: (1) "It start" → "starts" in round 1, then "started" in round 2,
  which pulled "can" → "could"; the explanation kept round 1's agreement label. Fix
  (gec.rs): a word rewritten in an earlier round is not rewritten again. (2) "want → want to"
  inside the rule's full rewrite of "I want answer quickly" (and a misreading: the student
  meant "an answer"). Fix (merge): a rule rewrite supersedes grammar-model edits inside it
  whose words the rewrite no longer contains; "in → in the" inside "Please stop … in morning"
  is kept.

## Reference standard (2026-11-07)
- The teacher's ES-1 bands were holistic personal judgments on a 1–6 scale, not an application
  of the ETS rubric (the teacher has not taken the 2026 test). So the agreement figures so far
  measure "agreement with one experienced instructor", not "agreement with ETS".
- ETS's published guide for Write an Email / Academic Discussion is holistic, one 0–5 score per
  response (5 fully successful … 1 unsuccessful/telegraphic … 0 blank or off-topic); the app's
  3 analytic criteria + band table are our own design.
- Email 2-B after all fixes: 7/15 → band 2.5 (teacher 1.5). By the ETS descriptors it is
  intelligible and does the task with noticeable errors and little elaboration (≈ 2–3 of 5),
  so the gap is not tuned away.
- Decision: freeze scoring changes; for the final held-out set the rater(s) score with the ETS
  descriptors (0–5 per response), ideally two raters, and the report states human–human
  agreement next to human–AI agreement.

## Measured language features (2026-11-07)
Teacher: scoring still feels rough; wants length, context, vocabulary etc. used in a finer way.
Approach (as in ETS e-rater): code measures what can be measured exactly, the LLM judges content.
- `features.ts`: length vs minimum, lexical diversity (MATTR-50 + share of 7+-letter words,
  repeated content words), sentence variety (share of sentences with a subordinate/relative
  clause), accuracy (grammar-model + rule errors per 100 words), cohesion (distinct linking
  expressions). Each → 0–5 with provisional thresholds (MATTR-50 is ~0.75–0.85 for ordinary
  prose, so long-word share counts double).
- Shown to the student as "언어 지표" with what was measured and a tip; given to the LLM as
  <measured_features> before it scores.
- Consistency check: if the LLM's Language score differs from the indicator mean (vocabulary,
  variety, accuracy, cohesion) by ≥ 1.5, it moves ONE point toward it (shown to the student).
- Offline: ES-1 Email 2-B → indicators 2/3/1/2/1 (mean 1.8); an LLM Language 4 becomes 3,
  then the error-density cap applies. AD 3 strong → 5/5/5/5/2 (mean 4.25) vs LLM 3: no change.
- Larger model option: Qwen2.5-14B-Instruct Q4_K_M (≈ 9 GB), 2 slots × 6144 ctx so the KV
  cache fits; catalog `parallel`/`ctxPerSlot` per model.

### Caveat
AD-1 informed the v2/v3 prompt design, so it is no longer an unbiased test. Final numbers for
the report must come from held-out responses scored by the teacher (plan: Day 10, 11/12).
