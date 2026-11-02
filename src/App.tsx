import { useState } from "react";
import Sidebar, { type PageKey } from "./components/Sidebar";
import TasksPage from "./pages/TasksPage";
import AttemptPage from "./pages/AttemptPage";
import ResultPage from "./pages/ResultPage";
import HistoryPage from "./pages/HistoryPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  const [page, setPage] = useState<PageKey>("tasks");

  return (
    <div className="flex h-full">
      <Sidebar current={page} onNavigate={setPage} />
      <main className="flex-1 overflow-y-auto px-10 py-8">
        {page === "tasks" && <TasksPage />}
        {page === "attempt" && <AttemptPage />}
        {page === "result" && <ResultPage />}
        {page === "history" && <HistoryPage />}
        {page === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
