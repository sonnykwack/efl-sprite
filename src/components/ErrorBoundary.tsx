// A rendering error in one page must not leave a blank window: show what happened and a way
// out. (Data is in SQLite, so reloading loses nothing that was saved.)
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Changing this key (e.g. the page) clears the error. */
  resetKey: string;
}
interface State {
  error: Error | null;
  key: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error: Error) {
    console.error("[ui] page crashed", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto mt-16 max-w-lg rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-lg font-bold">화면을 표시하는 중 문제가 생겼어요</h1>
        <p className="mb-4 text-sm text-ink-600">저장된 답안과 기록은 그대로 있어요. 다른 메뉴로 이동하거나 다시 불러와 주세요.</p>
        <pre className="mb-4 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-red-50 p-2 text-xs text-red-700" data-selectable>
          {String(this.state.error.message || this.state.error)}
        </pre>
        <button
          className="rounded-lg bg-sprite-500 px-4 py-2 text-sm font-semibold text-white"
          onClick={() => window.location.reload()}
        >
          다시 불러오기
        </button>
      </div>
    );
  }
}
