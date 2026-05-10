"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Upload,
  Phone,
  Mail,
  Globe,
  MapPin,
  Trash2,
  Search,
  CheckCircle2,
  CalendarClock,
  XCircle,
  RotateCcw,
} from "lucide-react";
import { Chip } from "@/components/Chip";
import { Modal } from "@/components/Modal";

export type Lead = {
  id: string;
  project_id: string;
  fit_tier: string | null;
  business_name: string | null;
  industry: string | null;
  neighborhood: string | null;
  street_address: string | null;
  phone: string | null;
  website: string | null;
  public_email: string | null;
  status: string; // new | followup | meeting | nolead
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type Status = "new" | "followup" | "meeting" | "nolead";

const STATUS_FILTERS: Array<{ key: Status | "all"; label: string }> = [
  { key: "all", label: "Alla" },
  { key: "new", label: "Nya" },
  { key: "followup", label: "Uppföljning" },
  { key: "meeting", label: "Möte" },
  { key: "nolead", label: "Inget" },
];

const STATUS_TONE: Record<Status, "gray" | "yellow" | "teal" | "red"> = {
  new: "gray",
  followup: "yellow",
  meeting: "teal",
  nolead: "red",
};

const STATUS_LABEL: Record<Status, string> = {
  new: "Ny",
  followup: "Uppföljning",
  meeting: "Möte",
  nolead: "Inget lead",
};

const FIT_TONE: Record<string, "green" | "yellow" | "gray"> = {
  STRONG: "green",
  MEDIUM: "yellow",
  WEAK: "gray",
};

// Map common header variants → our column keys.
const HEADER_MAP: Record<string, keyof Omit<Lead, "id" | "project_id" | "status" | "notes" | "created_at" | "updated_at">> = {
  "fit tier": "fit_tier",
  "fit": "fit_tier",
  "tier": "fit_tier",
  "business name": "business_name",
  "business": "business_name",
  "name": "business_name",
  "company": "business_name",
  "industry / category": "industry",
  "industry": "industry",
  "category": "industry",
  "neighborhood": "neighborhood",
  "area": "neighborhood",
  "street address": "street_address",
  "address": "street_address",
  "phone": "phone",
  "phone number": "phone",
  "tel": "phone",
  "website": "website",
  "url": "website",
  "public email": "public_email",
  "email": "public_email",
};

export function LeadsManager({
  projectId,
  initial,
}: {
  projectId: string;
  initial: Lead[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>(initial);
  const [filter, setFilter] = useState<Status | "all">("all");
  const [query, setQuery] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<Array<Partial<Lead>>>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const counts = useMemo(() => {
    const c = { all: leads.length, new: 0, followup: 0, meeting: 0, nolead: 0 };
    for (const l of leads) {
      if (l.status in c) (c as any)[l.status]++;
    }
    return c;
  }, [leads]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      if (filter !== "all" && l.status !== filter) return false;
      if (!q) return true;
      return (
        (l.business_name ?? "").toLowerCase().includes(q) ||
        (l.industry ?? "").toLowerCase().includes(q) ||
        (l.neighborhood ?? "").toLowerCase().includes(q) ||
        (l.street_address ?? "").toLowerCase().includes(q) ||
        (l.phone ?? "").toLowerCase().includes(q) ||
        (l.public_email ?? "").toLowerCase().includes(q)
      );
    });
  }, [leads, filter, query]);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setParseError(null);
    setParsed([]);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error("Hittade inget kalkylblad i filen.");
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
        defval: "",
        raw: false,
      });

      const mapped: Array<Partial<Lead>> = [];
      for (const r of rows) {
        const out: Partial<Lead> = {};
        for (const [k, v] of Object.entries(r)) {
          const key = HEADER_MAP[k.trim().toLowerCase()];
          if (!key) continue;
          const value = String(v ?? "").trim();
          if (value) (out as any)[key] = value;
        }
        if (out.business_name || out.phone || out.public_email) mapped.push(out);
      }

      if (mapped.length === 0) {
        throw new Error(
          "Hittade inga rader. Kontrollera att filen har kolumner som 'Business name', 'Phone' osv.",
        );
      }
      setParsed(mapped);
    } catch (err: any) {
      setParseError(err?.message ?? "Kunde inte läsa filen.");
    } finally {
      setParsing(false);
    }
  }

  async function importParsed() {
    if (parsed.length === 0) return;
    setImporting(true);
    try {
      const rows = parsed.map((p) => ({
        project_id: projectId,
        fit_tier: p.fit_tier ?? null,
        business_name: p.business_name ?? null,
        industry: p.industry ?? null,
        neighborhood: p.neighborhood ?? null,
        street_address: p.street_address ?? null,
        phone: p.phone ?? null,
        website: p.website ?? null,
        public_email: p.public_email ?? null,
        status: "new",
      }));
      const { data, error } = await supabase
        .from("leads")
        .insert(rows)
        .select("*");
      if (error) throw error;
      setLeads((prev) => [...((data as Lead[]) ?? []), ...prev]);
      setUploadOpen(false);
      setParsed([]);
      router.refresh();
    } catch (err: any) {
      alert(err?.message ?? "Kunde inte importera leads.");
    } finally {
      setImporting(false);
    }
  }

  async function setStatus(lead: Lead, next: Status) {
    const prev = lead.status;
    setLeads((curr) =>
      curr.map((l) => (l.id === lead.id ? { ...l, status: next } : l)),
    );
    const { error } = await supabase
      .from("leads")
      .update({ status: next })
      .eq("id", lead.id);
    if (error) {
      setLeads((curr) =>
        curr.map((l) => (l.id === lead.id ? { ...l, status: prev } : l)),
      );
      alert(error.message);
    }
  }

  async function remove(lead: Lead) {
    if (!confirm(`Ta bort "${lead.business_name ?? "lead"}"?`)) return;
    const snapshot = leads;
    setLeads((curr) => curr.filter((l) => l.id !== lead.id));
    const { error } = await supabase.from("leads").delete().eq("id", lead.id);
    if (error) {
      setLeads(snapshot);
      alert(error.message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => {
            const active = filter === f.key;
            const n = (counts as any)[f.key] ?? 0;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-btn px-3 py-1.5 text-xs font-medium border transition-colors ${
                  active
                    ? "bg-white/10 text-white border-white/15"
                    : "border-white/5 text-[var(--muted)] hover:text-white hover:bg-white/5"
                }`}
              >
                {f.label}
                <span className="ml-1.5 text-[10px] text-[var(--muted)]">{n}</span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Sök…"
              className="rounded-btn bg-black/30 border border-white/10 pl-8 pr-3 py-1.5 text-sm text-white w-48"
            />
          </div>
          <button
            onClick={() => setUploadOpen(true)}
            className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-3 py-1.5 text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm shadow-teal-500/20"
          >
            <Upload size={14} />
            Ladda upp
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-card border border-dashed border-white/10 p-10 text-center text-sm text-[var(--muted)]">
          {leads.length === 0
            ? "Inga leads än. Ladda upp en Excel- eller CSV-fil för att komma igång."
            : "Inga leads matchar filtret."}
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((l) => (
            <LeadRow
              key={l.id}
              lead={l}
              onSetStatus={(s) => setStatus(l, s)}
              onRemove={() => remove(l)}
            />
          ))}
        </ul>
      )}

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)}>
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-2xl glass rounded-modal p-6 space-y-4 max-h-[90vh] overflow-auto"
        >
          <div>
            <h3 className="font-heading text-lg font-semibold">Ladda upp leads</h3>
            <p className="text-xs text-[var(--muted)] mt-1">
              Excel (.xlsx), Numbers-export eller CSV. Förväntade kolumner:
              <span className="text-white/80"> Fit tier, Business name, Industry / category, Neighborhood, Street address, Phone, Website, Public email</span>.
            </p>
          </div>

          <input
            type="file"
            accept=".xlsx,.xls,.csv,.tsv,.numbers"
            onChange={onPickFile}
            className="block w-full text-sm text-white file:mr-3 file:rounded-btn file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-white/20"
          />

          {parsing && (
            <div className="text-xs text-[var(--muted)]">Läser fil…</div>
          )}
          {parseError && (
            <div className="rounded-btn bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-xs text-rose-200">
              {parseError}
            </div>
          )}

          {parsed.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-[var(--muted)]">
                {parsed.length} rader hittades. Förhandsvisning av de första 5:
              </div>
              <div className="rounded-btn border border-white/10 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-white/5 text-[var(--muted)]">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Fit</th>
                      <th className="px-2 py-1.5 text-left">Företag</th>
                      <th className="px-2 py-1.5 text-left">Bransch</th>
                      <th className="px-2 py-1.5 text-left">Telefon</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.slice(0, 5).map((p, i) => (
                      <tr key={i} className="border-t border-white/5">
                        <td className="px-2 py-1.5">{p.fit_tier ?? "—"}</td>
                        <td className="px-2 py-1.5">{p.business_name ?? "—"}</td>
                        <td className="px-2 py-1.5">{p.industry ?? "—"}</td>
                        <td className="px-2 py-1.5">{p.phone ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setUploadOpen(false);
                setParsed([]);
                setParseError(null);
              }}
              className="rounded-btn px-3 py-2 text-sm text-[var(--muted)]"
            >
              Avbryt
            </button>
            <button
              type="button"
              onClick={importParsed}
              disabled={importing || parsed.length === 0}
              className="rounded-btn bg-teal-500 hover:bg-teal-400 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {importing ? "Importerar…" : `Importera ${parsed.length} leads`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function LeadRow({
  lead,
  onSetStatus,
  onRemove,
}: {
  lead: Lead;
  onSetStatus: (s: Status) => void;
  onRemove: () => void;
}) {
  const status = (lead.status as Status) ?? "new";
  return (
    <li className="rounded-card border border-white/5 bg-black/20 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            {lead.fit_tier && (
              <Chip tone={FIT_TONE[lead.fit_tier.toUpperCase()] ?? "gray"}>
                {lead.fit_tier}
              </Chip>
            )}
            <Chip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Chip>
            {lead.industry && (
              <span className="text-[11px] text-[var(--muted)]">
                · {lead.industry}
              </span>
            )}
          </div>
          <div className="font-heading font-semibold truncate">
            {lead.business_name ?? "(utan namn)"}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
            {(lead.street_address || lead.neighborhood) && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={12} />
                {[lead.street_address, lead.neighborhood].filter(Boolean).join(" · ")}
              </span>
            )}
            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                className="inline-flex items-center gap-1.5 hover:text-white"
              >
                <Phone size={12} />
                {lead.phone}
              </a>
            )}
            {lead.public_email && (
              <a
                href={`mailto:${lead.public_email}`}
                className="inline-flex items-center gap-1.5 hover:text-white"
              >
                <Mail size={12} />
                {lead.public_email}
              </a>
            )}
            {lead.website && (
              <a
                href={normalizeUrl(lead.website)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-white truncate max-w-[260px]"
              >
                <Globe size={12} />
                {lead.website.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 shrink-0">
          <StatusButton
            active={status === "followup"}
            tone="yellow"
            icon={<RotateCcw size={12} />}
            label="Uppföljning"
            onClick={() => onSetStatus(status === "followup" ? "new" : "followup")}
          />
          <StatusButton
            active={status === "meeting"}
            tone="teal"
            icon={<CalendarClock size={12} />}
            label="Möte"
            onClick={() => onSetStatus(status === "meeting" ? "new" : "meeting")}
          />
          <StatusButton
            active={status === "nolead"}
            tone="red"
            icon={<XCircle size={12} />}
            label="Inget"
            onClick={() => onSetStatus(status === "nolead" ? "new" : "nolead")}
          />
          <button
            onClick={onRemove}
            title="Ta bort"
            className="p-1.5 rounded-btn text-[var(--muted)] hover:text-rose-300 hover:bg-rose-500/10"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </li>
  );
}

function StatusButton({
  active,
  tone,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  tone: "yellow" | "teal" | "red";
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  const palette = {
    yellow: active
      ? "bg-amber-500/20 text-amber-200 border-amber-500/40"
      : "border-white/10 text-[var(--muted)] hover:bg-amber-500/10 hover:text-amber-200",
    teal: active
      ? "bg-teal-500/20 text-teal-200 border-teal-500/40"
      : "border-white/10 text-[var(--muted)] hover:bg-teal-500/10 hover:text-teal-200",
    red: active
      ? "bg-rose-500/20 text-rose-200 border-rose-500/40"
      : "border-white/10 text-[var(--muted)] hover:bg-rose-500/10 hover:text-rose-200",
  } as const;
  return (
    <button
      onClick={onClick}
      className={`rounded-btn px-2.5 py-1.5 text-xs font-medium border transition-colors inline-flex items-center gap-1.5 ${palette[tone]}`}
    >
      {icon}
      {label}
    </button>
  );
}

function normalizeUrl(u: string) {
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u}`;
}
