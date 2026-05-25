"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Landmark } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Chip } from "@/components/Chip";

export type BankAccount = {
  id: string;
  name: string;
  account_number: string | null;
  bank: string | null;
  currency: string;
  starting_balance: number | string;
  color: string | null;
  archived: boolean;
  notes: string | null;
};

export type BankAccountWithBalance = BankAccount & {
  currentBalance: number;
  inflow: number;
  outflow: number;
};

const SEK = (n: number) =>
  new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(n);

const emptyForm = {
  name: "",
  account_number: "",
  bank: "",
  currency: "SEK",
  starting_balance: "",
  color: "#14b8a6",
  archived: false,
  notes: "",
};

function BankAccountFormModal({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial?: BankAccount | null;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isEdit = !!initial;
  const [f, setF] = useState(() =>
    initial
      ? {
          name: initial.name ?? "",
          account_number: initial.account_number ?? "",
          bank: initial.bank ?? "",
          currency: initial.currency ?? "SEK",
          starting_balance: String(initial.starting_balance ?? ""),
          color: initial.color ?? "#14b8a6",
          archived: initial.archived ?? false,
          notes: initial.notes ?? "",
        }
      : emptyForm,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return;
    setSaving(true);
    const payload = {
      name: f.name,
      account_number: f.account_number || null,
      bank: f.bank || null,
      currency: f.currency || "SEK",
      starting_balance: Number(f.starting_balance || 0),
      color: f.color || null,
      archived: f.archived,
      notes: f.notes || null,
    };
    const { error } =
      isEdit && initial
        ? await supabase.from("bank_accounts").update(payload).eq("id", initial.id)
        : await supabase.from("bank_accounts").insert(payload);
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
    if (!confirm("Ta bort detta bankkonto? Befintliga transaktioner kommer behållas men kopplingen tas bort.")) return;
    setDeleting(true);
    const { error } = await supabase.from("bank_accounts").delete().eq("id", initial.id);
    setDeleting(false);
    if (error) {
      alert(error.message);
      return;
    }
    onClose();
    router.refresh();
  }

  function bind<K extends keyof typeof f>(k: K) {
    return { value: f[k] as any, onChange: (e: any) => setF((p) => ({ ...p, [k]: e.target.value })) };
  }

  return (
    <Modal open={open} onClose={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-lg glass rounded-modal p-6 space-y-3 max-h-[90vh] overflow-auto"
      >
        <h3 className="font-heading text-lg font-semibold">
          {isEdit ? "Redigera bankkonto" : "Nytt bankkonto"}
        </h3>
        <input
          autoFocus
          required
          {...bind("name")}
          placeholder="Namn (t.ex. Företagskonto SEB)"
          className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            {...bind("bank")}
            placeholder="Bank"
            className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
          />
          <input
            {...bind("account_number")}
            placeholder="Kontonummer"
            className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
          />
          <input
            {...bind("starting_balance")}
            type="number"
            step="0.01"
            placeholder="Ingående saldo (SEK)"
            className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
          />
          <input
            {...bind("currency")}
            placeholder="Valuta"
            className="rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
          />
          <label className="text-xs text-[var(--muted)] flex items-center gap-2">
            Färg
            <input
              type="color"
              {...bind("color")}
              className="h-9 w-12 rounded-btn bg-black/30 border border-white/10 cursor-pointer"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <input
              type="checkbox"
              checked={f.archived}
              onChange={(e) => setF((p) => ({ ...p, archived: e.target.checked }))}
            />
            Arkiverad
          </label>
        </div>
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

export function NewBankAccountButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-btn border border-white/10 hover:bg-white/5 px-3 py-2 text-sm font-medium flex items-center gap-2"
      >
        <Landmark size={16} />
        Nytt konto
      </button>
      {open && <BankAccountFormModal open={open} onClose={() => setOpen(false)} />}
    </>
  );
}

export function BankAccountsGrid({ accounts }: { accounts: BankAccountWithBalance[] }) {
  const [edit, setEdit] = useState<BankAccount | null>(null);
  if (!accounts.length) {
    return (
      <div className="p-8 text-center text-sm text-[var(--muted)]">
        Inga bankkonton. Lägg till ett konto för att spåra kassa & cashflow.
      </div>
    );
  }
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
        {accounts.map((a) => {
          const negative = a.currentBalance < 0;
          return (
            <button
              key={a.id}
              onClick={() => setEdit(a)}
              className="text-left glass rounded-xl border border-white/10 p-4 hover:bg-white/[0.04] transition-colors relative overflow-hidden"
            >
              <div
                className="absolute left-0 top-0 bottom-0 w-1"
                style={{ background: a.color ?? "#14b8a6" }}
              />
              <div className="pl-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium truncate">{a.name}</div>
                  {a.archived && <Chip tone="gray">Arkiverat</Chip>}
                </div>
                <div className="text-xs text-[var(--muted)] mt-0.5 truncate">
                  {[a.bank, a.account_number].filter(Boolean).join(" • ") || "—"}
                </div>
                <div
                  className={`font-heading text-2xl font-bold mt-3 ${
                    negative ? "text-rose-300" : "text-emerald-300"
                  }`}
                >
                  {SEK(a.currentBalance)}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-[var(--muted)]">
                  <span>
                    In:{" "}
                    <span className="text-emerald-300 font-mono">{SEK(a.inflow)}</span>
                  </span>
                  <span>
                    Ut:{" "}
                    <span className="text-rose-300 font-mono">{SEK(a.outflow)}</span>
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {edit && (
        <BankAccountFormModal open={!!edit} onClose={() => setEdit(null)} initial={edit} />
      )}
    </>
  );
}
