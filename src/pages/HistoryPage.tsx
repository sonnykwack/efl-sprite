import PageHeader, { Placeholder } from "../components/PageHeader";

export default function HistoryPage() {
  return (
    <>
      <PageHeader title="기록" subtitle="학생별 · 문제별 응시 기록 (선생님용)." />
      <Placeholder day="Day 6–7 (11/8–9)">
        학생 목록 → 응시 기록 타임라인 → 점수 추이. SQLite의 attempts / evaluations 테이블을 조회합니다.
      </Placeholder>
    </>
  );
}
