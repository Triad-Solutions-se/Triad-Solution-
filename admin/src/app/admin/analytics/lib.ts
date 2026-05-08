export type Row = {
  app_id: string;
  path: string;
  referrer: string | null;
  session_id: string | null;
  country: string | null;
  is_bot: boolean | null;
  created_at: string;
};

export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function lastNDays(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function countSince(rows: Row[], hours: number): number {
  const cutoff = Date.now() - hours * 3600 * 1000;
  let n = 0;
  for (const r of rows) if (new Date(r.created_at).getTime() >= cutoff) n++;
  return n;
}

export function uniqueSessionsSince(rows: Row[], hours: number): number {
  const cutoff = Date.now() - hours * 3600 * 1000;
  const set = new Set<string>();
  for (const r of rows) {
    if (!r.session_id) continue;
    if (new Date(r.created_at).getTime() < cutoff) continue;
    set.add(r.session_id);
  }
  return set.size;
}

export function topBy<T extends Row>(
  rows: T[],
  key: (r: T) => string | null,
  limit = 5,
): Array<{ key: string; count: number }> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([k, c]) => ({ key: k, count: c }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function seriesByDay(rows: Row[], days: string[]): number[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = dayKey(r.created_at);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return days.map((d) => m.get(d) ?? 0);
}

export function normalizeReferrer(r: string | null): string | null {
  if (!r) return null;
  try {
    const u = new URL(r);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return r.slice(0, 60);
  }
}
