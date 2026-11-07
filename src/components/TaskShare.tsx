// 문제 관리 toolbar: import a pack file (button or drag-and-drop), export selected tasks,
// and generate drafts with the local AI.
import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { loadActiveModels } from "../lib/activeModels";
import { targetSentences } from "../lib/accuracy";
import { TASK_SPECS } from "../lib/rubrics";
import { generateTask, TOPIC_IDEAS, type Level } from "../lib/taskgen";
import { exportPackDialog, importTasks, openPackDialog, PACK_EXT, readPackPath, type ParsedPack } from "../lib/taskpack";
import type { NewTask, Task, TaskType } from "../lib/types";

const btn = "rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:opacity-40";
const primary = `${btn} bg-sprite-500 text-white hover:bg-sprite-600`;
const ghost = `${btn} border border-black/10 text-ink-600 hover:bg-sprite-50`;
const field = "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-sprite-500";

type Panel = null | "import" | "export" | "generate";

function TaskPreview({ t }: { t: NewTask }) {
  const spec = TASK_SPECS[t.taskType];
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-sprite-600">{spec.label}</div>
      <div className="font-semibold">{t.title}</div>
      <div className="line-clamp-2 text-xs text-ink-600" data-selectable>
        {t.taskType === "listen_repeat" ? targetSentences(t.material).join(" / ") : t.prompt}
      </div>
    </div>
  );
}

export default function TaskShare({
  tasks,
  selected,
  setSelected,
  onChanged,
}: {
  tasks: Task[];
  /** Task ids chosen for export (checkboxes in the list). null = selection mode off. */
  selected: Set<number> | null;
  setSelected: (s: Set<number> | null) => void;
  onChanged: () => void;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // import
  const [pack, setPack] = useState<ParsedPack | null>(null);
  // export
  const [packTitle, setPackTitle] = useState("");
  const [author, setAuthor] = useState("");
  // generate
  const [genType, setGenType] = useState<TaskType>("email");
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<Level>("intermediate");
  const [count, setCount] = useState(2);
  const [drafts, setDrafts] = useState<NewTask[]>([]);

  const show = (p: Panel) => {
    setMsg(null);
    setPanel(panel === p ? null : p);
    setSelected(p === "export" && panel !== "export" ? new Set(tasks.map((t) => t.id)) : null);
  };

  const loadPack = (p: ParsedPack) => {
    setPack(p);
    setPanel("import");
    setSelected(null);
    setMsg(null);
  };

  // Drag a .eflsprite file from Finder / Explorer / a USB drive onto the window.
  useEffect(() => {
    let un: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((e) => {
        if (e.payload.type !== "drop") return;
        const path = e.payload.paths.find((p) => p.toLowerCase().endsWith(`.${PACK_EXT}`) || p.toLowerCase().endsWith(".json"));
        if (!path) return;
        readPackPath(path)
          .then(loadPack)
          .catch((err) => setMsg(String(err instanceof Error ? err.message : err)));
      })
      .then((f) => (un = f))
      .catch(() => undefined);
    return () => un?.();
  }, []);

  const pickFile = async () => {
    try {
      const p = await openPackDialog();
      if (p) loadPack(p);
    } catch (e) {
      setMsg(String(e instanceof Error ? e.message : e));
    }
  };

  const doImport = async () => {
    if (!pack) return;
    setBusy("가져오는 중…");
    try {
      const [added, dup] = await importTasks(pack.tasks);
      setMsg(`${added}개를 추가했어요.${dup ? ` (이미 있는 ${dup}개는 건너뜀)` : ""}`);
      setPack(null);
      setPanel(null);
      onChanged();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(null);
    }
  };

  const doExport = async () => {
    const chosen = tasks.filter((t) => selected?.has(t.id));
    if (!chosen.length) return setMsg("내보낼 문제를 하나 이상 선택해 주세요.");
    try {
      const path = await exportPackDialog(chosen, packTitle.trim() || "EFL Sprite 문제", author.trim());
      if (path) {
        setMsg(`${chosen.length}개 문제를 저장했어요: ${path}\n이 파일을 카카오톡이나 USB로 학생에게 보내면, 학생은 '파일에서 가져오기'나 창에 끌어다 놓기로 추가할 수 있어요.`);
        setPanel(null);
        setSelected(null);
      }
    } catch (e) {
      setMsg(String(e instanceof Error ? e.message : e));
    }
  };

  const doGenerate = async () => {
    setMsg(null);
    const active = await loadActiveModels();
    if (!active.llm) return setMsg("채점 AI(LLM) 모델이 필요해요. 시작하기 또는 설정 · 모델에서 받아 주세요.");
    const out: NewTask[] = [];
    try {
      for (let i = 0; i < count; i++) {
        setBusy(`AI가 문제를 만드는 중… ${i + 1} / ${count}`);
        const avoid = [...tasks, ...drafts, ...out].filter((t) => t.taskType === genType).map((t) => t.title);
        out.push(await generateTask(active.llm.id, genType, { topic, level, avoid }));
        setDrafts((d) => [...d, out[out.length - 1]]);
      }
    } catch (e) {
      setMsg(`생성 실패: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const saveDrafts = async (which: NewTask[]) => {
    setBusy("저장 중…");
    try {
      const [added] = await importTasks(which);
      setDrafts((d) => d.filter((x) => !which.includes(x)));
      setMsg(`${added}개를 문제 목록에 추가했어요.`);
      onChanged();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(null);
    }
  };

  const editDraft = (i: number, patch: Partial<NewTask>) => setDrafts((d) => d.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  return (
    <section className="mb-6 grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className={panel === "generate" ? primary : ghost} onClick={() => show("generate")}>
          ✨ AI로 문제 만들기
        </button>
        <button className={panel === "import" ? primary : ghost} onClick={pickFile}>
          파일에서 가져오기
        </button>
        <button className={panel === "export" ? primary : ghost} onClick={() => show("export")} disabled={!tasks.length}>
          파일로 내보내기
        </button>
        <span className="text-xs text-ink-400">.{PACK_EXT} 파일을 창에 끌어다 놓아도 가져올 수 있어요.</span>
      </div>

      {panel === "import" && pack && (
        <div className="grid gap-3 rounded-xl border border-sprite-300 bg-white p-4 shadow-sm">
          <div className="font-semibold">
            {pack.title || "문제 파일"}
            {pack.author && <span className="ml-2 text-xs font-normal text-ink-400">만든 사람: {pack.author}</span>}
          </div>
          <ul className="grid max-h-72 gap-2 overflow-y-auto">
            {pack.tasks.map((t, i) => (
              <li key={i} className="rounded-lg bg-sprite-50/50 p-2">
                <TaskPreview t={t} />
              </li>
            ))}
          </ul>
          {pack.problems.length > 0 && (
            <ul className="text-xs text-amber-700">
              {pack.problems.map((p, i) => (
                <li key={i}>건너뜀 — {p}</li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <button className={primary} disabled={!pack.tasks.length || !!busy} onClick={doImport}>
              {pack.tasks.length}개 문제 추가
            </button>
            <button className={ghost} onClick={() => (setPack(null), setPanel(null))}>
              취소
            </button>
          </div>
        </div>
      )}

      {panel === "export" && (
        <div className="grid gap-3 rounded-xl border border-sprite-300 bg-white p-4 shadow-sm">
          <p className="text-sm text-ink-600">
            아래 목록에서 내보낼 문제를 체크하세요 ({selected?.size ?? 0}개 선택). 저장한 파일을 학생에게 카카오톡이나 USB로 보내면 돼요.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <input className={field} placeholder="문제 세트 이름 (예: 3주차 라이팅)" value={packTitle} onChange={(e) => setPackTitle(e.target.value)} />
            <input className={field} placeholder="만든 사람 (예: EK 조교)" value={author} onChange={(e) => setAuthor(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button className={primary} onClick={doExport}>
              파일로 저장
            </button>
            <button className={ghost} onClick={() => setSelected(new Set(tasks.map((t) => t.id)))}>
              전체 선택
            </button>
            <button className={ghost} onClick={() => setSelected(new Set())}>
              선택 해제
            </button>
          </div>
        </div>
      )}

      {panel === "generate" && (
        <div className="grid gap-3 rounded-xl border border-sprite-300 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-[1fr_1fr_auto_auto] items-end gap-2 text-xs text-ink-600">
            <label className="grid gap-1">
              유형
              <select className={field} value={genType} onChange={(e) => setGenType(e.target.value as TaskType)}>
                {(Object.keys(TASK_SPECS) as TaskType[]).map((t) => (
                  <option key={t} value={t}>
                    {TASK_SPECS[t].labelKo} ({TASK_SPECS[t].label})
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              주제 (비우면 무작위)
              <input className={field} list="topic-ideas" placeholder="예: campus life" value={topic} onChange={(e) => setTopic(e.target.value)} />
              <datalist id="topic-ideas">
                {TOPIC_IDEAS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <label className="grid gap-1">
              난이도
              <select className={field} value={level} onChange={(e) => setLevel(e.target.value as Level)}>
                <option value="intermediate">중급</option>
                <option value="advanced">고급</option>
              </select>
            </label>
            <label className="grid gap-1">
              개수
              <select className={field} value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button className={primary} onClick={doGenerate} disabled={!!busy}>
              만들기
            </button>
            <span className="text-xs text-ink-400">문제 하나에 10–40초 · 저장하기 전에 내용을 확인하고 고칠 수 있어요.</span>
          </div>

          {drafts.length > 0 && (
            <div className="grid gap-3">
              {drafts.map((d, i) => (
                <div key={i} className="grid gap-2 rounded-lg bg-sprite-50/60 p-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">AI 생성</span>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-sprite-600">{TASK_SPECS[d.taskType].label}</span>
                    <button className="ml-auto text-xs text-ink-400 hover:text-red-600" onClick={() => setDrafts((x) => x.filter((_, k) => k !== i))}>
                      버리기
                    </button>
                  </div>
                  <input className={field} value={d.title} onChange={(e) => editDraft(i, { title: e.target.value })} />
                  <textarea className={`${field} h-28`} value={d.prompt} onChange={(e) => editDraft(i, { prompt: e.target.value })} />
                  {d.material != null && (
                    <textarea className={`${field} h-28`} value={d.material} onChange={(e) => editDraft(i, { material: e.target.value })} />
                  )}
                  <div>
                    <button className={ghost} onClick={() => saveDrafts([d])} disabled={!!busy}>
                      이 문제 저장
                    </button>
                  </div>
                </div>
              ))}
              <div>
                <button className={primary} onClick={() => saveDrafts(drafts)} disabled={!!busy}>
                  모두 저장 ({drafts.length}개)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {busy && <p className="animate-pulse text-sm text-sprite-700">{busy}</p>}
      {msg && (
        <p className="whitespace-pre-wrap text-sm text-ink-600" data-selectable>
          {msg}
        </p>
      )}
    </section>
  );
}
