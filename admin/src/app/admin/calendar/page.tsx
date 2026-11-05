import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import {
  WORK_BLOCK_FIELDS,
  addDays,
  resolveWeek,
  stockholmNow,
  type Member,
  type WorkBlock,
} from "@/lib/work-plan";
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
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("work_blocks")
      .select(WORK_BLOCK_FIELDS)
      .gte("work_date", monday)
      .lte("work_date", addDays(monday, 6)),
    supabase.from("profiles").select("id,display_name").order("created_at"),
  ]);

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
        members={(profiles.data ?? []) as Member[]}
        initialBlocks={(blocks.data ?? []) as WorkBlock[]}
      />
    </>
  );
}
