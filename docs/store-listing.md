# Microsoft Store 등록 정보 (Partner Center에 붙여 넣을 내용)

Store ID `9MZT0SB40M2W` · 패키지 `TaehoonKwack.EFLSprite` · 카테고리 **교육 (Education)**

> 상표 주의: 제품 이름·짧은 설명에는 "TOEFL"을 넣지 않습니다. 설명에서는 "TOEFL iBT 형식 연습"처럼
> 형식을 설명하는 데만 쓰고, 마지막 줄에 상표 고지를 둡니다.

---

## 1. 속성 (Properties)

| 항목 | 값 |
|---|---|
| 범주 | 교육 (Education) · 하위 범주: 언어 (있으면) |
| 개인정보처리방침 URL | https://github.com/sonnykwack/efl-sprite/blob/main/docs/privacy-policy.md |
| 웹사이트 | https://github.com/sonnykwack/efl-sprite |
| 지원 연락처 | https://github.com/sonnykwack/efl-sprite/issues |
| 시스템 요구 사항 (최소) | 메모리 8 GB, 저장 공간 6 GB, 마이크(스피킹) |
| 시스템 요구 사항 (권장) | 메모리 16 GB 이상, GPU(DirectX 12 / Vulkan 지원) |
| 제품 선언 | "이 앱은 인터넷 연결 없이도 작동합니다"는 **체크하지 않음** (첫 실행 시 모델 다운로드가 필요하므로) |

## 2. 연령 등급 설문 (IARC) 답변 가이드
- 앱 유형: 교육/참고 자료 (게임 아님)
- 폭력·성적 내용·약물·도박·욕설: 모두 **없음**
- 사용자 간 상호작용/채팅: **없음**
- 사용자 생성 콘텐츠 공유: **없음** (파일은 사용자가 앱 밖에서 직접 전달)
- 위치 공유: **없음** · 개인정보 수집: **없음**
- 디지털 상품 구매: **없음**
→ 예상 등급: 전체 이용가 / IARC 3+

## 3. 가격 및 사용 가능 여부
- 가격: **무료**
- 시장: 대한민국 (원하면 전체 시장)
- 공개 범위: 공개. 심사 통과 후 바로 공개되는 게 부담스러우면 **"숨김 — 링크가 있는 사람만"**을 고르면 됩니다.

## 4. 심사관 메모 (Notes for certification) — 영어로 입력

```
EFL Sprite is an on-device English speaking/writing practice app. All AI runs locally.

HOW TO TEST
1. On first launch the "시작하기" (Get started) page opens.
2. Click "추천 모델 한 번에 받기" (download recommended models, ~5 GB from huggingface.co).
   Download takes several minutes; models are data files (GGUF/ONNX), not executable code.
3. Click "예시 문제 추가" (add example tasks) — 4 sample tasks are created.
4. Go to "응시" (Practice), choose a writing task (e.g. "예시 · Email"), type a short answer
   and submit. Scoring takes 30 s – 2 min depending on hardware.
5. Speaking tasks use the microphone after the user presses "시작" (Start).
No account or sign-in is needed.

RESTRICTED CAPABILITY: runFullTrust
This is a desktop (Win32, Tauri) app. It starts two bundled inference engines as child
processes (llama-server.exe for the language model, whisper-cli.exe for speech recognition),
which are included in the package. runFullTrust is required to start them.

MICROPHONE: used only for speaking tasks, recordings stay on the device.
PRIVACY: no data leaves the device; no analytics. Policy:
https://github.com/sonnykwack/efl-sprite/blob/main/docs/privacy-policy.md
```

## 5. 스토어 목록 — 한국어 (ko-kr)

**제품 이름**: EFL Sprite

**짧은 설명** (최대 100자 권장)
```
인터넷 없이 내 PC에서 돌아가는 영어 스피킹·라이팅 AI 코치. 즉시 채점, 근거 있는 첨삭, 교사 첨삭까지.
```

**설명**
```
EFL Sprite는 영어 말하기·쓰기 연습을 위한 온디바이스 AI 코치입니다. 음성 인식과 AI 채점이 모두 내 PC 안에서 실행되어, 답안과 녹음이 외부로 전송되지 않습니다.

■ 시험 형식 그대로 연습
TOEFL iBT 2026 형식의 4가지 유형을 실제 시험처럼 타이머와 함께 연습합니다.
· Listen and Repeat — 들려주는 문장을 따라 말하기
· Take an Interview — 질문에 45초 동안 답하기
· Write an Email — 상황에 맞는 이메일 쓰기
· Academic Discussion — 토론 게시판에 의견 쓰기

■ 근거 있는 즉시 피드백
· 추정 밴드(1.0–6.0)와 항목별 점수, 그 점수의 근거가 된 내 문장
· 밑줄 친 부분을 누르면 고친 표현, 틀린 이유, 문법 원칙과 예문
· 학습자 영어 전용 문법 교정 모델과 규칙 검사로 문법 오류를 정확하게
· 분량·어휘 다양성·문장 구조·문법 정확성·연결어를 측정한 언어 지표와 개선 팁
· 이메일 요구사항을 다뤘는지 항목별로 확인
· 따라 말하기는 단어별로 맞음/틀림/빠뜨림 표시, 내 녹음 다시 듣기

■ 선생님과 학원을 위한 기능
· AI가 유형·주제·난이도에 맞춰 연습 문제 초안 생성
· 문제 세트를 파일 하나로 내보내 카카오톡·USB로 배포, 학생은 끌어다 놓기로 가져오기
· 교사 직접 첨삭: 틀린 부분을 드래그해 오류 유형·고친 표현·코멘트 입력, AI 교정 맞음/틀림 검토
· 학생별 기록, 교사–AI 점수 일치도 확인

■ 개인정보 걱정 없이
· 계정·로그인 없음, 광고·사용 통계 수집 없음
· 첫 실행 때 AI 모델만 내려받으면 이후 인터넷 없이 사용

※ 점수는 AI 추정치이며 공식 점수가 아닙니다.
※ 권장 사양: 메모리 16 GB 이상. 첫 실행 시 AI 모델 약 5 GB를 내려받습니다.
※ TOEFL은 ETS의 등록 상표이며, 이 앱은 ETS와 관련이 없고 ETS의 승인을 받지 않았습니다.
```

**제품 기능** (항목별 입력)
```
TOEFL iBT 2026 형식 4개 유형 연습 (스피킹 2, 라이팅 2)
기기 안에서 실행되는 AI 채점 — 답안이 외부로 나가지 않음
점수마다 근거가 된 학생 문장 표시
클릭하면 보이는 교정 이유·문법 원칙·예문
학습자 영어 전용 문법 교정 모델
언어 지표 측정(어휘 다양성, 문장 구조, 정확성, 연결어)
따라 말하기 단어별 정확도와 녹음 다시 듣기
AI 연습 문제 생성
문제 파일 내보내기·가져오기(.eflsprite)
교사 직접 첨삭과 AI 교정 검토
```

**검색어** (최대 7개)
```
영어 라이팅, 영어 스피킹, 에세이 첨삭, 영어 작문, AI 채점, 토플 연습, 영어 학원
```

**새로운 기능** (첫 버전)
```
첫 출시 버전입니다.
```

**저작권 및 상표 정보**
```
© 2026 Taehoon Kwack. TOEFL is a registered trademark of ETS. This product is not endorsed or approved by ETS.
```

## 6. Store listing — English (en-us)

**Product name**: EFL Sprite

**Short description**
```
An on-device AI coach for English speaking and writing. Instant scoring, evidence-based corrections, teacher review — no data leaves your PC.
```

**Description**
```
EFL Sprite is an on-device AI coach for English speaking and writing practice. Speech recognition and AI scoring run entirely on your PC, so your answers and recordings never leave your device.

PRACTICE IN TEST FORMAT
Practice four TOEFL iBT 2026-style tasks with real timers:
• Listen and Repeat — repeat the sentences you hear
• Take an Interview — answer a question in 45 seconds
• Write an Email — write an email for a given situation
• Academic Discussion — post your opinion in a class discussion

INSTANT, EVIDENCE-BASED FEEDBACK
• Estimated band (1.0–6.0), criterion scores, and the sentences of yours each score is based on
• Click an underlined phrase to see the correction, why it was wrong, the grammar rule and examples
• A grammar-correction model trained on learner English plus rule checks for accurate grammar feedback
• Measured language indicators (length, vocabulary range, sentence variety, accuracy, linking words) with tips
• Email requirements checked one by one
• Word-by-word accuracy for Listen and Repeat, with playback of your recording

FOR TEACHERS AND ACADEMIES
• AI drafts practice tasks by type, topic and level
• Export a task set as one file and share it by messenger or USB; students import it by drag and drop
• Teacher review: select a passage, choose the error type, write the correction and a comment; mark AI corrections right or wrong
• Records by student and teacher–AI score agreement

PRIVATE BY DESIGN
• No account, no ads, no analytics
• After the one-time model download, works offline

Scores are AI estimates, not official scores.
Recommended: 16 GB memory. About 5 GB of AI models are downloaded on first use.
TOEFL is a registered trademark of ETS. This product is not endorsed or approved by ETS.
```

**Search terms**
```
English writing, English speaking, essay feedback, AI scoring, TOEFL practice, ESL, grammar correction
```

## 7. 스크린샷 (최소 1장, 권장 4–6장)
- 크기: **1366×768 이상** (16:9 권장, PNG).
- **macOS 창 테두리(신호등 버튼·제목 표시줄·둥근 모서리)가 보이면 반려**됩니다(정책 10.1.1.3, 1차 심사에서 실제로 반려됨). Mac 캡처는 창 테두리를 잘라내거나 Windows에서 캡처하세요.
- 현재 등록한 구성(v0.1.1, 2560×1607 PNG, 첫 장이 썸네일)과 캡션(한국어 / English):
  1. 채점 결과 + 교정 카드 — 점수마다 근거, 틀린 곳은 클릭하면 이유까지 / Every score has evidence — click a mistake to see why
  2. 라이팅 응시(타이머·단어 수) — 실제 시험처럼, 타이머와 단어 수를 보며 작성 / Write like the real test, with a timer and word count
  3. 스피킹 응시(따라 말하기 녹음) — 듣고 따라 말하기, 녹음까지 한 번에 / Listen, repeat, and record in one place
  4. 따라 말하기 결과 — 단어별 정확도와 내 녹음 다시 듣기 / Word-by-word accuracy with your own recording
  5. 교사 첨삭 — 선생님이 직접 첨삭하고 AI 교정을 검토 / Teachers add their own corrections and review the AI
  6. 시작하기 — 모델 받기부터 첫 응시까지 4단계 / Four steps to your first practice
- 올리기 전 확인: 파일 경로의 사용자 이름(`/Users/…`), 학생 실명 등 개인 정보가 화면에 없는지.

## 8. 패키지
- 버전 태그(`v0.1.1` 등)를 올리면 실행되는 CI의 아티팩트 `efl-sprite-msix`에서 **`EFL-Sprite_<버전>_x64.msix`** (서명 없는 파일)을 업로드합니다. 브라우저가 "위험할 수 있는 파일"로 막으면 다운로드 목록에서 "유지"를 누릅니다.
  `_test.msix`와 `.cer`는 로컬 설치 테스트용이니 올리지 않습니다.
- 다시 제출할 때는 버전을 올려야 합니다 (`tauri.conf.json`, `package.json`, `Cargo.toml`의 `version`, 예: 0.1.1 → 0.1.2). 업데이트 제출 때는 "이 버전의 새로운 기능"도 함께 작성합니다.
