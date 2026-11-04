import { useState } from "react";
import Sidebar, { type PageKey } from "./components/Sidebar";
import TasksPage from "./pages/TasksPage";
import AttemptPage from "./pages/AttemptPage";
import ResultPage from "./pages/ResultPage";
import HistoryPage from "./pages/HistoryPage";
import SettingsPage from "./pages/SettingsPage";

export interface Route {
  page: PageKey;
  /** Result page: which attempt to show. */
  attemptId?: number;
}
export type Navigate = (to: Route) => void;

export default function App() {
  const [route, setRoute] = useState<Route>({ page: "tasks" });
  const navigate: Navigate = (to) => setRoute(to);

  return (
    <div className="flex h-full">
      <Sidebar current={route.page} onNavigate={(page) => navigate({ page })} />
      <main className="flex-1 overflow-y-auto px-10 py-8">
        {route.page === "tasks" && <TasksPage />}
        {route.page === "attempt" && <AttemptPage navigate={navigate} />}
        {/* key: remount when a different attempt is opened */}
        {route.page === "result" && <ResultPage key={route.attemptId ?? 0} attemptId={route.attemptId} navigate={navigate} />}
        {route.page === "history" && <HistoryPage navigate={navigate} />}
        {route.page === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
