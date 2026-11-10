import { Component, type ErrorInfo, type ReactNode } from "react";

interface BoundaryProps {
  children: ReactNode;
  resetKey: string;
}

interface BoundaryState {
  hasError: boolean;
  caughtError: unknown;
  activeKey: string;
}

function formatThrownValue(value: unknown): string {
  if (value instanceof Error && typeof value.message === "string" && value.message.length > 0) {
    return value.message;
  }
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return "알 수 없는 오류가 발생했습니다.";
}

export default class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  constructor(props: BoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      caughtError: null,
      activeKey: props.resetKey,
    };
  }

  static getDerivedStateFromError(caughtError: unknown): Partial<BoundaryState> {
    return {
      hasError: true,
      caughtError,
    };
  }

  static getDerivedStateFromProps(
    nextProps: BoundaryProps,
    prevState: BoundaryState
  ): Partial<BoundaryState> | null {
    if (nextProps.resetKey !== prevState.activeKey) {
      return {
        hasError: false,
        caughtError: null,
        activeKey: nextProps.resetKey,
      };
    }
    return null;
  }

  componentDidCatch(caughtError: unknown, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", caughtError, errorInfo);
  }

  render() {
    const { hasError, caughtError } = this.state;

    if (!hasError) {
      return this.props.children;
    }

    const detailText = formatThrownValue(caughtError);

    return (
      <section className="mx-auto my-12 w-full max-w-md rounded-xl border border-red-200 bg-white p-6 shadow">
        <h2 className="text-base font-bold text-ink-900">
          화면을 표시하는 중 문제가 생겼어요
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">
          저장된 답안과 기록은 그대로 있어요. 다른 메뉴로 이동하거나 다시 불러와 주세요.
        </p>
        <pre
          data-selectable
          className="mt-4 max-h-36 overflow-y-auto rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-600 whitespace-pre-wrap"
        >
          {detailText}
        </pre>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-sprite-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-sprite-700"
          >
            다시 불러오기
          </button>
        </div>
      </section>
    );
  }
}