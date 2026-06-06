import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { SupermindChat, type ThreadSummary } from "./SupermindChat";

export const dynamic = "force-dynamic";

export default async function SupermindPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_threads")
    .select("id,title,updated_at")
    .order("updated_at", { ascending: false })
    .limit(30);

  const threads = (data ?? []) as ThreadSummary[];

  return (
    <>
      <PageHeader
        title="Supermind"
        subtitle="AI-driftshjärnan — planera arbete, prioritera intäkter och håll koll på läget. Läsläge (advisor)."
      />
      <SupermindChat initialThreads={threads} />
    </>
  );
}
