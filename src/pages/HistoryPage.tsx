// 기록: every attempt, filterable by student, plus the teacher-vs-AI agreement summary that
// feeds the report (only attempts where the teacher entered a band).
import { useEffect, useMemo, useState } from "react";
import type { Navigate } from "../App";
import PageHeader from "../components/PageHeader";
import { aiPrecision, parseReview } from "../lib/review";
import { api, inTauri } from "../lib/api";
import { fmtDate } from "../lib/format";
import { TASK_SPECS } from "../lib/rubrics";
import type { AttemptSummary, Student } from "../lib/types";

export default function HistoryPage({ navigate }: { navigate: Navigate }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [rows, setRows] = useState<AttemptSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!inTauri()) return;
    api.listStudents().then(setStudents).catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    if (!inTauri()) return;
    api.listAttempts(studentId).then(setRows).catch((e) => setError(String(e)));
  }, [studentId]);

  // Teacher-judged precision of AI corrections (✓/✗ on the 첨삭 page).
  const precision = useMemo(() => {
    const { ok, wrong } = aiPrecision(rows.map((r) => parseReview(r.teacherReview)));
    return ok + wrong > 0 ? { ok, wrong, p: ok / (ok + wrong) } : null;
  }, [rows]);

  const agreement = useMemo(() => {
    const pairs = rows.filter((r) => r.band != null && r.teacherScore != null) as Required<AttemptSummary>[];
    if (pairs.length === 0) return null;
    const diffs = pairs.map((p) => (p.band as number) - (p.teacherScore as number));
    const mae = diffs.reduce((s, d) => s + Math.abs(d), 0) / diffs.length;
    const bias = diffs.reduce((s, d) => s + d, 0) / diffs.length;
    const within = diffs.filter((d) => Math.abs(d) <= 0.5).length / diffs.length;
    return { n: pairs.length, mae, bias, within };
  }, [rows]);

  return (
    <>
      <PageHeader
        title="기록"
        subtitle="학생별 응시 기록과 교사–AI 채점 일치도."
        actions={
          <select
            value={studentId ?? ""}
            onChange={(e) => setStudentId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm"
          >
            <option value="">전체 학생</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        }
      />

      {agreement && (
        <section className="mb-6 grid grid-cols-4 gap-3 rounded-xl bg-white p-4 text-center shadow-sm">
          <Stat label="교사 채점 건수" value={`${agreement.n}건`} />
          <Stat label="평균 차이 (MAE)" value={agreement.mae.toFixed(2)} />
          <Stat label="±0.5 이내 일치" value={`${Math.round(agreement.within * 100)}%`} />
          <Stat
            label="AI 경향"
            value={Math.abs(agreement.bias) < 0.25 ? "치우침 없음" : agreement.bias > 0 ? `+${agreement.bias.toFixed(2)} 후함` : `${agreement.bias.toFixed(2)} 박함`}
          />
        </section>
      )}
      {precision && (
        <p className="-mt-3 mb-6 text-xs text-ink-600">
          교사 검토 기준 AI 교정 정확도: <span className="font-semibold">{Math.round(precision.p * 100)}%</span> (맞음 {precision.ok} · 틀림{" "}
          {precision.wrong})
        </p>
      )}

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-sprite-50 text-left text-xs text-ink-600">
            <tr>
              <th className="px-4 py-2">날짜</th>
              <th className="px-4 py-2">학생</th>
              <th className="px-4 py-2">문제</th>
              <th className="px-4 py-2 text-right">항목 점수</th>
              <th className="px-4 py-2 text-right">AI 밴드</th>
              <th className="px-4 py-2 text-right">교사</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-ink-400">
                  아직 응시 기록이 없어요.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => navigate({ page: "result", attemptId: r.id })}
                className="cursor-pointer border-t border-black/5 hover:bg-sprite-50"
              >
                <td className="px-4 py-2 text-ink-600">{fmtDate(r.createdAt)}</td>
                <td className="px-4 py-2">{r.studentName ?? <span className="text-ink-400">—</span>}</td>
                <td className="px-4 py-2">
                  <span className="mr-2 text-[11px] text-sprite-600">{TASK_SPECS[r.taskType]?.label}</span>
                  {r.taskTitle}
                </td>
                <td className="px-4 py-2 text-right text-xs text-ink-600 tabular-nums">
                  {r.criterionScores ? `${r.criterionScores.join(" · ")} (${r.criterionScores.reduce((a, b) => a + b, 0)})` : "—"}
                </td>
                <td className="px-4 py-2 text-right font-semibold">{r.band != null ? r.band.toFixed(1) : <span className="text-ink-400">미채점</span>}</td>
                <td className="px-4 py-2 text-right">{r.teacherScore != null ? r.teacherScore.toFixed(1) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-ink-400">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}
