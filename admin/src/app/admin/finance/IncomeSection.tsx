"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TrendingUp } from "lucide-react";
import { Modal } from "@/components/Modal";
import { DateInput } from "@/components/DateInput";
import { Chip } from "@/components/Chip";
import { fmtDate } from "@/lib/date";

type ProjectOpt = { id: string; name: string };
type CustomerOpt = { id: string; name: string };
type BankOpt = { id: string; name: string };
type Income = {
  id: string;
  description: string;
  amount_sek: number | string;
  source: string | null;
  date: string | null;
  status: string;
  customer_id: string | null;
  project_id: string | null;
  bank_account_id: string | null;
  // Migration 0031 / 0036 — saknas tills de körts.
  recurring_income_id?: string | null;
  invoice_id?: string | null;
};

const SEK = (n: number) =>
  new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(n);

const INCOME_STATUS: Record<string, string> = {
  pending: "Väntar",
  received: "Mottagen",
  late: "Försenad",
};

const emptyForm = {
  description: "",
  amount_sek: "",
  source: "",
  date: "",
  status: "pending",
  customer_id: "",
  project_id: "",
  bank_account_id: "",
};

function IncomeFormModal({
  open,
  onClose,
  customers,
  projects,
  bankAccounts,
  initial,
  invoiceNumber,
}: {
  open: boolean;
  onClose: () => void;
  customers: CustomerOpt[];
  projects: ProjectOpt[];
  bankAccounts: BankOpt[];
  initial?: Income | null;
  invoiceNumber?: string | null;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isEdit = !!initial;
  // Intäkter från betalda fakturor styrs av fakturan (trigger i migration
  // 0036) — bara projekt och bankkonto kan sättas här.
  const linkedInvoiceId = initial?.invoice_id ?? null;
  const [f, setF] = useState(() =>
    initial
      ? {
          description: initial.description ?? "",
          amount_sek: String(initial.amount_sek ?? ""),
          source: initial.source ?? "",
          date: initial.date ?? "",
          status: initial.status ?? "pending",
          customer_id: initial.customer_id ?? "",
          project_id: initial.project_id ?? "",
          bank_account_id: initial.bank_account_id ?? "",
        }
      : emptyForm,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.description.trim()) return;
    setSaving(true);
    const payload = linkedInvoiceId
      ? { project_id: f.project_id || null, bank_account_id: f.bank_account_id || null }
      : {
      description: f.description,
      amount_sek: Number(f.amount_sek || 0),
      source: f.source || null,
      date: f.date || null,
      status: f.status,
      customer_id: f.customer_id || null,
      project_id: f.project_id || null,
      bank_account_id: f.bank_account_id || null,
        };
    const { error } =
      isEdit && initial
        ? await supabase.from("income").update(payload).eq("id", initial.id)
        : await supabase.from("income").insert(payload);
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
    if (!confirm("Ta bort denna intäkt?")) return;
    setDeleting(true);
    const { error } = await supabase.from("income").delete().eq("id", initial.id);
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
          {isEdit ? "Redigera intäkt" : "Ny intäkt"}
        </h3>
        {linkedInvoiceId ? (
          <div className="rounded-btn border border-teal-400/20 bg-teal-400/5 p-3 text-sm space-y-1">
            <div className="font-medium">{f.description}</div>
            <div className="font-mono text-xs">
              {SEK(Number(f.amount_sek || 0))} · mottagen {fmtDate(f.date)}
            </div>
            <div className="text-xs text-[var(--muted)]">
              Bokförd automatiskt när fakturan registrerades som betald. Belopp, datum och kund följer{" "}
              <Link href={`/admin/invoices/${linkedInvoiceId}`} className="underline hover:text-white">
                faktura {invoiceNumber ?? ""}
              </Link>
              .
            </div>
          </div>
        ) : (
        <input
          autoFocus
          required
          {...bind("description")}
          placeholder="Beskrivning"
          className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2"
        />
        )}
        <div className="grid grid-cols-2 gap-3">
          {!linkedInvoiceId && (
          <>
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
          <DateInput
            {...bindDate("date")}
            ariaLabel="Datum"
            className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
          />
          <select
            {...bind("status")}
            className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
          >
            <option value="pending">Väntar</option>
            <option value="received">Mottagen</option>
            <option value="late">Försenad</option>
          </select>
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
          </>
          )}
          <select
            {...bind("project_id")}
            className={`rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm ${linkedInvoiceId ? "col-span-2" : ""}`}
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
        <div className="flex justify-between gap-2">
          <div>
            {isEdit && !linkedInvoiceId && (
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

export function NewIncomeButton({
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
        <TrendingUp size={16} />
        Ny intäkt
      </button>
      {open && (
        <IncomeFormModal
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

export function IncomeTable({
  rows,
  customers,
  projects,
  bankAccounts,
  invoiceNumbers = {},
}: {
  rows: Income[];
  customers: CustomerOpt[];
  projects: ProjectOpt[];
  bankAccounts: BankOpt[];
  invoiceNumbers?: Record<string, string>;
}) {
  const [edit, setEdit] = useState<Income | null>(null);
  const projectName = (id: string | null) => (id ? projects.find((p) => p.id === id)?.name ?? null : null);
  const customerName = (id: string | null) => (id ? customers.find((c) => c.id === id)?.name ?? null : null);
  const bankName = (id: string | null) => (id ? bankAccounts.find((b) => b.id === id)?.name ?? null : null);
  return (
    <>
      <table className="w-full text-sm min-w-[540px]">
        <thead className="bg-white/[0.03] text-left text-[var(--muted)] text-xs uppercase tracking-wider">
          <tr>
            <th className="p-3">Beskrivning</th>
            <th className="p-3">Kund</th>
            <th className="p-3">Projekt</th>
            <th className="p-3">Konto</th>
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
              <td className="p-3">
                <div className="font-medium">{r.description}</div>
                {r.invoice_id ? (
                  <div className="mt-0.5">
                    <Chip tone="teal">Från faktura</Chip>
                  </div>
                ) : r.recurring_income_id ? (
                  <div className="mt-0.5">
                    <Chip tone="purple">Återkommande</Chip>
                  </div>
                ) : (
                  r.source && <div className="text-xs text-[var(--muted)]">{r.source}</div>
                )}
              </td>
              <td className="p-3 text-[var(--muted)]">{customerName(r.customer_id) ?? "—"}</td>
              <td className="p-3 text-[var(--muted)]">{projectName(r.project_id) ?? "—"}</td>
              <td className="p-3 text-[var(--muted)]">{bankName(r.bank_account_id) ?? "—"}</td>
              <td className="p-3 text-[var(--muted)]">{fmtDate(r.date)}</td>
              <td className="p-3 font-mono">{SEK(Number(r.amount_sek || 0))}</td>
              <td className="p-3">
                <Chip tone={r.status === "received" ? "green" : r.status === "pending" ? "yellow" : "red"}>
                  {INCOME_STATUS[r.status] ?? r.status}
                </Chip>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={7} className="p-8 text-center text-sm text-[var(--muted)]">
                Inga intäkter än.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {edit && (
        <IncomeFormModal
          open={!!edit}
          onClose={() => setEdit(null)}
          customers={customers}
          projects={projects}
          bankAccounts={bankAccounts}
          initial={edit}
          invoiceNumber={edit.invoice_id ? invoiceNumbers[edit.invoice_id] ?? null : null}
        />
      )}
    </>
  );
}
