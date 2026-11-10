export type PageKey =
  | "home"
  | "review"
  | "tasks"
  | "attempt"
  | "result"
  | "history"
  | "settings";

interface NavItem {
  key: PageKey;
  label: string;
  hint: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: "home", label: "시작하기", hint: "Start" },
  { key: "tasks", label: "문제 관리", hint: "Tasks" },
  { key: "attempt", label: "응시", hint: "Practice" },
  { key: "result", label: "채점 결과", hint: "Feedback" },
  { key: "history", label: "기록", hint: "History" },
];

interface SidebarProps {
  current: PageKey;
  onNavigate: (key: PageKey) => void;
}

export default function Sidebar({ current, onNavigate }: SidebarProps) {
  const renderNavButton = (key: PageKey, label: string, hint: string) => {
    const isActive = current === key;

    return (
      <button
        key={key}
        type="button"
        onClick={() => onNavigate(key)}
        aria-current={isActive ? "page" : undefined}
        className={`flex w-full items-baseline justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
          isActive
            ? "bg-sprite-100 font-semibold text-sprite-700"
            : "text-ink-600 hover:bg-sprite-50"
        }`}
      >
        <span>{label}</span>
        <span
          className={`text-[11px] ${
            isActive ? "text-sprite-600" : "text-ink-400"
          }`}
        >
          {hint}
        </span>
      </button>
    );
  };

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-black/5 bg-white px-3 py-5">
      <div className="mb-6 px-3">
        <div className="text-lg font-bold tracking-tight text-ink-900">
          EFL <span className="text-sprite-500">Sprite</span>
        </div>
        <div className="text-[11px] text-ink-400">
          Speaking &amp; Writing Coach
        </div>
      </div>

      <nav aria-label="주요 메뉴" className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ key, label, hint }) =>
          renderNavButton(key, label, hint)
        )}
      </nav>

      <div className="mt-auto border-t border-black/5 pt-3">
        {renderNavButton("settings", "설정 · 모델", "Settings")}
      </div>
    </aside>
  );
}