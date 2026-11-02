# EFL Sprite — notes for Claude Code

On-device TOEFL-style **speaking & writing** coach for an English academy.
Tauri v2 (Rust) + React/TypeScript/Tailwind v4. Inference: whisper.cpp (`whisper-cli`)
and llama.cpp (`llama-server`) run as child processes. Target store: **Microsoft Store (MSIX)**.
Developed on macOS, shipped on Windows. Capstone deadline: **2026-11-17**.

## Layout
- `src/` — React UI. All backend calls go through `src/lib/api.ts`; shared types in `src/lib/types.ts`.
- `src-tauri/src/`
  - `paths.rs` — the ONLY place filesystem locations are computed.
  - `models.rs` — closed model catalog (`catalog/models.json`) + downloader.
  - `engine/whisper.rs`, `engine/llama.rs` — engine processes. `engine/mod.rs` has the spawn helper.
  - `db.rs` — SQLite (rusqlite, bundled) with `PRAGMA user_version` migrations.
- `src-tauri/engines/<os>/` — engine binaries, fetched by `npm run fetch-engines`, git-ignored.
  `tauri.<os>.conf.json` maps the current OS's folder to `<resources>/engines/`.
- `.github/workflows/build.yml` — macOS + Windows build on every push.

## Cross-platform rules (macOS dev ↔ Windows ship) — follow on every change
1. Paths: `PathBuf::join` only. Never hard-code `/` or `\\`, never hard-code user dirs.
   Data → `paths::data_dir` (app_data_dir). Engines → `paths::engines_dir` (resource_dir).
2. Executables: always `paths::exe("name")` (adds `.exe` on Windows).
3. Spawning engines: always `engine::command(bin, cwd)` — sets `CREATE_NO_WINDOW` on Windows
   (otherwise a console window flashes) and pins the working directory.
4. Engine file arguments: relative + ASCII via `engine::rel_arg(path, data_dir)`.
   Windows user folders are often Korean (`C:\Users\홍길동`); C++ engines may open paths with
   the ANSI code page and fail. Copy external inputs into `data_dir/tmp/` with ASCII names first.
5. Windows cannot rename/delete open files: close handles before `rename`, remove target first,
   stop `llama-server` before deleting its model. `llama::stop` runs on app exit.
6. Text: UTF-8 everywhere, LF line endings (`.gitattributes`). Decode process output with
   `from_utf8_lossy`.
7. Serde: Rust structs use `#[serde(rename_all = "camelCase")]`; keep `src/lib/types.ts` in sync.
8. Tauri command args arrive camelCase from JS (`wavPath`) → snake_case in Rust (`wav_path`).
9. No platform-only crates without `#[cfg(...)]` guards; CI must stay green on both OSes.
10. WebView differences: Windows = WebView2 (Chromium), macOS = WKWebView (Safari).
    Avoid bleeding-edge CSS/JS; Vite targets chrome105 / safari15.

## Commands
- `npm install` · `npm run fetch-engines` (once per machine; needs CMake + git on macOS)
- `npm run tauri dev` — run the app · `npm run build` — typecheck + bundle UI
- `cd src-tauri && cargo check` — fast Rust check · `npx tauri build` — full bundle

## Scoring design (core of the project)
Task types follow TOEFL iBT 2026: `listen_repeat`, `interview` (speaking); `email`,
`academic_discussion` (writing). Specs + rubrics: `src/lib/rubrics.ts`.
- `listen_repeat`: NO LLM. Whisper transcript vs target sentence, word-level Levenshtein
  (`src/lib/accuracy.ts`) → accuracy %.
- Others: `src/lib/scoring.ts`. 3 analytic criteria, each 0–5, output grammar-constrained by a
  JSON schema (`llm_chat(messages, jsonSchema)` → llama-server `response_format: json_schema`).
- Per criterion the schema order is `evidence` → `comment` → `score`: quote FIRST, then score.
  Never ask for a bare score. Key order survives because serde_json has `preserve_order` — keep it.
- Evidence quotes are checked against the response (`groundedShare`) to detect invented quotes.
- Speaking: fluency proxies (WPM, fillers) are computed and given to the LLM; pronunciation is
  not assessed by the LLM (documented limitation).
- Band = linear map of total/max onto 1.0–6.0 (0.5 steps). Always labelled an estimate, not ETS.
- Feedback language: Korean by default (`lang: "ko"`), evidence stays verbatim English.
- `evaluations.teacher_score` stores the teacher's score for the agreement study in the report.
- Settings → 채점 실험실 measures consistency (N runs, mean ± SD), grounding %, latency.

## Plan (2026-11)
| Day | Date | Milestone |
|---|---|---|
| 1 | 11/3 | Scaffold + CI green on macOS & Windows |
| 2 | 11/4 | Engines: fetch script works on both OSes; Settings → sample transcription + one LLM sentence |
| 3 | 11/5 | Model download UX, GPU detection (`llama-server --list-devices`) |
| 4–5 | 11/6–7 | Task CRUD, attempt screen (timers, mic → 16 kHz WAV), scoring pipeline |
| 6–7 | 11/8–9 | Result screen, sample answers, history, teacher view |
| 8 | 11/10 | Error handling, onboarding |
| 9 | 11/11 | MSIX packaging (mic capability), install test on Windows |
| 10 | 11/12 | Teacher-vs-app agreement data |
| 11–12 | 11/13–14 | Store listing + submission |
| 13–14 | 11/15–16 | Report/slides; resubmission buffer |

Product name: **EFL Sprite** · identifier `com.xogns.eflsprite`. Never put "TOEFL"/"ETS" in the
product name (trademark); "TOEFL-style practice" in descriptions is fine.
