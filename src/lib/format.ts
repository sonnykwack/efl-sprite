/** SQLite `datetime('now')` is UTC "YYYY-MM-DD HH:MM:SS" → local Korean date/time. */
export function fmtDate(sqlUtc: string): string {
  const d = new Date(sqlUtc.replace(" ", "T") + "Z");
  return isNaN(d.getTime())
    ? sqlUtc
    : d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
