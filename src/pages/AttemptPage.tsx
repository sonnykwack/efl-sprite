import PageHeader, { Placeholder } from "../components/PageHeader";

export default function AttemptPage() {
  return (
    <>
      <PageHeader title="응시" subtitle="학생을 선택하고 문제를 풉니다." />
      <Placeholder day="Day 4–5 (11/6–7)">
        학생 선택 → 문제 표시 → 스피킹: 준비/응답 타이머 + 마이크 녹음(16kHz WAV) / 라이팅: 타이머 달린
        입력창 → 제출 시 Whisper 전사 + LLM 채점 파이프라인 실행.
      </Placeholder>
    </>
  );
}
