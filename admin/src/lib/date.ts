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

// dd/mm/yy HH:mm — for timestamps where time-of-day matters (meetings, etc).
export function fmtDateTime(d: string | number | Date | null | undefined): string {
  if (d == null || d === "") return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  const HH = String(date.getHours()).padStart(2, "0");
  const MM = String(date.getMinutes()).padStart(2, "0");
  return `${fmtDate(date)} ${HH}:${MM}`;
}
