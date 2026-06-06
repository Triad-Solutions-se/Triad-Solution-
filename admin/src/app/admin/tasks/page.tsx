import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { SortSelect } from "@/components/SortSelect";
import { NewTaskButton } from "./NewTaskButton";
import { type Task } from "./TaskCard";
import { TasksBoard } from "./TasksBoard";

export const dynamic = "force-dynamic";

const SORTS = [
  { value: "due_asc", label: "Deadline (närmast)" },
  { value: "due_desc", label: "Deadline (senast)" },
  { value: "priority", label: "Prioritet" },
  { value: "created_desc", label: "Nyast" },
  { value: "created_asc", label: "Äldst" },
  { value: "title", label: "Titel (A–Ö)" },
];

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const sp = await searchParams;
  const sort = sp.sort ?? "due_asc";
  const supabase = await createClient();

  let q = supabase
    .from("tasks")
    .select(
      "id,title,description,status,priority,start_at,due_at,created_at,estimate_hours,assignee_ids,project:projects(id,name)",
    );

  if (sort === "due_desc") q = q.order("due_at", { ascending: false, nullsFirst: false });
  else if (sort === "priority") q = q.order("priority", { ascending: false }).order("due_at", { ascending: true, nullsFirst: false });
  else if (sort === "created_desc") q = q.order("created_at", { ascending: false });
  else if (sort === "created_asc") q = q.order("created_at", { ascending: true });
  else if (sort === "title") q = q.order("title", { ascending: true });
  else q = q.order("due_at", { ascending: true, nullsFirst: false }).order("priority", { ascending: false });

  const [{ data: tasks }, { data: profilesData }] = await Promise.all([
    q,
    supabase.from("profiles").select("id,display_name"),
  ]);

  const profileById = new Map<string, { id: string; display_name: string | null }>(
    (profilesData ?? []).map((p: any) => [p.id, p]),
  );

  const all = (tasks ?? []).map((t: any) => ({
    ...t,
    assignees: (t.assignee_ids ?? [])
      .map((id: string) => profileById.get(id))
      .filter(Boolean) as Array<{ id: string; display_name: string | null }>,
  })) as unknown as Task[];

  return (
    <>
      <PageHeader
        title="Uppgifter"
        subtitle="Teamets gemensamma att-göra-lista. Klicka checkboxen för att bocka av."
        right={
          <div className="flex items-center gap-3">
            <SortSelect options={SORTS} defaultValue="due_asc" />
            <NewTaskButton />
          </div>
        }
      />

      <TasksBoard initial={all} />
    </>
  );
}
