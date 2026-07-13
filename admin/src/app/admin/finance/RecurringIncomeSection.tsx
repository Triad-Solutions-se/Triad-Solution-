"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Repeat } from "lucide-react";
import { Modal } from "@/components/Modal";
import { DateInput } from "@/components/DateInput";
import { Chip } from "@/components/Chip";
import { fmtDate } from "@/lib/date";

type ProjectOpt = { id: string; name: string };
type CustomerOpt = { id: string; name: string };
type BankOpt = { id: string; name: string };
type RecurringIncome = {
  id: string;
  description: string;
  amount_sek: number | string;
  source: string | null;
  customer_id: string | null;
  project_id: string | null;
  bank_account_id: string | null;
  frequency: string;
  next_due_date: string | null;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  notes: string | null;
};

const SEK = (n: number) =>
  new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(n);

const FREQUENCY_LABEL: Record<string, string> = {
  monthly: "Månadsvis",
  quarterly: "Kvartalsvis",
  yearly: "Årsvis",
};

const emptyForm = {
  description: "",
  amount_sek: "",
  source: "",
  customer_id: "",
  project_id: "",
  bank_account_id: "",
  frequency: "monthly",
  next_due_date: "",
  start_date: "",
  end_date: "",
  active: true,
  notes: "",
};

function RecurringIncomeFormModal({
  open,
  onClose,
  customers,
  projects,
  bankAccounts,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  customers: CustomerOpt[];
  projects: ProjectOpt[];
  bankAccounts: BankOpt[];
  initial?: RecurringIncome | null;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isEdit = !!initial;
  const [f, setF] = useState(() =>
    initial
      ? {
          description: initial.description ?? "",
          amount_sek: String(initial.amount_sek ?? ""),
          source: initial.source ?? "",
          customer_id: initial.customer_id ?? "",
          project_id: initial.project_id ?? "",
          bank_account_id: initial.bank_account_id ?? "",
          frequency: initial.frequency ?? "monthly",
          next_due_date: initial.next_due_date ?? "",
          start_date: initial.start_date ?? "",
          end_date: initial.end_date ?? "",
          active: initial.active ?? true,
          notes: initial.notes ?? "",
        }
      : emptyForm,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.description.trim()) return;
    setSaving(true);
    const payload = {
      description: f.description,
      amount_sek: Number(f.amount_sek || 0),
      source: f.source || null,
      customer_id: f.customer_id || null,
      project_id: f.project_id || null,
      bank_account_id: f.bank_account_id || null,
      frequency: f.frequency,
      next_due_date: f.next_due_date || null,
      start_date: f.start_date || null,
      end_date: f.end_date || null,
      active: f.active,
      notes: f.notes || null,
    };
    const { error } =
      isEdit && initial
        ? await supabase.from("recurring_income").update(payload).eq("id", initial.id)
        : await supabase.from("recurring_income").insert(payload);
    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    onClose();
    router.refresh();
  }

  async function remove() {
    if (!initial) return;
    if (!confirm("Ta bort denna återkommande intäkt?")) return;
    setDeleting(true);
    const { error } = await supabase.from("recurring_income").delete().eq("id", initial.id);
    setDeleting(false);
    if (error) {
      alert(error.message);
      return;
    }
    onClose();
    router.refresh();
  }

  function bind<K extends keyof typeof f>(k: K) {
    return {
      value: f[k] as any,
      onChange: (e: any) => setF((p) => ({ ...p, [k]: e.target.value })),
    };
  }
  function bindDate<K extends keyof typeof f>(k: K) {
    return {
      value: (f[k] as string) ?? "",
      onChange: (v: string) => setF((p) => ({ ...p, [k]: v })),
    };
  }

  return (
    <Modal open={open} onClose={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-lg glass rounded-modal p-6 space-y-3 max-h-[90vh] overflow-auto"
      >
        <h3 className="font-heading text-lg font-semibold">
          {isEdit ? "Redigera återkommande intäkt" : "Ny återkommande intäkt"}
        </h3>
        <input
          autoFocus
          required
          {...bind("description")}
          placeholder="Beskrivning (t.ex. Underhållsavtal Acme)"
          className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            {...bind("amount_sek")}
            type="number"
            step="0.01"
            placeholder="Belopp (SEK)"
            className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
          />
          <input
            {...bind("source")}
            placeholder="Källa (t.ex. Kund)"
            className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
          />
          <select
            {...bind("customer_id")}
            className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
          >
            <option value="">Kund…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            {...bind("frequency")}
            className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
          >
            <option value="monthly">Månadsvis</option>
            <option value="quarterly">Kvartalsvis</option>
            <option value="yearly">Årsvis</option>
          </select>
          <label className="text-xs text-[var(--muted)]">
            Nästa betalning
            <DateInput
              {...bindDate("next_due_date")}
              ariaLabel="Nästa betalning"
              className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Startdatum
            <DateInput
              {...bindDate("start_date")}
              ariaLabel="Startdatum"
              className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-[var(--muted)] col-span-2">
            Slutdatum (valfritt)
            <DateInput
              {...bindDate("end_date")}
              ariaLabel="Slutdatum"
              className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
            />
          </label>
          <select
            {...bind("bank_account_id")}
            className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
          >
            <option value="">Bankkonto…</option>
            {bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            {...bind("project_id")}
            className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
          >
            <option value="">Projekt…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <input
            type="checkbox"
            checked={f.active}
            onChange={(e) => setF((p) => ({ ...p, active: e.target.checked }))}
          />
          Aktiv
        </label>
        <textarea
          {...bind("notes")}
          rows={2}
          placeholder="Anteckningar"
          className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
        />
        <div className="flex justify-between gap-2">
          <div>
            {isEdit && (
              <button
                type="button"
                onClick={remove}
                disabled={deleting}
                className="rounded-btn px-3 py-2 text-sm text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
              >
                {deleting ? "Tar bort…" : "Ta bort"}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-btn px-3 py-2 text-sm text-[var(--muted)]"
            >
              Avbryt
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {saving ? "Sparar…" : "Spara"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export function NewRecurringIncomeButton({
  customers,
  projects,
  bankAccounts,
}: {
  customers: CustomerOpt[];
  projects: ProjectOpt[];
  bankAccounts: BankOpt[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-btn border border-white/10 hover:bg-white/5 px-3 py-2 text-sm font-medium flex items-center gap-2"
      >
        <Repeat size={16} />
        Återkommande intäkt
      </button>
      {open && (
        <RecurringIncomeFormModal
          open={open}
          onClose={() => setOpen(false)}
          customers={customers}
          projects={projects}
          bankAccounts={bankAccounts}
        />
      )}
    </>
  );
}

export function RecurringIncomeTable({
  rows,
  customers,
  projects,
  bankAccounts,
}: {
  rows: RecurringIncome[];
  customers: CustomerOpt[];
  projects: ProjectOpt[];
  bankAccounts: BankOpt[];
}) {
  const [edit, setEdit] = useState<RecurringIncome | null>(null);
  const customerName = (id: string | null) =>
    id ? customers.find((c) => c.id === id)?.name ?? null : null;
  return (
    <>
      <table className="w-full text-sm min-w-[640px]">
        <thead className="bg-white/[0.03] text-left text-[var(--muted)] text-xs uppercase tracking-wider">
          <tr>
            <th className="p-3">Beskrivning</th>
            <th className="p-3">Kund</th>
            <th className="p-3">Frekvens</th>
            <th className="p-3">Nästa betalning</th>
            <th className="p-3">Belopp</th>
            <th className="p-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((r) => (
            <tr
              key={r.id}
              onClick={() => setEdit(r)}
              className="hover:bg-white/[0.04] cursor-pointer transition-colors"
            >
              <td className="p-3">
                <div className="font-medium">{r.description}</div>
                {r.source && <div className="text-xs text-[var(--muted)]">{r.source}</div>}
              </td>
              <td className="p-3 text-[var(--muted)]">{customerName(r.customer_id) ?? "—"}</td>
              <td className="p-3 text-[var(--muted)]">{FREQUENCY_LABEL[r.frequency] ?? r.frequency}</td>
              <td className="p-3 text-[var(--muted)]">{fmtDate(r.next_due_date)}</td>
              <td className="p-3 font-mono">{SEK(Number(r.amount_sek || 0))}</td>
              <td className="p-3">
                <Chip tone={r.active ? "green" : "gray"}>{r.active ? "Aktiv" : "Pausad"}</Chip>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={6} className="p-8 text-center text-sm text-[var(--muted)]">
                Inga återkommande intäkter än.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {edit && (
        <RecurringIncomeFormModal
          open={!!edit}
          onClose={() => setEdit(null)}
          customers={customers}
          projects={projects}
          bankAccounts={bankAccounts}
          initial={edit}
        />
      )}
    </>
  );
}
