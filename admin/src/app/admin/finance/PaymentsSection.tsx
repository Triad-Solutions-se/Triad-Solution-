"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus } from "lucide-react";
import { Modal } from "@/components/Modal";
import { DateInput } from "@/components/DateInput";
import { Chip } from "@/components/Chip";
import { fmtDate } from "@/lib/date";

type Profile = { id: string; display_name: string | null; email: string | null };
type Payment = {
  id: string;
  description: string;
  amount_sek: number | string;
  category: string | null;
  assignee_id: string | null;
  assignee?: { id: string; display_name: string | null; email: string | null } | null;
  due_date: string | null;
  status: string;
  notes: string | null;
  invoice_path: string | null;
};

const SEK = (n: number) =>
  new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(n);

const emptyForm = {
  description: "",
  amount_sek: "",
  category: "",
  assignee_id: "",
  due_date: "",
  status: "pending",
  notes: "",
};

function PaymentFormModal({
  open,
  onClose,
  profiles,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  profiles: Profile[];
  initial?: Payment | null;
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
          category: initial.category ?? "",
          assignee_id: initial.assignee_id ?? "",
          due_date: initial.due_date ?? "",
          status: initial.status ?? "pending",
          notes: initial.notes ?? "",
        }
      : emptyForm,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.description.trim()) return;
    setSaving(true);
    try {
      let invoice_path = initial?.invoice_path ?? null;
      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `payments/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage.from("finance").upload(path, file);
        if (upErr) throw upErr;
        invoice_path = path;
      }
      const payload = {
        description: f.description,
        amount_sek: Number(f.amount_sek || 0),
        category: f.category || null,
        assignee_id: f.assignee_id || null,
        due_date: f.due_date || null,
        status: f.status,
        notes: f.notes || null,
        invoice_path,
      };
      if (isEdit && initial) {
        const { error } = await supabase.from("payments").update(payload).eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("payments").insert(payload);
        if (error) throw error;
      }
      onClose();
      router.refresh();
    } catch (err: any) {
      alert(err.message ?? "Kunde inte spara betalning");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!initial) return;
    if (!confirm("Ta bort denna betalning?")) return;
    setDeleting(true);
    const { error } = await supabase.from("payments").delete().eq("id", initial.id);
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
          {isEdit ? "Redigera betalning" : "Ny betalning"}
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
          <select
            {...bind("assignee_id")}
            className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
          >
            <option value="">Tilldela…</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name ?? p.email ?? p.id.slice(0, 8)}
              </option>
            ))}
          </select>
          <DateInput
            {...bindDate("due_date")}
            ariaLabel="Förfallodag"
            className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
          />
          <select
            {...bind("status")}
            className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm col-span-2"
          >
            <option value="pending">Väntar</option>
            <option value="paid">Betald</option>
            <option value="overdue">Försenad</option>
          </select>
        </div>
        <label className="block text-xs text-[var(--muted)]">
          Faktura (PDF / bild) {initial?.invoice_path && <span className="text-teal-300">— befintlig fil bifogad</span>}
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

export function NewPaymentButton({ profiles }: { profiles: Profile[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-3 py-2 text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm shadow-teal-500/20"
      >
        <Plus size={16} />
        Ny betalning
      </button>
      {open && (
        <PaymentFormModal open={open} onClose={() => setOpen(false)} profiles={profiles} />
      )}
    </>
  );
}

function InvoiceLink({ path }: { path: string }) {
  const name = path.split("/").pop() ?? "Faktura";
  return (
    <a
      href={`/admin/finance/files/download?path=${encodeURIComponent(path)}`}
      onClick={(e) => e.stopPropagation()}
      className="text-xs text-teal-400 hover:underline"
    >
      {name}
    </a>
  );
}

export function PaymentsTable({
  rows,
  profiles,
}: {
  rows: Payment[];
  profiles: Profile[];
}) {
  const [edit, setEdit] = useState<Payment | null>(null);
  return (
    <>
      <table className="w-full text-sm min-w-[640px]">
        <thead className="bg-white/[0.03] text-left text-[var(--muted)] text-xs uppercase tracking-wider">
          <tr>
            <th className="p-3">Beskrivning</th>
            <th className="p-3">Tilldelad</th>
            <th className="p-3">Kategori</th>
            <th className="p-3">Förfaller</th>
            <th className="p-3">Belopp</th>
            <th className="p-3">Faktura</th>
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
                {r.notes && <div className="text-xs text-[var(--muted)]">{r.notes}</div>}
              </td>
              <td className="p-3 text-[var(--muted)]">
                {r.assignee?.display_name ?? r.assignee?.email ?? "—"}
              </td>
              <td className="p-3 text-[var(--muted)]">{r.category ?? "—"}</td>
              <td className="p-3 text-[var(--muted)]">{fmtDate(r.due_date)}</td>
              <td className="p-3 font-mono">{SEK(Number(r.amount_sek || 0))}</td>
              <td className="p-3">
                {r.invoice_path ? (
                  <InvoiceLink path={r.invoice_path} />
                ) : (
                  <span className="text-[var(--muted)]">—</span>
                )}
              </td>
              <td className="p-3">
                <Chip tone={r.status === "paid" ? "green" : r.status === "overdue" ? "red" : "yellow"}>
                  {r.status === "paid" ? "Betald" : r.status === "overdue" ? "Försenad" : "Väntar"}
                </Chip>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={7} className="p-8 text-center text-sm text-[var(--muted)]">
                Inga betalningar än.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {edit && (
        <PaymentFormModal
          open={!!edit}
          onClose={() => setEdit(null)}
          profiles={profiles}
          initial={edit}
        />
      )}
    </>
  );
}
