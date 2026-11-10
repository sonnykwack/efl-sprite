import { useEffect, useMemo, useState } from "react";
import type { Navigate } from "../App";
import PageHeader from "../components/PageHeader";
import { aiPrecision, parseReview } from "../lib/review";
import { api, inTauri } from "../lib/api";
import { fmtDate } from "../lib/format";
import { TASK_SPECS } from "../lib/rubrics";
import type { AttemptSummary, Student } from "../lib/types";

interface HistoryPageProps {
  navigate: Navigate;
}

interface StatCardProps {
  label: string;
  value: string;
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="rounded-xl border border-black/5 bg-white p-4 text-center shadow-sm">
      <div className="text-xs text-ink-400">{label}</div>
      <div className="mt-1 text-lg font-bold text-ink-900">{value}</div>
    </div>
  );
}

export default function HistoryPage({ navigate }: HistoryPageProps) {
  const isDesktopApp = inTauri();

  const [studentList, setStudentList] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [attemptRows, setAttemptRows] = useState<AttemptSummary[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isDesktopApp) {
      return;
    }
    let isDisposed = false;
    api
      .listStudents()
      .then((students) => {
        if (!isDisposed) {
          setStudentList(students);
        }
      })
      .catch((err: unknown) => {
        if (!isDisposed) {
          setErrorMessage(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      isDisposed = true;
    };
  }, [isDesktopApp]);

  useEffect(() => {
    if (!isDesktopApp) {
      return;
    }
    let isDisposed = false;
    setErrorMessage(null);

    api
      .listAttempts(selectedStudentId)
      .then((rows) => {
        if (!isDisposed) {
          setAttemptRows(rows);
        }
      })
      .catch((err: unknown) => {
        if (!isDisposed) {
          setErrorMessage(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [isDesktopApp, selectedStudentId]);

  const teacherPrecisionStats = useMemo(() => {
    const reviewPayloads = attemptRows.map((row) =>
      parseReview(row.teacherReview)
    );
    const { ok, wrong } = aiPrecision(reviewPayloads);
    if (ok + wrong === 0) {
      return null;
    }
    return {
      okCount: ok,
      wrongCount: wrong,
      accuracyRatio: ok / (ok + wrong),
    };
  }, [attemptRows]);

  const teacherAgreementSummary = useMemo(() => {
    const scoredPairs = attemptRows.filter(
      (row): row is AttemptSummary & { band: number; teacherScore: number } =>
        row.band !== null && row.teacherScore !== null
    );

    if (scoredPairs.length === 0) {
      return null;
    }

    const differences = scoredPairs.map(
      (item) => item.band - item.teacherScore
    );
    const meanAbsoluteError =
      differences.reduce((acc, current) => acc + Math.abs(current), 0) /
      scoredPairs.length;
    const scoreBias =
      differences.reduce((acc, current) => acc + current, 0) /
      scoredPairs.length;
    const withinToleranceRatio =
      differences.filter((val) => Math.abs(val) <= 0.5).length /
      scoredPairs.length;

    let biasLabel = "치우침 없음";
    if (Math.abs(scoreBias) >= 0.25) {
      biasLabel =
        scoreBias > 0
          ? `+${scoreBias.toFixed(2)} 후함`
          : `${scoreBias.toFixed(2)} 박함`;
    }

    return {
      totalCount: scoredPairs.length,
      mae: meanAbsoluteError,
      withinRatio: withinToleranceRatio,
      biasText: biasLabel,
    };
  }, [attemptRows]);

  return (
    <div>
      <PageHeader
        title="기록"
        subtitle="학생별 응시 기록과 교사–AI 채점 일치도."
        actions={
          <select
            value={selectedStudentId ?? ""}
            onChange={(e) => {
              const rawValue = e.target.value;
              setSelectedStudentId(rawValue ? Number(rawValue) : null);
            }}
            className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm text-ink-900 focus:outline-none focus:ring-1 focus:ring-sprite-500"
          >
            <option value="">전체 학생</option>
            {studentList.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
              </option>
            ))}
          </select>
        }
      />

      {teacherAgreementSummary ? (
        <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <StatCard
            label="교사 채점 건수"
            value={`${teacherAgreementSummary.totalCount}건`}
          />
          <StatCard
            label="평균 차이 (MAE)"
            value={teacherAgreementSummary.mae.toFixed(2)}
          />
          <StatCard
            label="±0.5 이내 일치"
            value={`${Math.round(teacherAgreementSummary.withinRatio * 100)}%`}
          />
          <StatCard
            label="AI 경향"
            value={teacherAgreementSummary.biasText}
          />
        </section>
      ) : null}

      {teacherPrecisionStats ? (
        <p className="mb-6 text-xs text-ink-600">
          교사 검토 기준 AI 교정 정확도:{" "}
          <span className="font-semibold text-ink-900">
            {Math.round(teacherPrecisionStats.accuracyRatio * 100)}%
          </span>{" "}
          (맞음 {teacherPrecisionStats.okCount} · 틀림{" "}
          {teacherPrecisionStats.wrongCount})
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-black/5 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-sprite-50 text-xs text-ink-600">
            <tr>
              <th className="px-4 py-3 font-medium">날짜</th>
              <th className="px-4 py-3 font-medium">학생</th>
              <th className="px-4 py-3 font-medium">문제</th>
              <th className="px-4 py-3 text-right font-medium">항목 점수</th>
              <th className="px-4 py-3 text-right font-medium">AI 밴드</th>
              <th className="px-4 py-3 text-right font-medium">교사</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {attemptRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-400">
                  아직 응시 기록이 없어요.
                </td>
              </tr>
            ) : (
              attemptRows.map((row) => {
                const totalScoreSum = row.criterionScores
                  ? row.criterionScores.reduce((acc, curr) => acc + curr, 0)
                  : null;
                const specLabel = TASK_SPECS[row.taskType]?.label ?? row.taskType;

                return (
                  <tr
                    key={row.id}
                    onClick={() =>
                      navigate({ page: "result", attemptId: row.id })
                    }
                    className="cursor-pointer transition hover:bg-sprite-50"
                  >
                    <td className="px-4 py-3 text-ink-600">
                      {fmtDate(row.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-ink-900">
                      {row.studentName ?? (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-900">
                      <span className="mr-2 text-xs font-semibold text-sprite-600">
                        {specLabel}
                      </span>
                      <span>{row.taskTitle}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-ink-600 tabular-nums">
                      {row.criterionScores && totalScoreSum !== null ? (
                        <span>
                          {row.criterionScores.join(" · ")} ({totalScoreSum})
                        </span>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-ink-900">
                      {row.band !== null ? (
                        row.band.toFixed(1)
                      ) : (
                        <span className="text-ink-400">미채점</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-ink-900">
                      {row.teacherScore !== null ? (
                        row.teacherScore.toFixed(1)
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {errorMessage ? (
        <p className="mt-4 text-xs font-medium text-red-600">{errorMessage}</p>
      ) : null}
    </div>
  );
}