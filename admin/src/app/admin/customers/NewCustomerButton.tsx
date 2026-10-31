"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus } from "lucide-react";

export function NewCustomerButton() {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const empty = { name: "", org_number: "", address: "", contact_person: "", contact_role: "", industry: "", status: "prospect", email: "", phone: "", website: "", notes: "" };
  const [f, setF] = useState(empty);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return;
    setSaving(true);
    // Tom roll skickas inte med, så att formuläret fungerar även innan
    // migration 0035 (customers.contact_role) är körd.
    const { contact_role, ...rest } = f;
    const { error } = await supabase
      .from("customers")
      .insert(contact_role.trim() ? f : rest);
    setSaving(false);
    if (error) { alert(error.message); return; }
    setOpen(false);
    setF(empty);
    router.refresh();
  }

  function bind<K extends keyof typeof f>(k: K) {
    return { value: f[k] as string, onChange: (e: any) => setF((p) => ({ ...p, [k]: e.target.value })) };
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-4 py-2.5 text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm shadow-teal-500/20">
        <Plus size={16} />
        Ny kund
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4" onClick={() => setOpen(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="w-full max-w-lg glass rounded-modal p-6 space-y-3 max-h-[90vh] overflow-auto">
            <h3 className="font-heading text-lg font-semibold">Ny kund</h3>
            <input autoFocus {...bind("name")} placeholder="Kundnamn (juridiskt företagsnamn)" className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2" />
            <p className="text-[10px] text-[var(--muted)] -mt-1">
              Organisationsnummer och adress krävs för att kunna generera SaaS- och PUB-avtal.
              Kontaktperson, roll, e-post och telefon fylls i PUB-avtalets kontaktuppgifter.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <input {...bind("org_number")} placeholder="Organisationsnummer" className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm" />
              <input {...bind("address")} placeholder="Adress (gata, postnr, ort)" className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm" />
              <input {...bind("contact_person")} placeholder="Kontaktperson" className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm" />
              <input {...bind("contact_role")} placeholder="Kontaktpersonens roll" className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm" />
              <input {...bind("email")} type="email" placeholder="E-post" className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm" />
              <input {...bind("phone")} placeholder="Telefon" className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm" />
              <input {...bind("industry")} placeholder="Bransch" className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm" />
              <select {...bind("status")} className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm">
                <option value="prospect">Prospekt</option>
                <option value="active">Aktiv</option>
                <option value="inactive">Inaktiv</option>
                <option value="closed">Avslutad</option>
              </select>
              <input {...bind("website")} placeholder="Webbplats" className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm col-span-2" />
            </div>
            <textarea {...bind("notes")} rows={3} placeholder="Anteckningar" className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-btn px-3 py-2 text-sm text-[var(--muted)]">Avbryt</button>
              <button type="submit" disabled={saving} className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-colors">
                {saving ? "Sparar…" : "Spara"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
