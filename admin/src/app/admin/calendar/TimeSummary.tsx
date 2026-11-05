import {
  fmtMinutes,
  isoWeek,
  memberColor,
  memberName,
  type Member,
  type MemberTimeSummary,
} from "@/lib/work-plan";

const fmtOrDash = (minutes: number | undefined) => (minutes ? fmtMinutes(minutes) : "—");

// Planerad och loggad tid per medlem, för den vecka som visas.
export function TimeSummary({
  members,
  summary,
  monday,
  className = "",
}: {
  members: Member[];
  summary: MemberTimeSummary[];
  monday: string;
  className?: string;
}) {
  const byMember = new Map(summary.map((s) => [s.profile_id, s]));

  return (
    <section className={`glass rounded-xl border border-white/10 p-5 ${className}`}>
      <h2 className="font-heading font-semibold">Tid per person · vecka {isoWeek(monday)}</h2>
      <p className="mt-0.5 mb-4 text-xs text-[var(--muted)]">
        Planerat kommer från kalendern, loggat från projekttimern.
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[var(--muted)] uppercase tracking-wider text-[10px]">
            <th className="p-2 pl-0 text-left font-medium">Medlem</th>
            <th className="p-2 text-right font-medium">Planerat</th>
            <th className="p-2 text-right font-medium">Loggat</th>
            <th className="p-2 pr-0 text-right font-medium">Loggat totalt</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {members.map((m, i) => {
            const row = byMember.get(m.id);
            return (
              <tr key={m.id}>
                <td className="p-2 pl-0">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${memberColor(i).dot}`} />
                    <span className="truncate font-medium">{memberName(m)}</span>
                  </span>
                </td>
                <td className="p-2 text-right tabular-nums">{fmtOrDash(row?.planned_week_minutes)}</td>
                <td className="p-2 text-right tabular-nums">{fmtOrDash(row?.logged_week_minutes)}</td>
                <td className="p-2 pr-0 text-right tabular-nums font-medium">
                  {fmtOrDash(row?.logged_total_minutes)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
