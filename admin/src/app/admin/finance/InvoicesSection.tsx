"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FileText } from "lucide-react";
import { Modal } from "@/components/Modal";
import { DateInput } from "@/components/DateInput";
import { Chip } from "@/components/Chip";
import { fmtDate } from "@/lib/date";

type ProjectOpt = { id: string; name: string };
type CustomerOpt = { id: string; name: string };
type BankOpt = { id: string; name: string };
type Invoice = {
  id: string;
  number: string;
  customer_name: string | null;
  customer_id: string | null;
  project_id: string | null;
  bank_account_id: string | null;
  amount_sek: number | string;
  issued_at: string | null;
  due_date: string | null;
  status: string;
  pdf_url: string | null;
  notes: string | null;
};

const SEK = (n: number) =>
  new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(n);

const emptyForm = {
  number: "",
  customer_name: "",
  customer_id: "",
  project_id: "",
  bank_account_id: "",
  amount_sek: "",
  issued_at: "",
  due_date: "",
  status: "draft",
  notes: "",
};

function InvoiceFormModal({
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
  initial?: Invoice | null;
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
          number: initial.number ?? "",
          customer_name: initial.customer_name ?? "",
          customer_id: initial.customer_id ?? "",
          project_id: initial.project_id ?? "",
          bank_account_id: initial.bank_account_id ?? "",
          amount_sek: String(initial.amount_sek ?? ""),
          issued_at: initial.issued_at ?? "",
          due_date: initial.due_date ?? "",
          status: initial.status ?? "draft",
          notes: initial.notes ?? "",
        }
      : emptyForm,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.number.trim()) return;
    setSaving(true);
    try {
      let pdf_url = initial?.pdf_url ?? null;
      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `invoices/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage.from("finance").upload(path, file);
        if (upErr) throw upErr;
        pdf_url = path;
      }
      const payload = {
        number: f.number,
        customer_name: f.customer_name || null,
        customer_id: f.customer_id || null,
        project_id: f.project_id || null,
        bank_account_id: f.bank_account_id || null,
        amount_sek: Number(f.amount_sek || 0),
        issued_at: f.issued_at || null,
        due_date: f.due_date || null,
        status: f.status,
        notes: f.notes || null,
        pdf_url,
      };
      const { error } =
        isEdit && initial
          ? await supabase.from("invoices").update(payload).eq("id", initial.id)
          : await supabase.from("invoices").insert(payload);
      if (error) throw error;
      onClose();
      router.refresh();
    } catch (err: any) {
      alert(err.message ?? "Kunde inte spara faktura");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!initial) return;
    if (!confirm("Ta bort denna faktura?")) return;
    setDeleting(true);
    const { error } = await supabase.from("invoices").delete().eq("id", initial.id);
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
          {isEdit ? "Redigera faktura" : "Ny faktura"}
        </h3>
        <input
          autoFocus
          required
          {...bind("number")}
          placeholder="Fakturanummer"
          className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            {...bind("customer_name")}
            placeholder="Kund"
            className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm col-span-2"
          />
          <input
            {...bind("amount_sek")}
            type="number"
            step="0.01"
            placeholder="Belopp (SEK)"
            className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
          />
          <select
            {...bind("status")}
            className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
          >
            <option value="draft">Utkast</option>
            <option value="sent">Skickad</option>
            <option value="paid">Betald</option>
            <option value="overdue">Försenad</option>
            <option value="credited">Krediterad</option>
          </select>
          <label className="text-xs text-[var(--muted)]">
            Utfärdad
            <DateInput
              {...bindDate("issued_at")}
              ariaLabel="Utfärdad"
              className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Förfaller
            <DateInput
              {...bindDate("due_date")}
              ariaLabel="Förfaller"
              className="mt-1 w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
            />
          </label>
          <select
            {...bind("customer_id")}
            className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
          >
            <option value="">Kund (länk)…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
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
          <select
            {...bind("bank_account_id")}
            className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm col-span-2"
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
          PDF (valfritt) {initial?.pdf_url && <span className="text-teal-300">— befintlig fil bifogad</span>}
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm text-white file:mr-3 file:rounded-btn file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-white/20"
          />
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

export function NewInvoiceButton({
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
        <FileText size={16} />
        Ny faktura
      </button>
      {open && (
        <InvoiceFormModal
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

export function InvoicesTable({
  rows,
  customers,
  projects,
  bankAccounts,
}: {
  rows: Invoice[];
  customers: CustomerOpt[];
  projects: ProjectOpt[];
  bankAccounts: BankOpt[];
}) {
  const [edit, setEdit] = useState<Invoice | null>(null);
  const projectName = (id: string | null) => (id ? projects.find((p) => p.id === id)?.name ?? null : null);
  return (
    <>
      <table className="w-full text-sm min-w-[540px]">
        <thead className="bg-white/[0.03] text-left text-[var(--muted)] text-xs uppercase tracking-wider">
          <tr>
            <th className="p-3">Fakturanummer</th>
            <th className="p-3">Kund</th>
            <th className="p-3">Projekt</th>
            <th className="p-3">Utfärdad</th>
            <th className="p-3">Förfaller</th>
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
              <td className="p-3 font-mono">{r.number}</td>
              <td className="p-3 text-[var(--muted)]">
                {r.customer_name ?? customers.find((c) => c.id === r.customer_id)?.name ?? "—"}
              </td>
              <td className="p-3 text-[var(--muted)]">{projectName(r.project_id) ?? "—"}</td>
              <td className="p-3 text-[var(--muted)]">{fmtDate(r.issued_at)}</td>
              <td className="p-3 text-[var(--muted)]">{fmtDate(r.due_date)}</td>
              <td className="p-3 font-mono">{SEK(Number(r.amount_sek || 0))}</td>
              <td className="p-3">
                <Chip
                  tone={
                    r.status === "paid"
                      ? "green"
                      : r.status === "overdue"
                      ? "red"
                      : r.status === "sent"
                      ? "blue"
                      : "gray"
                  }
                >
                  {r.status}
                </Chip>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={7} className="p-8 text-center text-sm text-[var(--muted)]">
                Inga fakturor än.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {edit && (
        <InvoiceFormModal
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
