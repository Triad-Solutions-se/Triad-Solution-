// Single canonical date formatter for the admin app: dd/mm/yy.
// Returns "—" for null/undefined/invalid input so callers don't have to guard.

export function fmtDate(d: string | number | Date | null | undefined): string {
  if (d == null || d === "") return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

// "18 maj" — month + day only, no year. Used for calendar/timeline labels.
export function fmtMonthDay(d: string | number | Date | null | undefined): string {
  if (d == null || d === "") return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

// dd/mm/yy HH:mm — for timestamps where time-of-day matters (meetings, etc).
export function fmtDateTime(d: string | number | Date | null | undefined): string {
  if (d == null || d === "") return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  const HH = String(date.getHours()).padStart(2, "0");
  const MM = String(date.getMinutes()).padStart(2, "0");
  return `${fmtDate(date)} ${HH}:${MM}`;
}

// Live stopwatch: "0:05:09", "12:34:56". Negative input (clock skew) → 0.
export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${ss}`;
}

// Logged time: "12 h 5 min", "45 min", "0 min".
export function fmtDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
