import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import {
  WORK_BLOCK_FIELDS,
  addDays,
  resolveWeek,
  stockholmNow,
  type Member,
  type MemberTimeSummary,
  type WorkBlock,
} from "@/lib/work-plan";
import { TimeSummary } from "./TimeSummary";
import { WeekPlanner } from "./WeekPlanner";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const today = stockholmNow().date;
  const monday = resolveWeek(week, today);

  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    blocks,
    profiles,
    summary,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("work_blocks")
      .select(WORK_BLOCK_FIELDS)
      .gte("work_date", monday)
      .lte("work_date", addDays(monday, 6)),
    supabase.from("profiles").select("id,display_name").order("created_at"),
    supabase.rpc("member_time_summary", { p_week_start: monday }),
  ]);
  const members = (profiles.data ?? []) as Member[];

  return (
    <>
      <PageHeader
        title="Kalender"
        subtitle="Planera veckans arbetstid: dra eller tryck i kalendern för att lägga till en tid, klicka på en tid för att ändra den."
      />
      <WeekPlanner
        monday={monday}
        today={today}
        userId={user?.id ?? ""}
        members={members}
        initialBlocks={(blocks.data ?? []) as WorkBlock[]}
      />
      {summary.data && (
        <TimeSummary
          className="mt-6"
          members={members}
          summary={summary.data as MemberTimeSummary[]}
          monday={monday}
        />
      )}
    </>
  );
}
