import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Chip } from "@/components/Chip";
import { money } from "@/lib/accounting/core";
import { fmtDate, fmtDateTime } from "@/lib/date";
import { Section } from "../../../finance/FinanceBlocks";
import { ReverseButton } from "./ReverseButton";

export const dynamic = "force-dynamic";

const fileHref = (path: string) => `/admin/finance/files/download?path=${encodeURIComponent(path)}`;

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: entry } = await supabase.from("journal_entries").select("*").eq("id", id).maybeSingle();
  if (!entry) notFound();

  const [{ data: lines }, { data: accounts }, { data: reversal }, { data: original }, { data: author }] = await Promise.all([
    supabase.from("journal_lines").select("*").eq("entry_id", id).order("line_no"),
    supabase.from("accounting_accounts").select("number,name"),
    supabase.from("journal_entries").select("id,series,number").eq("reverses_entry_id", id).maybeSingle(),
    entry.reverses_entry_id
      ? supabase.from("journal_entries").select("id,series,number").eq("id", entry.reverses_entry_id).maybeSingle()
      : Promise.resolve({ data: null }),
    entry.created_by
      ? supabase.from("profiles").select("display_name,email").eq("id", entry.created_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const nameOf = new Map((accounts ?? []).map((a: any) => [a.number, a.name]));

  // Underlaget: vart verifikationen kommer ifrån och dess fil.
  const [sourceType, sourceId] = String(entry.source_key ?? "").split(":");
  const underlag: { label: string; href: string }[] = [];
  if (entry.attachment_path) underlag.push({ label: "Bifogad fil", href: fileHref(entry.attachment_path) });
  if (sourceType === "invoice" || sourceType === "invoice-paid") {
    underlag.push({ label: "Fakturan", href: `/admin/invoices/${sourceId}` });
    underlag.push({ label: "Faktura-PDF", href: `/admin/api/invoices/${sourceId}/pdf` });
  }
  if (sourceType === "bank") {
    const { data: tx } = await supabase.from("bank_transactions").select("receipt_path").eq("id", sourceId).maybeSingle();
    underlag.push({ label: "Banktransaktioner", href: "/admin/finance" });
    if (tx?.receipt_path) underlag.push({ label: "Kvitto", href: fileHref(tx.receipt_path) });
  }
  if (sourceType === "payment" || sourceType === "payment-paid") {
    const { data: p } = await supabase.from("payments").select("invoice_path").eq("id", sourceId).maybeSingle();
    if (p?.invoice_path) underlag.push({ label: "Leverantörsfaktura", href: fileHref(p.invoice_path) });
  }
  if (sourceType === "expense" || sourceType === "expense-paid") {
    const { data: x } = await supabase.from("expenses").select("receipt_url").eq("id", sourceId).maybeSingle();
    if (x?.receipt_url) underlag.push({ label: "Kvitto", href: fileHref(x.receipt_url) });
  }
  if (sourceType === "vat-close" || sourceType === "vat-settle") {
    underlag.push({ label: "Momsrapporten", href: "/admin/bookkeeping/moms" });
  }

  const rows = lines ?? [];
  const total = rows.reduce((s: number, l: any) => s + Number(l.debit), 0);

  return (
    <>
      <Link
        href="/admin/bookkeeping/verifikationer"
        className="mb-3 inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-white"
      >
        <ArrowLeft size={13} /> Verifikationer
      </Link>
      <Section
        title={`${entry.series}${entry.number} · ${entry.description}`}
        hint={`Bokföringsdag ${fmtDate(entry.date)}. Registrerad ${fmtDateTime(entry.created_at)}${
          author ? ` av ${(author as any).display_name ?? (author as any).email}` : ""
        }.`}
        right={
          <>
            {entry.reverses_entry_id && original && (
              <Link href={`/admin/bookkeeping/verifikationer/${(original as any).id}`}>
                <Chip tone="orange">
                  Rättelse av {(original as any).series}
                  {(original as any).number}
                </Chip>
              </Link>
            )}
            {reversal ? (
              <Link href={`/admin/bookkeeping/verifikationer/${(reversal as any).id}`}>
                <Chip tone="gray">
                  Rättad i {(reversal as any).series}
                  {(reversal as any).number}
                </Chip>
              </Link>
            ) : (
              !entry.reverses_entry_id && <ReverseButton entryId={id} label={`${entry.series}${entry.number}`} />
            )}
          </>
        }
      >
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
            <tr>
              <th className="p-3">Konto</th>
              <th className="p-3 text-right">Debet</th>
              <th className="p-3 text-right">Kredit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((l: any) => (
              <tr key={l.id}>
                <td className="p-3">
                  <Link
                    href={`/admin/bookkeeping/huvudbok?konto=${l.account}#k${l.account}`}
                    className="font-mono hover:text-teal-300"
                  >
                    {l.account}
                  </Link>{" "}
                  {nameOf.get(l.account)}
                  {l.vat_box && (
                    <span className="ml-2">
                      <Chip tone="blue">Ruta {l.vat_box}</Chip>
                    </span>
                  )}
                </td>
                <td className="p-3 text-right font-mono tabular-nums">{Number(l.debit) ? money(l.debit) : ""}</td>
                <td className="p-3 text-right font-mono tabular-nums">{Number(l.credit) ? money(l.credit) : ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-white/10 font-medium">
            <tr>
              <td className="p-3">Summa</td>
              <td className="p-3 text-right font-mono tabular-nums">{money(total)}</td>
              <td className="p-3 text-right font-mono tabular-nums">{money(total)}</td>
            </tr>
          </tfoot>
        </table>
        <div className="flex flex-wrap items-center gap-3 border-t border-white/5 px-5 py-3 text-xs">
          <span className="text-[var(--muted)]">Underlag:</span>
          {underlag.length ? (
            underlag.map((u) => (
              <a key={u.href} href={u.href} className="inline-flex items-center gap-1 text-teal-300 hover:text-teal-200">
                <FileText size={12} /> {u.label}
              </a>
            ))
          ) : entry.reverses_entry_id ? (
            <span className="text-[var(--muted)]">Samma som originalverifikationen</span>
          ) : (
            <span className="text-amber-300">Inget underlag bifogat</span>
          )}
        </div>
      </Section>
    </>
  );
}
