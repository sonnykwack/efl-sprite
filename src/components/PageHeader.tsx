import type { ReactNode } from "react";

export default function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-600">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}

export function Placeholder({ day, children }: { day: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-sprite-300 bg-white p-8 text-sm text-ink-600">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-sprite-600">
        {day}에 구현 예정
      </div>
      {children}
    </div>
  );
}
