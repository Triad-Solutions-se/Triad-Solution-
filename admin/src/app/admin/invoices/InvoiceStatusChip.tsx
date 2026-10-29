import { Chip } from "@/components/Chip";
import { INVOICE_STATUS, effectiveStatus } from "@/lib/invoice";

// Statuschip med framräknad "Förfallen" för skickade fakturor efter förfallodagen.
export function InvoiceStatusChip({
  invoice,
}: {
  invoice: { status: string | null; due_date: string | null; credited_invoice_id?: string | null };
}) {
  const info = INVOICE_STATUS[effectiveStatus(invoice)];
  return <Chip tone={info.tone}>{info.label}</Chip>;
}
