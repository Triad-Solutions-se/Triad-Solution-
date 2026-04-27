"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Pencil, Check, X, Mail, Phone, User, Globe } from "lucide-react";

type Customer = {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
} | null;

type Initial = {
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
};

export function ProjectContactEditor({
  projectId,
  customer,
  initial,
}: {
  projectId: string;
  customer: Customer;
  initial: Initial;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    contact_name: initial.contact_name ?? "",
    contact_email: initial.contact_email ?? "",
    contact_phone: initial.contact_phone ?? "",
  });

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("projects")
      .update({
        contact_name: f.contact_name || null,
        contact_email: f.contact_email || null,
        contact_phone: f.contact_phone || null,
      })
      .eq("id", projectId);
    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  const hasProjectContact =
    initial.contact_name || initial.contact_email || initial.contact_phone;

  return (
    <div className="space-y-4 text-sm">
      {customer && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1">Kund</div>
          <div className="font-medium">{customer.name}</div>
          {customer.contact_person && (
            <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <User size={12} /> {customer.contact_person}
            </div>
          )}
          {customer.email && (
            <a
              href={`mailto:${customer.email}`}
              className="flex items-center gap-2 text-xs text-[var(--muted)] hover:text-white"
            >
              <Mail size={12} /> {customer.email}
            </a>
          )}
          {customer.phone && (
            <a
              href={`tel:${customer.phone}`}
              className="flex items-center gap-2 text-xs text-[var(--muted)] hover:text-white"
            >
              <Phone size={12} /> {customer.phone}
            </a>
          )}
          {customer.website && (
            <a
              href={customer.website.startsWith("http") ? customer.website : `https://${customer.website}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-xs text-teal-400 hover:underline"
            >
              <Globe size={12} /> {customer.website}
            </a>
          )}
        </div>
      )}

      {editing ? (
        <div className="space-y-2 border-t border-white/5 pt-3">
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
            Projektkontakt
          </div>
          <input
            value={f.contact_name}
            onChange={(e) => setF((p) => ({ ...p, contact_name: e.target.value }))}
            placeholder="Namn"
            className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
          />
          <input
            type="email"
            value={f.contact_email}
            onChange={(e) => setF((p) => ({ ...p, contact_email: e.target.value }))}
            placeholder="E-post"
            className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
          />
          <input
            value={f.contact_phone}
            onChange={(e) => setF((p) => ({ ...p, contact_phone: e.target.value }))}
            placeholder="Telefon"
            className="w-full rounded-btn bg-black/30 border border-white/10 px-3 py-2 text-sm"
          />
          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={() => setEditing(false)}
              className="rounded-btn px-3 py-1.5 text-xs text-[var(--muted)] inline-flex items-center gap-1"
            >
              <X size={12} /> Avbryt
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
            >
              <Check size={12} /> {saving ? "Sparar…" : "Spara"}
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t border-white/5 pt-3">
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1.5">
            Projektkontakt
          </div>
          {hasProjectContact ? (
            <div className="space-y-1.5">
              {initial.contact_name && (
                <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                  <User size={12} /> {initial.contact_name}
                </div>
              )}
              {initial.contact_email && (
                <a
                  href={`mailto:${initial.contact_email}`}
                  className="flex items-center gap-2 text-xs text-[var(--muted)] hover:text-white"
                >
                  <Mail size={12} /> {initial.contact_email}
                </a>
              )}
              {initial.contact_phone && (
                <a
                  href={`tel:${initial.contact_phone}`}
                  className="flex items-center gap-2 text-xs text-[var(--muted)] hover:text-white"
                >
                  <Phone size={12} /> {initial.contact_phone}
                </a>
              )}
            </div>
          ) : (
            <div className="text-xs text-[var(--muted)]">Ingen projektspecifik kontakt.</div>
          )}
          <button
            onClick={() => setEditing(true)}
            className="mt-3 w-full rounded-btn border border-white/10 hover:bg-white/5 px-3 py-2 text-xs font-medium text-[var(--muted)] hover:text-white inline-flex items-center justify-center gap-2"
          >
            <Pencil size={12} />
            {hasProjectContact ? "Redigera" : "Lägg till"}
          </button>
        </div>
      )}
    </div>
  );
}
