import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { Chip } from "@/components/Chip";
import { ArrowLeft } from "lucide-react";
import { UploadFileButton } from "./UploadFileButton";
import { DeleteFileButton } from "./DeleteFileButton";

export const dynamic = "force-dynamic";

const SEK = (n: number) =>
  new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(n);

const money = (n: number, currency: string) =>
  new Intl.NumberFormat("sv-SE", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

/** Kvitto bifogat på en bokförd banktransaktion, sorterat på bokföringsdagen. */
type ArchiveBankFile = {
  id: string;
  year: number;
  month: number;
  description: string;
  amount: number;
  currency: string;
  file_path: string;
};

const MONTHS_SV = [
  "Januari",
  "Februari",
  "Mars",
  "April",
  "Maj",
  "Juni",
  "Juli",
  "Augusti",
  "September",
  "Oktober",
  "November",
  "December",
];

export default async function FinanceFilesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: files }, { data: bankReceipts }] = await Promise.all([
    supabase
      .from("finance_files")
      .select("*")
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .order("uploaded_at", { ascending: false }),
    // Kvitton bifogade på banktransaktioner (migration 0041). Utan kolumnen: inga.
    supabase
      .from("bank_transactions")
      .select("id,booking_date,amount,currency,counterparty,description,receipt_path")
      .not("receipt_path", "is", null)
      .not("booking_date", "is", null)
      .order("booking_date", { ascending: false }),
  ]);

  const bankFiles: ArchiveBankFile[] = (bankReceipts ?? []).map((t: any) => ({
    id: t.id,
    year: Number(t.booking_date.slice(0, 4)),
    month: Number(t.booking_date.slice(5, 7)),
    description: t.counterparty || t.description || "Banktransaktion",
    amount: Math.abs(Number(t.amount)),
    currency: t.currency || "SEK",
    file_path: t.receipt_path,
  }));
  const all = files ?? [];
  const yearsAvailable = Array.from(
    new Set([...all.map((f: any) => f.year as number), ...bankFiles.map((f) => f.year)]),
  ).sort((a, b) => b - a);
  const currentYear = new Date().getFullYear();
  const selectedYear = sp.year
    ? Number(sp.year)
    : yearsAvailable[0] ?? currentYear;
  const yearFiles = all.filter((f: any) => f.year === selectedYear);

  // Group by month (12 buckets even when empty so the user can upload anywhere)
  const byMonth = new Map<number, any[]>();
  const bankByMonth = new Map<number, ArchiveBankFile[]>();
  for (let m = 1; m <= 12; m++) {
    byMonth.set(m, []);
    bankByMonth.set(m, []);
  }
  for (const f of yearFiles) byMonth.get(f.month)?.push(f);
  for (const f of bankFiles) if (f.year === selectedYear) bankByMonth.get(f.month)?.push(f);

  return (
    <>
      <PageHeader
        title="Månadsarkiv"
        subtitle="Fakturor och kvitton sorterade efter månad. Kvitton som bifogats banktransaktioner på Ekonomi kommer med automatiskt."
        right={
          <div className="flex items-center gap-2">
            <Link
              href="/admin/finance"
              className="rounded-btn border border-white/10 hover:bg-white/5 px-3 py-2 text-sm font-medium flex items-center gap-2"
            >
              <ArrowLeft size={16} />
              Tillbaka
            </Link>
            <UploadFileButton defaultYear={selectedYear} />
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {[...new Set([currentYear, ...yearsAvailable])]
          .sort((a, b) => b - a)
          .map((y) => (
            <Link
              key={y}
              href={`/admin/finance/files?year=${y}`}
              className={`rounded-btn px-3 py-1.5 text-sm font-medium border ${
                y === selectedYear
                  ? "bg-teal-500/20 border-teal-400/40 text-teal-200"
                  : "border-white/10 text-[var(--muted)] hover:bg-white/5 hover:text-white"
              }`}
            >
              {y}
            </Link>
          ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from(byMonth.entries()).map(([month, items]) => {
          const bankItems = bankByMonth.get(month) ?? [];
          const count = items.length + bankItems.length;
          const total =
            items.reduce((s, r) => s + Number(r.amount_sek || 0), 0) +
            bankItems.reduce((s, r) => s + (r.currency === "SEK" ? r.amount : 0), 0);
          return (
            <section
              key={month}
              className="glass rounded-xl border border-white/10 overflow-hidden flex flex-col"
            >
              <header className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                <h2 className="font-heading font-semibold text-sm">
                  {MONTHS_SV[month - 1]} {selectedYear}
                </h2>
                <div className="text-xs text-[var(--muted)]">
                  {count} {count === 1 ? "fil" : "filer"}
                  {total > 0 && <span className="ml-2 font-mono text-white/70">{SEK(total)}</span>}
                </div>
              </header>
              <ul className="divide-y divide-white/5">
                {count === 0 && (
                  <li className="px-4 py-6 text-xs text-[var(--muted)] text-center">Inga filer.</li>
                )}
                {items.map((f: any) => (
                  <li key={f.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {f.description || f.file_path.split("/").pop()}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">
                        <Chip tone={f.type === "invoice" ? "blue" : "gray"}>
                          {f.type === "invoice" ? "Faktura" : "Kvitto"}
                        </Chip>
                        {f.amount_sek != null && (
                          <span className="font-mono">{SEK(Number(f.amount_sek))}</span>
                        )}
                      </div>
                    </div>
                    <a
                      href={`/admin/finance/files/download?path=${encodeURIComponent(f.file_path)}`}
                      className="text-xs text-teal-400 hover:underline shrink-0"
                    >
                      Ladda ner
                    </a>
                    <DeleteFileButton id={f.id} path={f.file_path} />
                  </li>
                ))}
                {bankItems.map((f) => (
                  <li key={f.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{f.description}</div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">
                        {/* Tas bort på transaktionen under Ekonomi, inte här. */}
                        <Chip tone="teal">Bank</Chip>
                        <span className="font-mono">{money(f.amount, f.currency)}</span>
                      </div>
                    </div>
                    <a
                      href={`/admin/finance/files/download?path=${encodeURIComponent(f.file_path)}`}
                      className="text-xs text-teal-400 hover:underline shrink-0"
                    >
                      Ladda ner
                    </a>
                  </li>
                ))}
              </ul>
              <div className="border-t border-white/5 p-3">
                <UploadFileButton defaultYear={selectedYear} defaultMonth={month} compact />
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
