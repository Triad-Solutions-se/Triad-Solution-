"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Receipt } from "lucide-react";
import { Modal } from "@/components/Modal";
import { DateInput } from "@/components/DateInput";
import { Chip } from "@/components/Chip";
import { fmtDate } from "@/lib/date";

type ProjectOpt = { id: string; name: string };
type BankOpt = { id: string; name: string };
type Expense = {
  id: string;
  description: string;
  amount_sek: number | string;
  paid_by: string | null;
  category: string | null;
  date: string | null;
  status: string;
  receipt_url: string | null;
  project_id: string | null;
  bank_account_id: string | null;
};

const SEK = (n: number) =>
  new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(n);

const emptyForm = {
  description: "",
  amount_sek: "",
  paid_by: "",
  category: "",
  date: "",
  status: "pending",
  project_id: "",
  bank_account_id: "",
};

function ExpenseFormModal({
  open,
  onClose,
  projects,
  bankAccounts,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  projects: ProjectOpt[];
  bankAccounts: BankOpt[];
  initial?: Expense | null;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const isEdit = !!initial;
  const [f, setF] = useState(() =>
    initial
      ? {
          description: initial.description ?? "",
          amount_sek: String(initial.amount_sek ?? ""),
          paid_by: initial.paid_by ?? "",
          category: initial.category ?? "",
          date: initial.date ?? "",
          status: initial.status ?? "pending",
          project_id: initial.project_id ?? "",
          bank_account_id: initial.bank_account_id ?? "",
        }
      : emptyForm,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.description.trim()) return;
    setSaving(true);
    try {
      let receipt_url = initial?.receipt_url ?? null;
      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `expenses/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage.from("finance").upload(path, file);
        if (upErr) throw upErr;
        receipt_url = path;
      }
      const payload = {
        description: f.description,
        amount_sek: Number(f.amount_sek || 0),
        paid_by: f.paid_by || null,
        category: f.category || null,
        date: f.date || null,
        status: f.status,
        receipt_url,
        project_id: f.project_id || null,
        bank_account_id: f.bank_account_id || null,
      };
      const { error } =
        isEdit && initial
          ? await supabase.from("expenses").update(payload).eq("id", initial.id)
          : await supabase.from("expenses").insert(payload);
      if (error) throw error;
      onClose();
      router.refresh();
    } catch (err: any) {
      alert(err.message ?? "Kunde inte spara utlägg");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!initial) return;
    if (!confirm("Ta bort detta utlägg?")) return;
    setDeleting(true);
    const { error } = await supabase.from("expenses").delete().eq("id", initial.id);
    setDeleting(false);
    if (error) {
      alert(error.message);
      return;
    }
    onClose();
    router.refresh();
  }

  function bind<K extends keyof typeof f>(k: K) {
    return { value: f[k], onChange: (e: any) => setF((p) => ({ ...p, [k]: e.target.value })) };
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
          {isEdit ? "Redigera utlägg" : "Nytt utlägg"}
        </h3>
        <input
          autoFocus
          required
          {...bind("description")}
          placeholder="Beskrivning"
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
            {...bind("category")}
            placeholder="Kategori"
            className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
          />
          <input
            {...bind("paid_by")}
            placeholder="Betald av (t.ex. Rayan)"
            className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
          />
          <DateInput
            {...bindDate("date")}
            ariaLabel="Datum"
            className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
          />
          <select
            {...bind("status")}
            className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm col-span-2"
          >
            <option value="pending">Ej återbetald</option>
            <option value="reimbursed">Återbetald</option>
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
        </div>
        <label className="block text-xs text-[var(--muted)]">
          Kvitto (PDF / bild) {initial?.receipt_url && <span className="text-teal-300">— befintlig fil bifogad</span>}
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm text-white file:mr-3 file:rounded-btn file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-white/20"
          />
        </label>
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

export function NewExpenseButton({
  projects,
  bankAccounts,
}: {
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
        <Receipt size={16} />
        Nytt utlägg
      </button>
      {open && (
        <ExpenseFormModal
          open={open}
          onClose={() => setOpen(false)}
          projects={projects}
          bankAccounts={bankAccounts}
        />
      )}
    </>
  );
}

export function ExpensesTable({
  rows,
  projects,
  bankAccounts,
}: {
  rows: Expense[];
  projects: ProjectOpt[];
  bankAccounts: BankOpt[];
}) {
  const [edit, setEdit] = useState<Expense | null>(null);
  const projectName = (id: string | null) => (id ? projects.find((p) => p.id === id)?.name ?? null : null);
  const bankName = (id: string | null) => (id ? bankAccounts.find((b) => b.id === id)?.name ?? null : null);
  return (
    <>
      <table className="w-full text-sm min-w-[540px]">
        <thead className="bg-white/[0.03] text-left text-[var(--muted)] text-xs uppercase tracking-wider">
          <tr>
            <th className="p-3">Beskrivning</th>
            <th className="p-3">Kategori</th>
            <th className="p-3">Projekt</th>
            <th className="p-3">Konto</th>
            <th className="p-3">Betald av</th>
            <th className="p-3">Datum</th>
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
              <td className="p-3">{r.description}</td>
              <td className="p-3 text-[var(--muted)]">{r.category ?? "—"}</td>
              <td className="p-3 text-[var(--muted)]">{projectName(r.project_id) ?? "—"}</td>
              <td className="p-3 text-[var(--muted)]">{bankName(r.bank_account_id) ?? "—"}</td>
              <td className="p-3 text-[var(--muted)]">{r.paid_by ?? "—"}</td>
              <td className="p-3 text-[var(--muted)]">{fmtDate(r.date)}</td>
              <td className="p-3 font-mono">{SEK(Number(r.amount_sek || 0))}</td>
              <td className="p-3">
                <Chip tone={r.status === "reimbursed" ? "green" : "red"}>
                  {r.status === "reimbursed" ? "Återbetald" : "Ej återbetald"}
                </Chip>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={8} className="p-8 text-center text-sm text-[var(--muted)]">
                Inga utlägg än.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {edit && (
        <ExpenseFormModal
          open={!!edit}
          onClose={() => setEdit(null)}
          projects={projects}
          bankAccounts={bankAccounts}
          initial={edit}
        />
      )}
    </>
  );
}
