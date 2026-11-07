export type PageKey = "home" | "review" | "tasks" | "attempt" | "result" | "history" | "settings";

const ITEMS: { key: PageKey; label: string; hint: string }[] = [
  { key: "home", label: "시작하기", hint: "Start" },
  { key: "tasks", label: "문제 관리", hint: "Tasks" },
  { key: "attempt", label: "응시", hint: "Practice" },
  { key: "result", label: "채점 결과", hint: "Feedback" },
  { key: "history", label: "기록", hint: "History" },
];

interface Props {
  current: PageKey;
  onNavigate: (key: PageKey) => void;
}

export default function Sidebar({ current, onNavigate }: Props) {
  const item = (key: PageKey, label: string, hint: string) => {
    const active = current === key;
    return (
      <button
        key={key}
        onClick={() => onNavigate(key)}
        className={`flex w-full items-baseline justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
          active
            ? "bg-sprite-100 font-semibold text-sprite-700"
            : "text-ink-600 hover:bg-sprite-50"
        }`}
      >
        <span>{label}</span>
        <span className="text-[11px] text-ink-400">{hint}</span>
      </button>
    );
  };

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-black/5 bg-white px-3 py-5">
      <div className="mb-6 px-3">
        <div className="text-lg font-bold tracking-tight">
          EFL <span className="text-sprite-500">Sprite</span>
        </div>
        <div className="text-[11px] text-ink-400">Speaking &amp; Writing Coach</div>
      </div>
      <nav className="flex flex-col gap-1">{ITEMS.map((i) => item(i.key, i.label, i.hint))}</nav>
      <div className="mt-auto">{item("settings", "설정 · 모델", "Settings")}</div>
    </aside>
  );
}
