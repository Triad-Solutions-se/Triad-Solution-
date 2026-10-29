import Link from "next/link";
import { fmtDate } from "@/lib/date";
import { fmtAmount } from "@/lib/invoice";
import { InvoiceStatusChip } from "./InvoiceStatusChip";
import { NewInvoiceButton, type InvoicePreset } from "./NewInvoiceButton";

export type LinkedInvoice = {
  id: string;
  number: string;
  status: string;
  issued_at: string | null;
  due_date: string | null;
  amount_sek: number | string | null;
  currency: string | null;
  credited_invoice_id: string | null;
};

export const LINKED_INVOICE_SELECT =
  "id,number,status,issued_at,due_date,amount_sek,currency,credited_invoice_id";

// Fakturapanel på offert- och avtalssidan: kopplade fakturor + "Fakturera".
export function LinkedInvoices({
  invoices,
  customer,
  preset,
}: {
  invoices: LinkedInvoice[];
  customer: { id: string; name: string } | null;
  preset: InvoicePreset;
}) {
  return (
    <div className="glass rounded-card p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
          Fakturor
        </h2>
        {customer && (
          <NewInvoiceButton
            customers={[customer]}
            preset={{ customerId: customer.id, ...preset }}
            label="Fakturera"
            variant="small"
          />
        )}
      </div>
      {invoices.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">
          {customer ? "Inga fakturor än." : "Koppla en kund för att kunna fakturera."}
        </p>
      ) : (
        <ul className="divide-y divide-white/5 -my-1">
          {invoices.map((inv) => (
            <li key={inv.id} className="py-2 flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <Link href={`/admin/invoices/${inv.id}`} className="font-mono text-xs font-semibold hover:text-teal-300">
                  {inv.number}
                </Link>
                <div className="text-[11px] text-[var(--muted)]">
                  {inv.credited_invoice_id ? "Kreditfaktura · " : ""}
                  {fmtDate(inv.issued_at)}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono text-xs">
                  {fmtAmount(inv.amount_sek)} {inv.currency ?? "SEK"}
                </div>
                <InvoiceStatusChip invoice={inv} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
