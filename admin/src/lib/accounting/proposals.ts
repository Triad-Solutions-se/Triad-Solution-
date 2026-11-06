// Kön "Att godkänna": räknar fram konteringsförslag ur underlagen. Ren fil. Inget
// sparas förrän någon godkänner, så förslagen speglar alltid underlagen och de
// senast inlärda reglerna.
//
// Samma regel som cashflow (src/lib/cashflow.ts): på bankkopplade konton är
// banktransaktionen sanningen för pengarna. En betald faktura, betalning eller
// ett återbetalt utlägg blir en egen betalpost bara där banken inte ser pengarna:
// på okopplade konton och före bankhistorikens första dag. Annars bokförs samma
// betalning två gånger.
//
// Fakturametoden: kundfakturor och leverantörsfakturor bokförs när de uppstår
// (kundfordran/leverantörsskuld), och betalningen bokförs mot fordran/skulden.

import { type BankInvoiceMatch, type MatchInvoice, type MatchTransaction, describeMatches } from "../bank-match";
import { fmtDate } from "../date";
import {
  ACC,
  type EntryLine,
  type LineMode,
  type VatCode,
  purchaseLines,
  round2,
  saleFromGross,
  saleLines,
  salesAccounts,
  transferLines,
} from "./core";
import { type AccountingRule, learnPattern, matchRule, normalizeText } from "./rules";

export type ProposalGroup = "in" | "out" | "invoice" | "supplier" | "expense" | "vat";

export const GROUP_LABEL: Record<ProposalGroup, string> = {
  in: "Inbetalningar",
  out: "Utbetalningar",
  invoice: "Kundfakturor",
  supplier: "Leverantörsfakturor",
  expense: "Utlägg",
  vat: "Moms",
};

/** Hur säkert förslaget är: visas som märke i kön. */
export type Confidence = "certain" | "learned" | "rule" | "guess";

export type ProposalLink =
  | { type: "invoice"; id: string; applyMatch: boolean }
  | { type: "payment"; id: string }
  | { type: "expense"; id: string }
  | { type: "income"; id: string };

export type Proposal = {
  key: string;
  group: ProposalGroup;
  /** Bokföringsdatum: underlagets datum, eller första öppna dag om perioden är låst. */
  date: string;
  sourceDate: string;
  title: string;
  description: string;
  /** Pengarnas storlek: + in, − ut. */
  amount: number;
  gross: number;
  lines: EntryLine[];
  mode: LineMode;
  vat: VatCode | null;
  confidence: Confidence;
  reason: string;
  warnings: string[];
  href: string | null;
  /** Banktransaktionen, för kvitto i kön. */
  transactionId: string | null;
  receiptPath: string | null;
  needsReceipt: boolean;
  link: ProposalLink | null;
  learn: { pattern: string; direction: "in" | "out" } | null;
};

export type BankAccountRow = {
  id: string;
  name?: string;
  ledger_account: number | null;
};
export type TxRow = MatchTransaction & {
  bank_account_id: string;
  value_date?: string | null;
  receipt_path?: string | null;
};
export type InvoiceRow = MatchInvoice & {
  net_amount: number | string | null;
  vat_amount: number | string | null;
  vat_rate: number | string | null;
  paid_at: string | null;
  bank_account_id: string | null;
};
export type PaymentRow = {
  id: string;
  description: string;
  amount_sek: number | string | null;
  category: string | null;
  status: string | null;
  due_date: string | null;
  paid_at: string | null;
  bank_account_id: string | null;
  invoice_path: string | null;
  created_at: string;
};
export type ExpenseRow = {
  id: string;
  description: string;
  amount_sek: number | string | null;
  category: string | null;
  paid_by: string | null;
  date: string | null;
  status: string | null;
  bank_account_id: string | null;
  receipt_url: string | null;
  created_at: string;
};
export type IncomeRow = {
  id: string;
  description: string;
  amount_sek: number | string | null;
  date: string | null;
  status: string | null;
  bank_account_id: string | null;
  invoice_id: string | null;
};
export type Decision = {
  source_key: string;
  decision: "booked" | "ignored";
  entry_id: string | null;
  link_key: string | null;
  note?: string | null;
};
export type VatClosing = { periodId: string; label: string; due: string | null; payable: number };

export type QueueInput = {
  startDate: string;
  lockedThrough: string | null;
  bankAccounts: BankAccountRow[];
  /** Kopplat bankkonto → första bokförda dag i bankhistoriken. */
  historyStart: Map<string, string>;
  invoices: InvoiceRow[];
  transactions: TxRow[];
  matches: BankInvoiceMatch[];
  payments: PaymentRow[];
  expenses: ExpenseRow[];
  income: IncomeRow[];
  rules: AccountingRule[];
  decisions: Decision[];
  vatClosings: VatClosing[];
};

export type Skipped = { key: string; title: string; reason: string };

export type QueueResult = {
  proposals: Proposal[];
  ignored: Proposal[];
  /** Underlag som inte föreslås, t.ex. från före bokföringsstarten. */
  skipped: Skipped[];
  /** Alla underlag som ska vara bokförda → bruttobelopp, för att hitta ändrade underlag. */
  desired: Map<string, number>;
};

const isoDay = (s: string | null | undefined) => (s ? s.slice(0, 10) : null);

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Enskild person som lagt ut? "company"/"företaget" betalade direkt från kontot. */
const paidByCompany = (paidBy: string | null) => /^(company|företag(et)?|bolag(et)?)$/i.test((paidBy ?? "").trim());

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) =>
  Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS;

/** En banktransaktion kopplas bara till ett underlag inom så här många dagar. */
const LINK_WINDOW_DAYS = 60;

export function buildQueue(input: QueueInput): QueueResult {
  const decided = new Map(input.decisions.map((d) => [d.source_key, d]));
  const ledgerFor = new Map(input.bankAccounts.map((b) => [b.id, b.ledger_account ?? ACC.BANK]));
  const bankLedger = (id: string | null) => (id ? (ledgerFor.get(id) ?? ACC.BANK) : ACC.BANK);
  const starts = [...input.historyStart.values()].sort();
  const earliestHistory = starts[0] ?? null;

  const coveredByBank = (date: string | null, bankAccountId: string | null) => {
    if (!date) return false;
    const start = bankAccountId ? input.historyStart.get(bankAccountId) : earliestHistory;
    return start != null && date >= start;
  };

  const usedLinks = new Set(input.decisions.map((d) => d.link_key).filter(Boolean) as string[]);
  const proposals: Proposal[] = [];
  const skipped: Skipped[] = [];
  const desired = new Map<string, number>();

  const openDate = (date: string) => {
    if (input.lockedThrough && date <= input.lockedThrough) return nextDay(input.lockedThrough);
    return date;
  };

  type Base = Omit<Proposal, "date" | "sourceDate" | "warnings" | "transactionId" | "receiptPath" | "needsReceipt" | "href" | "link" | "learn" | "vat"> &
    Partial<Pick<Proposal, "warnings" | "transactionId" | "receiptPath" | "needsReceipt" | "href" | "link" | "learn" | "vat">>;

  const add = (date: string, base: Base) => {
    desired.set(base.key, base.gross);
    const warnings = [...(base.warnings ?? [])];
    const when = openDate(date);
    if (when !== date) warnings.push(`Perioden är låst, så posten bokförs på ${fmtDate(when)}.`);
    proposals.push({
      transactionId: null,
      receiptPath: null,
      needsReceipt: false,
      href: null,
      link: null,
      learn: null,
      vat: null,
      ...base,
      warnings,
      date: when,
      sourceDate: date,
    });
  };

  // ---- Kundfakturor --------------------------------------------------------
  const appliedByInvoice = new Set(input.matches.filter((m) => m.status === "applied").map((m) => m.invoice_id));
  for (const inv of input.invoices) {
    if (inv.status === "draft") continue;
    const date = isoDay(inv.issued_at);
    const gross = round2(Number(inv.amount_sek) || 0);
    const title = `${inv.credited_invoice_id ? "Kreditfaktura" : "Faktura"} ${inv.number}`;
    if (!date || date < input.startDate) {
      skipped.push({ key: `invoice:${inv.id}`, title, reason: "Före bokföringsstarten" });
      continue;
    }
    if (gross === 0) continue;
    const ratePct = Number(inv.vat_rate ?? 25) || 0;
    let net = round2(Math.abs(Number(inv.net_amount) || 0));
    let vat = round2(Math.abs(Number(inv.vat_amount) || 0));
    // Fakturor från före fakturasystemet saknar uppdelning.
    if (net === 0 && vat === 0) {
      net = round2(Math.abs(gross) / (1 + ratePct / 100));
      vat = round2(Math.abs(gross) - net);
    }
    const { sales } = salesAccounts(ratePct);
    const warnings: string[] = [];
    if (inv.currency && inv.currency !== "SEK") warnings.push(`Fakturan är i ${inv.currency}: kontrollera kursen.`);
    if (ratePct === 0) warnings.push("Ingen moms: välj 3308 (EU) eller 3305 (utanför EU) om kunden är utländsk.");
    add(date, {
      key: `invoice:${inv.id}`,
      group: "invoice",
      title,
      description: `${title}${inv.customer_name ? ` ${inv.customer_name}` : ""}`,
      amount: gross,
      gross: Math.abs(gross),
      lines: saleLines({ gross, net, vat, ratePct, account: sales, contra: ACC.RECEIVABLES }),
      mode: "fixed",
      confidence: "certain",
      reason: inv.customer_name ?? "Kundfaktura",
      warnings,
      href: `/admin/invoices/${inv.id}`,
    });

    // Betald, men pengarna syns inte i banken: egen betalpost.
    const paidAt = isoDay(inv.paid_at);
    if (
      inv.status === "paid" &&
      !inv.credited_invoice_id &&
      paidAt &&
      !appliedByInvoice.has(inv.id) &&
      !coveredByBank(paidAt, inv.bank_account_id)
    ) {
      const bank = bankLedger(inv.bank_account_id);
      add(paidAt, {
        key: `invoice-paid:${inv.id}`,
        group: "in",
        title: `Betalning av faktura ${inv.number}`,
        description: `Betalning faktura ${inv.number}${inv.customer_name ? ` ${inv.customer_name}` : ""}`,
        amount: gross,
        gross: Math.abs(gross),
        lines: [
          { account: bank, debit: gross, credit: 0, role: "contra" },
          { account: ACC.RECEIVABLES, debit: 0, credit: gross, role: "primary" },
        ],
        mode: "fixed",
        confidence: "certain",
        reason: "Markerad som betald i fakturan",
        href: `/admin/invoices/${inv.id}`,
      });
    }
  }

  // ---- Leverantörsfakturor (Betalningar på Ekonomi) -------------------------
  const textRule = (text: string, direction: "in" | "out") => matchRule(text, direction, input.rules);
  const prefill = (text: string) => {
    const hit = textRule(text, "out");
    if (hit) {
      return {
        account: hit.rule.account,
        vat: hit.rule.vat_code,
        confidence: (hit.rule.origin === "learned" ? "learned" : "rule") as Confidence,
        reason: `Regel: ${hit.rule.pattern}`,
      };
    }
    return {
      account: ACC.OTHER_COSTS,
      vat: "se25" as VatCode,
      confidence: "guess" as Confidence,
      reason: "Ingen regel: kontrollera konto och moms",
    };
  };

  for (const p of input.payments) {
    const created = isoDay(p.created_at)!;
    const date = created;
    const gross = round2(Number(p.amount_sek) || 0);
    if (date < input.startDate) {
      skipped.push({ key: `payment:${p.id}`, title: p.description, reason: "Före bokföringsstarten" });
      continue;
    }
    if (gross === 0) continue;
    const fill = prefill(`${p.description} ${p.category ?? ""}`);
    add(date, {
      key: `payment:${p.id}`,
      group: "supplier",
      title: p.description,
      description: `Leverantörsfaktura ${p.description}`,
      amount: -gross,
      gross: Math.abs(gross),
      lines: purchaseLines({ gross, account: fill.account, vat: fill.vat, contra: ACC.PAYABLES }),
      mode: "purchase",
      vat: fill.vat,
      confidence: fill.confidence,
      reason: fill.reason,
      needsReceipt: !p.invoice_path,
      receiptPath: p.invoice_path,
      href: "/admin/finance",
    });

    const paidAt = isoDay(p.paid_at);
    if (p.status === "paid" && paidAt && !coveredByBank(paidAt, p.bank_account_id)) {
      add(paidAt, {
        key: `payment-paid:${p.id}`,
        group: "out",
        title: `Betalning: ${p.description}`,
        description: `Betalning ${p.description}`,
        amount: -gross,
        gross: Math.abs(gross),
        lines: transferLines(ACC.PAYABLES, bankLedger(p.bank_account_id), gross),
        mode: "fixed",
        confidence: "certain",
        reason: "Markerad som betald",
        href: "/admin/finance",
      });
    }
  }

  // ---- Utlägg ---------------------------------------------------------------
  for (const e of input.expenses) {
    const gross = round2(Number(e.amount_sek) || 0);
    if (gross === 0) continue;
    const company = paidByCompany(e.paid_by);
    const reimbursed = e.status === "reimbursed";
    const ownDate = isoDay(e.date);
    // Utan datum går ett redan återbetalt utlägg inte att placera i tiden.
    if (!ownDate && reimbursed) {
      skipped.push({ key: `expense:${e.id}`, title: e.description, reason: "Återbetalt utlägg utan datum" });
      continue;
    }
    const date = ownDate ?? isoDay(e.created_at)!;
    if (date < input.startDate) {
      skipped.push({ key: `expense:${e.id}`, title: e.description, reason: "Före bokföringsstarten" });
      continue;
    }
    // Företaget betalade från ett bankkopplat konto: banktransaktionen är posten.
    if (company && coveredByBank(date, e.bank_account_id)) continue;

    const fill = prefill(`${e.description} ${e.category ?? ""}`);
    const contra = company ? bankLedger(e.bank_account_id) : ACC.OWNER_DEBT;
    const warnings = ownDate ? [] : ["Utlägget saknar datum: registreringsdagen används, kontrollera mot kvittot."];
    add(date, {
      key: `expense:${e.id}`,
      group: "expense",
      title: e.description,
      description: `Utlägg ${e.description}${e.paid_by ? ` (${e.paid_by})` : ""}`,
      amount: -gross,
      gross: Math.abs(gross),
      lines: purchaseLines({ gross, account: fill.account, vat: fill.vat, contra }),
      mode: "purchase",
      vat: fill.vat,
      confidence: fill.confidence,
      reason: fill.reason,
      warnings,
      needsReceipt: !e.receipt_url,
      receiptPath: e.receipt_url,
      href: "/admin/finance",
    });

    if (!company && reimbursed && !coveredByBank(date, e.bank_account_id)) {
      add(date, {
        key: `expense-paid:${e.id}`,
        group: "out",
        title: `Återbetalning: ${e.description}`,
        description: `Återbetalt utlägg ${e.description}${e.paid_by ? ` till ${e.paid_by}` : ""}`,
        amount: -gross,
        gross: Math.abs(gross),
        lines: transferLines(ACC.OWNER_DEBT, bankLedger(e.bank_account_id), gross),
        mode: "fixed",
        confidence: "certain",
        reason: "Markerat som återbetalt",
        href: "/admin/finance",
      });
    }
  }

  // ---- Kontant försäljning utan faktura (Intäkter på Ekonomi) ---------------
  for (const i of input.income) {
    if (i.invoice_id || i.status !== "received") continue;
    const date = isoDay(i.date);
    const gross = round2(Number(i.amount_sek) || 0);
    if (!date || gross === 0) continue;
    if (date < input.startDate) {
      skipped.push({ key: `income:${i.id}`, title: i.description, reason: "Före bokföringsstarten" });
      continue;
    }
    if (coveredByBank(date, i.bank_account_id)) continue;
    add(date, {
      key: `income:${i.id}`,
      group: "in",
      title: i.description,
      description: `Intäkt ${i.description}`,
      amount: gross,
      gross: Math.abs(gross),
      lines: saleFromGross({ gross, vat: "se25", account: ACC.SALES_25, contra: bankLedger(i.bank_account_id) }),
      mode: "sale",
      vat: "se25",
      confidence: "guess",
      reason: "Registrerad intäkt utan faktura: kontrollera konto och moms",
      href: "/admin/finance",
    });
  }

  // ---- Banktransaktioner ----------------------------------------------------
  // Överhoppade rader sist, så att de inte tar kopplingen från en rad som bokförs.
  const isIgnored = (t: TxRow) => decided.get(`bank:${t.id}`)?.decision === "ignored";
  const booked = input.transactions
    .filter((t) => t.status === "BOOK")
    .sort((a, b) => Number(isIgnored(a)) - Number(isIgnored(b)));
  const matchInfo = describeMatches(booked, input.invoices as MatchInvoice[], input.matches);
  const ownerNames = new Set(
    input.expenses
      .filter((e) => !paidByCompany(e.paid_by))
      .map((e) => normalizeText(e.paid_by))
      .filter((n) => n.length >= 3),
  );

  const takeLink = (key: string) => {
    usedLinks.add(key);
  };

  for (const tx of booked) {
    const key = `bank:${tx.id}`;
    const amount = round2(Number(tx.amount) || 0);
    const date = isoDay(tx.booking_date) ?? isoDay(tx.value_date ?? null);
    const name = (tx.counterparty ?? "").trim();
    const text = (tx.description ?? "").trim();
    const title = name || text || "Banktransaktion";
    if (!date || amount === 0) continue;
    if (date < input.startDate) {
      skipped.push({ key, title, reason: "Före bokföringsstarten" });
      continue;
    }
    // Redan beslutade poster behöver ingen kontering, men räknas som önskade.
    if (decided.has(key) && decided.get(key)!.decision === "booked") {
      desired.set(key, Math.abs(amount));
      continue;
    }

    const bank = bankLedger(tx.bank_account_id);
    const incoming = amount > 0;
    const full = [name, text, tx.reference].filter(Boolean).join(" ");
    const warnings: string[] = [];
    if (tx.currency && tx.currency !== "SEK") warnings.push(`Transaktionen är i ${tx.currency}: kontrollera kursen.`);
    const common = {
      key,
      group: (incoming ? "in" : "out") as ProposalGroup,
      title,
      amount,
      gross: Math.abs(amount),
      transactionId: tx.id,
      receiptPath: tx.receipt_path ?? null,
      needsReceipt: !incoming && !tx.receipt_path,
      warnings,
      href: "/admin/finance",
    };
    const describe = (prefix: string, extra?: string | null) =>
      `${prefix} ${title}${extra && extra !== title ? ` ${extra}` : ""}`.trim();

    if (incoming) {
      const info = matchInfo[tx.id];
      // 1. Kopplad till en faktura under Banktransaktioner.
      if (info?.applied) {
        add(date, {
          ...common,
          description: `Inbetalning faktura ${info.applied.number}${info.applied.customer ? ` ${info.applied.customer}` : ""}`,
          lines: transferLines(bank, ACC.RECEIVABLES, amount).map(flipPrimary),
          mode: "fixed",
          confidence: "certain",
          reason: `Betalade faktura ${info.applied.number}`,
          link: { type: "invoice", id: info.applied.invoiceId, applyMatch: false },
        });
        continue;
      }
      // 2. Föreslagen eller annan öppen faktura på samma belopp.
      const suggestion = info?.suggestions.find((s) => !usedLinks.has(`invoice:${s.invoiceId}`));
      const option = info?.options.find((o) => !usedLinks.has(`invoice:${o.invoiceId}`));
      const candidate = suggestion ?? option;
      if (candidate) {
        takeLink(`invoice:${candidate.invoiceId}`);
        add(date, {
          ...common,
          description: `Inbetalning faktura ${candidate.number}${candidate.customer ? ` ${candidate.customer}` : ""}`,
          lines: transferLines(bank, ACC.RECEIVABLES, amount).map(flipPrimary),
          mode: "fixed",
          confidence: suggestion?.strength === "strong" ? "certain" : "guess",
          reason: suggestion
            ? `Faktura ${candidate.number}: ${suggestion.reason}`
            : `Faktura ${candidate.number} har samma belopp`,
          link: { type: "invoice", id: candidate.invoiceId, applyMatch: true },
        });
        continue;
      }
      // 3. Faktura markerad som betald för hand, utan koppling till banken.
      const paidInvoice = input.invoices.find((inv) => {
        const paidAt = isoDay(inv.paid_at);
        return (
          inv.status === "paid" &&
          !appliedByInvoice.has(inv.id) &&
          !usedLinks.has(`invoice:${inv.id}`) &&
          round2(Number(inv.amount_sek) || 0) === amount &&
          paidAt != null &&
          daysBetween(paidAt, date) <= LINK_WINDOW_DAYS
        );
      });
      if (paidInvoice) {
        takeLink(`invoice:${paidInvoice.id}`);
        add(date, {
          ...common,
          description: `Inbetalning faktura ${paidInvoice.number}${paidInvoice.customer_name ? ` ${paidInvoice.customer_name}` : ""}`,
          lines: transferLines(bank, ACC.RECEIVABLES, amount).map(flipPrimary),
          mode: "fixed",
          confidence: "rule",
          reason: `Faktura ${paidInvoice.number} är markerad som betald med samma belopp`,
          link: { type: "invoice", id: paidInvoice.id, applyMatch: false },
        });
        continue;
      }
      // 4. Väntande intäkt på samma belopp.
      const income = input.income.find(
        (i) =>
          !i.invoice_id &&
          !usedLinks.has(`income:${i.id}`) &&
          round2(Number(i.amount_sek) || 0) === amount &&
          i.date != null &&
          daysBetween(i.date, date) <= LINK_WINDOW_DAYS,
      );
      if (income) {
        takeLink(`income:${income.id}`);
        add(date, {
          ...common,
          description: `Inbetalning ${income.description}`,
          lines: saleFromGross({ gross: amount, vat: "se25", account: ACC.SALES_25, contra: bank }),
          mode: "sale",
          vat: "se25",
          confidence: "rule",
          reason: `Samma belopp som intäkten ${income.description}`,
          link: { type: "income", id: income.id },
        });
        continue;
      }
    } else {
      // 1. Betalning av en leverantörsfaktura.
      const payment = input.payments
        .filter(
          (p) =>
            !usedLinks.has(`payment:${p.id}`) &&
            round2(Number(p.amount_sek) || 0) === -amount &&
            daysBetween(isoDay(p.paid_at) ?? isoDay(p.due_date) ?? isoDay(p.created_at)!, date) <= LINK_WINDOW_DAYS,
        )
        .sort(
          (a, b) =>
            daysBetween(isoDay(a.paid_at) ?? isoDay(a.due_date) ?? isoDay(a.created_at)!, date) -
            daysBetween(isoDay(b.paid_at) ?? isoDay(b.due_date) ?? isoDay(b.created_at)!, date),
        )[0];
      if (payment) {
        takeLink(`payment:${payment.id}`);
        add(date, {
          ...common,
          description: `Betalning ${payment.description}`,
          lines: transferLines(ACC.PAYABLES, bank, amount),
          mode: "fixed",
          confidence: "rule",
          reason: `Samma belopp som leverantörsfakturan ${payment.description}`,
          link: { type: "payment", id: payment.id },
        });
        continue;
      }
      // 2. Återbetalning av ett utlägg.
      const expense = input.expenses.find(
        (e) =>
          !paidByCompany(e.paid_by) &&
          !usedLinks.has(`expense:${e.id}`) &&
          round2(Number(e.amount_sek) || 0) === -amount &&
          e.date != null &&
          daysBetween(e.date, date) <= LINK_WINDOW_DAYS * 3,
      );
      if (expense) {
        takeLink(`expense:${expense.id}`);
        add(date, {
          ...common,
          description: `Återbetalt utlägg ${expense.description}${expense.paid_by ? ` till ${expense.paid_by}` : ""}`,
          lines: transferLines(ACC.OWNER_DEBT, bank, amount),
          mode: "fixed",
          confidence: "rule",
          reason: `Samma belopp som utlägget ${expense.description}`,
          link: { type: "expense", id: expense.id },
        });
        continue;
      }
      // 3. Till någon som har utlägg, t.ex. en samlad återbetalning.
      const normalized = ` ${normalizeText(full)} `;
      const owner = [...ownerNames].find((n) => normalized.includes(` ${n} `));
      if (owner) {
        add(date, {
          ...common,
          description: describe("Återbetalning till", null),
          lines: transferLines(ACC.OWNER_DEBT, bank, amount),
          mode: "fixed",
          confidence: "rule",
          reason: "Mottagaren har utlägg: bokförs mot skulden till ägaren",
        });
        continue;
      }
    }

    // Regler för motparten, annars OBS-kontot.
    const pattern = learnPattern(name, text);
    const learn = pattern ? { pattern, direction: (incoming ? "in" : "out") as "in" | "out" } : null;
    const hit = textRule(full, incoming ? "in" : "out");
    if (hit) {
      const { rule, refund } = hit;
      if (incoming && !refund) {
        add(date, {
          ...common,
          description: describe("Inbetalning"),
          lines: saleFromGross({ gross: amount, vat: rule.vat_code, account: rule.account, contra: bank }),
          mode: "sale",
          vat: rule.vat_code,
          confidence: rule.origin === "learned" ? "learned" : "rule",
          reason: `Regel: ${rule.pattern}`,
          learn,
        });
      } else {
        // Köp, eller en återbetalning från en leverantör (negativt köp).
        const gross = -amount;
        add(date, {
          ...common,
          description: describe(refund ? "Återbetalning från" : "Utbetalning", text),
          lines: purchaseLines({ gross, account: rule.account, vat: rule.vat_code, contra: bank }),
          mode: "purchase",
          vat: rule.vat_code,
          confidence: refund ? "guess" : rule.origin === "learned" ? "learned" : "rule",
          reason: refund ? `Regel: ${rule.pattern}. Inbetalning från leverantör, antagen återbetalning` : `Regel: ${rule.pattern}`,
          learn,
        });
      }
      continue;
    }

    add(date, {
      ...common,
      description: describe(incoming ? "Inbetalning" : "Utbetalning", text),
      lines: incoming
        ? saleFromGross({ gross: amount, vat: "none", account: ACC.SUSPENSE, contra: bank })
        : purchaseLines({ gross: -amount, account: ACC.SUSPENSE, vat: "none", contra: bank }),
      mode: incoming ? "sale" : "purchase",
      vat: "none",
      confidence: "guess",
      reason: "Okänd motpart: välj konto. OBS-kontot används tills vidare",
      learn,
    });
  }

  // ---- Moms till skattekontot ----------------------------------------------
  for (const c of input.vatClosings) {
    if (c.payable === 0 || !c.due) continue;
    add(c.due, {
      key: `vat-settle:${c.periodId}`,
      group: "vat",
      title: `Moms ${c.label} till skattekontot`,
      description: `Moms ${c.label} på skattekontot`,
      amount: -c.payable,
      gross: Math.abs(c.payable),
      lines:
        c.payable > 0
          ? transferLines(ACC.VAT_SETTLEMENT, ACC.TAX_ACCOUNT, c.payable)
          : transferLines(ACC.TAX_ACCOUNT, ACC.VAT_SETTLEMENT, c.payable),
      mode: "fixed",
      confidence: "certain",
      reason: "Från momsavslutet",
      href: "/admin/bookkeeping/moms",
    });
  }

  // Äldst först, så att verifikationsnumren följer datumen vid "Godkänn alla".
  const byDate = (a: Proposal, b: Proposal) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key);
  const open = proposals.filter((p) => !decided.has(p.key)).sort(byDate);
  const ignored = proposals.filter((p) => decided.get(p.key)?.decision === "ignored").sort(byDate);
  return { proposals: open, ignored, skipped, desired };
}

/** Vid inbetalning är kontovalet kreditraden, inte banken. */
function flipPrimary(line: EntryLine): EntryLine {
  if (line.role === "primary") return { ...line, role: "contra" };
  if (line.role === "contra") return { ...line, role: "primary" };
  return line;
}
