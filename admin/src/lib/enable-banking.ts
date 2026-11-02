// Server-only klient för Enable Banking (open banking / PSD2-kontoinformation).
//
// Auth: varje anrop signeras med en JWT (RS256) med applikationens privata
// nyckel. Env:
//   ENABLE_BANKING_APP_ID       — applikationens id (står som "kid" i JWT:n)
//   ENABLE_BANKING_PRIVATE_KEY  — PEM-nyckeln som laddades ned när appen
//                                 registrerades. Radbrytningar får skrivas som \n.
//   ENABLE_BANKING_API_URL      — valfri, standard https://api.enablebanking.com
//
// Importera ALDRIG denna modul från klientkod.

import { createSign } from "node:crypto";

const DEFAULT_API = "https://api.enablebanking.com";

export function enableBankingConfigured(): boolean {
  return Boolean(process.env.ENABLE_BANKING_APP_ID && process.env.ENABLE_BANKING_PRIVATE_KEY);
}

export class EnableBankingError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
  }

  /** Sessionen går inte längre att använda — användaren måste koppla om. */
  get sessionGone(): boolean {
    return (
      this.code === "EXPIRED_SESSION" ||
      this.code === "CLOSED_SESSION" ||
      this.code === "REVOKED_SESSION" ||
      this.code === "SESSION_DOES_NOT_EXIST"
    );
  }
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

function privateKey(): string {
  return (process.env.ENABLE_BANKING_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").trim();
}

export function signJwt(now = Math.floor(Date.now() / 1000)): string {
  const appId = process.env.ENABLE_BANKING_APP_ID;
  if (!appId || !privateKey()) {
    throw new EnableBankingError("Enable Banking är inte konfigurerat", 500, null);
  }
  const header = b64url(JSON.stringify({ typ: "JWT", alg: "RS256", kid: appId }));
  const body = b64url(
    JSON.stringify({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + 3600 }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${body}`);
  return `${header}.${body}.${signer.sign(privateKey()).toString("base64url")}`;
}

/** Headers som visar att användaren sitter vid datorn. Utan dem begränsar
 *  bankerna bakgrundshämtning till ett fåtal gånger per dygn. */
export type PsuHeaders = { ip?: string | null; userAgent?: string | null };

async function call<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  opts: { body?: unknown; query?: Record<string, string | undefined>; psu?: PsuHeaders } = {},
): Promise<T> {
  const base = (process.env.ENABLE_BANKING_API_URL || DEFAULT_API).replace(/\/+$/, "");
  const url = new URL(base + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v) url.searchParams.set(k, v);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${signJwt()}`,
    Accept: "application/json",
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.psu?.ip) headers["Psu-Ip-Address"] = opts.psu.ip;
  if (opts.psu?.userAgent) headers["Psu-User-Agent"] = opts.psu.userAgent;

  const res = await fetch(url, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: "no-store",
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const detail = typeof data?.detail === "string" ? ` (${data.detail})` : "";
    throw new EnableBankingError(
      `${data?.message ?? `Enable Banking svarade ${res.status}`}${detail}`,
      res.status,
      data?.error ?? null,
    );
  }
  return data as T;
}

// --- Typer (bara fälten vi använder) -------------------------------------

export type Amount = { currency: string; amount: string };

export type Aspsp = {
  name: string;
  country: string;
  maximum_consent_validity?: number;
  psu_types?: ("business" | "personal")[];
};

export type SessionAccount = {
  uid: string;
  identification_hash?: string | null;
  account_id?: { iban?: string; other?: { identification?: string } } | null;
  all_account_ids?: { identification: string; scheme_name: string }[];
  name?: string | null;
  details?: string | null;
  product?: string | null;
  currency?: string | null;
};

export type Balance = {
  name?: string;
  balance_amount: Amount;
  balance_type: string;
  reference_date?: string | null;
};

export type Transaction = {
  transaction_id?: string | null;
  entry_reference?: string | null;
  transaction_amount: Amount;
  credit_debit_indicator: "CRDT" | "DBIT";
  status: string;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  creditor?: { name?: string | null } | null;
  debtor?: { name?: string | null } | null;
  remittance_information?: string[] | null;
  reference_number?: string | null;
  note?: string | null;
};

// --- Anrop ------------------------------------------------------------------

export async function listAspsps(country: string): Promise<Aspsp[]> {
  const data = await call<{ aspsps: Aspsp[] }>("GET", "/aspsps", {
    query: { country, service: "AIS" },
  });
  return data.aspsps ?? [];
}

export function startAuthorization(input: {
  aspsp: { name: string; country: string };
  psuType: "business" | "personal";
  state: string;
  redirectUrl: string;
  validUntil: Date;
  psu?: PsuHeaders;
}) {
  return call<{ url: string; authorization_id: string }>("POST", "/auth", {
    body: {
      access: { valid_until: input.validUntil.toISOString(), balances: true, transactions: true },
      aspsp: input.aspsp,
      state: input.state,
      redirect_url: input.redirectUrl,
      psu_type: input.psuType,
      language: "sv",
    },
    psu: input.psu,
  });
}

export function authorizeSession(code: string, psu?: PsuHeaders) {
  return call<{
    session_id: string;
    accounts: SessionAccount[];
    access?: { valid_until?: string };
  }>("POST", "/sessions", { body: { code }, psu });
}

export function deleteSession(sessionId: string) {
  return call<{ message: string }>("DELETE", `/sessions/${encodeURIComponent(sessionId)}`);
}

export function getBalances(accountUid: string, psu?: PsuHeaders) {
  return call<{ balances: Balance[] }>(
    "GET",
    `/accounts/${encodeURIComponent(accountUid)}/balances`,
    { psu },
  );
}

export function getTransactions(
  accountUid: string,
  opts: { dateFrom?: string; continuationKey?: string; strategy?: "default" | "longest"; psu?: PsuHeaders },
) {
  return call<{ transactions: Transaction[]; continuation_key?: string | null }>(
    "GET",
    `/accounts/${encodeURIComponent(accountUid)}/transactions`,
    {
      query: {
        date_from: opts.dateFrom,
        continuation_key: opts.continuationKey,
        strategy: opts.strategy,
      },
      psu: opts.psu,
    },
  );
}
