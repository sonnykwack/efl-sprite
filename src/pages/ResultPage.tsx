import PageHeader, { Placeholder } from "../components/PageHeader";

export default function ResultPage() {
  return (
    <>
      <PageHeader title="채점 결과" subtitle="루브릭 항목별 점수와 근거, 모범 답안." />
      <Placeholder day="Day 6–7 (11/8–9)">
        전사 텍스트 · 루브릭 항목별(Delivery / Language Use / Topic Development) 근거 인용 → 점수 ·
        총평 · “모범 답안 생성” 버튼.
      </Placeholder>
    </>
  );
}
