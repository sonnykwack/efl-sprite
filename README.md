# EFL Sprite

온디바이스 AI로 영어 **스피킹·라이팅** 답안을 채점하는 데스크톱 앱.
Whisper(음성 인식) + 로컬 LLM(채점·모범 답안)이 모두 PC 안에서 돌아가며, 녹음과 답안은 외부로 전송되지 않습니다.

- 스택: Tauri v2 (Rust) · React + TypeScript + Tailwind v4 · whisper.cpp · llama.cpp · SQLite
- 배포: Microsoft Store (MSIX)
- 단국대학교 소프트웨어학과 졸업 프로젝트

## 처음 세팅 (Mac)

```bash
# 1) 필수 도구
xcode-select --install          # git, clang
brew install cmake node         # node 18 이상
curl https://sh.rustup.rs -sSf | sh

# 2) 의존성 + 엔진
npm install
npm run fetch-engines           # llama.cpp 다운로드 + whisper.cpp(Metal) 빌드, 3~5분

# 3) 실행
npm run tauri dev
```

## 처음 세팅 (Windows)

1. [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) — "C++를 사용한 데스크톱 개발" 체크
2. [Rust](https://rustup.rs) · [Node.js LTS](https://nodejs.org) · [Git](https://git-scm.com) 설치
3. PowerShell에서:

```powershell
npm install
npm run fetch-engines           # llama.cpp(Vulkan) + whisper.cpp(CPU) 다운로드
npm run tauri dev
```

> Windows에서 Whisper도 GPU로 돌리려면 [Vulkan SDK](https://vulkan.lunarg.com)와 CMake를 설치한 뒤
> `$env:WHISPER_VULKAN=1; npm run fetch-engines`

## 첫 실행 확인

앱 → **설정 · 모델** → Whisper small.en, Qwen2.5 3B 다운로드 →
**엔진 연결 테스트**의 두 버튼이 모두 결과를 내면 엔진 연결 완료.

## 폴더 구조

```
src/                    React UI (pages/, components/, lib/api.ts)
src-tauri/
  src/                  Rust 백엔드 (paths, models, db, engine/)
  catalog/models.json   다운로드 가능한 모델 목록
  engines/<os>/         엔진 바이너리 (fetch-engines가 채움, git 제외)
  tauri*.conf.json      공통 설정 + OS별 설정
scripts/fetch-engines.mjs
.github/workflows/      Mac/Windows 자동 빌드
```

개발 규칙(크로스플랫폼 주의사항)은 [`CLAUDE.md`](./CLAUDE.md)에 있습니다.
