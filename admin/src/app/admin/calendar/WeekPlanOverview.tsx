import Link from "next/link";
import {
  WEEKDAYS,
  blockRange,
  fmtMinutes,
  fmtRange,
  isoWeek,
  memberColor,
  memberName,
  totalMinutes,
  weekDays,
  type Member,
  type WorkBlock,
} from "@/lib/work-plan";

// Dashboardens överblick: vem jobbar när den här veckan.
export function WeekPlanOverview({
  members,
  blocks,
  monday,
  today,
}: {
  members: Member[];
  blocks: WorkBlock[];
  monday: string;
  today: string;
}) {
  const days = weekDays(monday);

  return (
    <section className="lg:col-span-3 glass rounded-xl border border-white/10 p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-heading font-semibold">
          Planerad arbetstid · vecka {isoWeek(monday)}
        </h2>
        <div className="flex items-center gap-3 text-xs text-[var(--muted)] shrink-0">
          {blocks.length > 0 && (
            <span className="hidden sm:inline tabular-nums">
              Teamet totalt {fmtMinutes(totalMinutes(blocks))}
            </span>
          )}
          <Link href="/admin/calendar" className="hover:text-white">
            Kalender →
          </Link>
        </div>
      </div>

      {blocks.length === 0 ? (
        <div className="rounded-card border border-dashed border-white/10 p-8 text-center text-xs text-[var(--muted)]">
          Ingen har planerat arbetstid den här veckan ännu.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs table-fixed">
            <thead>
              <tr className="text-[var(--muted)] uppercase tracking-wider text-[10px]">
                <th className="w-36 p-2 text-left font-medium">Medlem</th>
                {days.map((date, i) => (
                  <th
                    key={date}
                    className={`p-2 text-left font-medium rounded-t ${
                      date === today ? "bg-teal-400/10 text-teal-300" : ""
                    }`}
                  >
                    {WEEKDAYS[i]} {Number(date.slice(8))}
                  </th>
                ))}
                <th className="w-20 p-2 text-right font-medium">Totalt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {members.map((m, i) => {
                const own = blocks.filter((b) => b.profile_id === m.id);
                return (
                  <tr key={m.id}>
                    <td className="p-2 align-top">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${memberColor(i).dot}`} />
                        <span className="truncate font-medium">{memberName(m)}</span>
                      </span>
                    </td>
                    {days.map((date) => {
                      const ranges = own
                        .filter((b) => b.work_date === date)
                        .map(blockRange)
                        .sort((a, b) => a.start - b.start);
                      return (
                        <td
                          key={date}
                          className={`p-2 align-top tabular-nums ${date === today ? "bg-teal-400/10" : ""}`}
                        >
                          {ranges.length === 0 ? (
                            <span className="text-[var(--muted)] opacity-50">—</span>
                          ) : (
                            ranges.map((r) => <div key={r.start}>{fmtRange(r)}</div>)
                          )}
                        </td>
                      );
                    })}
                    <td className="p-2 align-top text-right tabular-nums font-medium">
                      {own.length > 0 ? fmtMinutes(totalMinutes(own)) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
