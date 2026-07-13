import type { SupabaseClient } from "@supabase/supabase-js";

const MONTHS_PER: Record<string, number> = { monthly: 1, quarterly: 3, yearly: 12 };

// k:te förfallodatumet räknat från ankaret, förankrat i ankarets dag i
// månaden (31:a klampas till månadens sista dag så serien inte driftar).
function occurrenceISO(anchor: string, monthsPer: number, k: number): string {
  const [y, m, d] = anchor.split("-").map(Number);
  const total = m - 1 + k * monthsPer;
  const yy = y + Math.floor(total / 12);
  const mm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  return `${yy}-${String(mm).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

// Skapar income-rader för alla passerade förfallodatum på aktiva
// återkommande intäkter och flyttar fram next_due_date till nästa framtida
// datum. Idempotent via unikt index (recurring_income_id, date) — körs vid
// varje sidladdning av Ekonomi-sidan. Kräver migration 0031; utan den
// hoppas raden över tyst så sidan alltid renderar.
export async function materializeRecurringIncome(supabase: SupabaseClient) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: recs, error } = await supabase
    .from("recurring_income")
    .select("*")
    .eq("active", true);
  if (error || !recs?.length) return;

  for (const r of recs) {
    const anchor: string | null = r.start_date ?? r.next_due_date;
    if (!anchor || anchor > today) continue;
    const monthsPer = MONTHS_PER[r.frequency] ?? 1;

    const due: string[] = [];
    let nextDue: string | null = null;
    for (let k = 0; k < 620; k++) {
      const d = occurrenceISO(anchor, monthsPer, k);
      if (r.end_date && d > r.end_date) break;
      if (d > today) {
        nextDue = d;
        break;
      }
      due.push(d);
    }

    if (due.length) {
      const { error: insErr } = await supabase.from("income").upsert(
        due.map((date) => ({
          description: r.description,
          amount_sek: r.amount_sek,
          source: r.source,
          customer_id: r.customer_id,
          project_id: r.project_id,
          bank_account_id: r.bank_account_id,
          date,
          status: "pending",
          recurring_income_id: r.id,
        })),
        { onConflict: "recurring_income_id,date", ignoreDuplicates: true },
      );
      if (insErr) continue;
    }
    if (nextDue !== (r.next_due_date ?? null)) {
      await supabase.from("recurring_income").update({ next_due_date: nextDue }).eq("id", r.id);
    }
  }
}
