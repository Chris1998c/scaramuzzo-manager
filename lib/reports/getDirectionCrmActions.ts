import { createServerSupabase } from "@/lib/supabaseServer";
import {
  SALES_LEDGER_OPERATION_TYPE,
  SALES_LEDGER_STATUS,
} from "@/lib/reports/ledgerSalesFilter";

const MS_DAY = 86_400_000;
const LIST_LIMIT = 8;

import type { ColorAbsentCustomer } from "@/lib/reports/colorAbsentSegment";

export type CrmActionCustomer = {
  customer_id: string;
  customer_name: string;
  detail: string;
  gross_total?: number;
  phone?: string | null;
  whatsapp_ready?: boolean;
};

export type DirectionCrmActions = {
  notReturned60: CrmActionCustomer[];
  notReturned90: CrmActionCustomer[];
  topSpenders: CrmActionCustomer[];
  noShowCustomers: CrmActionCustomer[];
  noRetailBuyers: CrmActionCustomer[];
  colorAbsent: ColorAbsentCustomer[];
};

function displayName(
  c: {
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    email?: string | null;
  } | undefined,
  customerId: string,
): string {
  const fn = String(c?.first_name ?? "").trim();
  const ln = String(c?.last_name ?? "").trim();
  const full = `${fn} ${ln}`.trim();
  if (full) return full;
  const phone = String(c?.phone ?? "").trim();
  if (phone) return phone;
  const email = String(c?.email ?? "").trim();
  if (email) return email;
  return `Cliente #${customerId}`;
}

function isoStart(d: string) {
  return `${d}T00:00:00`;
}

function isoEnd(d: string) {
  return `${d}T23:59:59.999`;
}

export async function getDirectionCrmActions(
  salonId: number,
): Promise<DirectionCrmActions> {
  const supabase = await createServerSupabase();
  const now = Date.now();
  const cutoff60 = now - 60 * MS_DAY;
  const cutoff90 = now - 90 * MS_DAY;
  const lookbackDays = 365;
  const lookbackFrom = new Date(now - lookbackDays * MS_DAY)
    .toISOString()
    .slice(0, 10);

  const { data: appts, error: apptErr } = await supabase
    .from("appointments")
    .select("customer_id, start_time, status")
    .eq("salon_id", salonId)
    .gte("start_time", isoStart(lookbackFrom));

  if (apptErr) throw new Error(apptErr.message);

  const lastVisitMs = new Map<string, number>();
  const noShowIds = new Set<string>();
  const apptCustomerIds = new Set<string>();

  for (const a of appts ?? []) {
    const cid = (a as { customer_id?: string }).customer_id;
    if (!cid) continue;
    apptCustomerIds.add(cid);

    const status = String((a as { status?: string }).status ?? "").toLowerCase();
    if (status === "no_show" || status === "noshow") {
      noShowIds.add(cid);
    }

    const st = (a as { start_time?: string }).start_time;
    if (!st) continue;
    const ms = new Date(st).getTime();
    if (!Number.isFinite(ms)) continue;
    const prev = lastVisitMs.get(cid);
    if (prev == null || ms > prev) lastVisitMs.set(cid, ms);
  }

  const { data: sales, error: salesErr } = await supabase
    .from("sales")
    .select("id, customer_id, total_amount, date")
    .eq("salon_id", salonId)
    .eq("status", SALES_LEDGER_STATUS)
    .eq("operation_type", SALES_LEDGER_OPERATION_TYPE)
    .gte("date", isoStart(lookbackFrom));

  if (salesErr) throw new Error(salesErr.message);

  const spendMap = new Map<string, number>();
  const saleIds: number[] = [];
  const saleCustomer = new Map<number, string>();

  for (const s of sales ?? []) {
    const sid = Number((s as { id?: unknown }).id);
    const cid = (s as { customer_id?: string }).customer_id;
    if (cid) {
      const amt = Number((s as { total_amount?: unknown }).total_amount ?? 0);
      spendMap.set(cid, (spendMap.get(cid) ?? 0) + (Number.isFinite(amt) ? amt : 0));
    }
    if (Number.isFinite(sid) && sid > 0) {
      saleIds.push(sid);
      if (cid) saleCustomer.set(sid, cid);
    }
  }

  const productBuyers = new Set<string>();
  if (saleIds.length) {
    const chunkSize = 200;
    for (let i = 0; i < saleIds.length; i += chunkSize) {
      const chunk = saleIds.slice(i, i + chunkSize);
      const { data: items, error: itemsErr } = await supabase
        .from("sale_items")
        .select("sale_id, product_id")
        .in("sale_id", chunk)
        .not("product_id", "is", null);

      if (itemsErr) throw new Error(itemsErr.message);

      for (const it of items ?? []) {
        const saleId = Number((it as { sale_id?: unknown }).sale_id);
        const cid = saleCustomer.get(saleId);
        if (cid) productBuyers.add(cid);
      }
    }
  }

  const allCustomerIds = new Set<string>([
    ...apptCustomerIds,
    ...spendMap.keys(),
  ]);

  const customerIds = [...allCustomerIds];
  const customersMap = new Map<
    string,
    {
      first_name?: string | null;
      last_name?: string | null;
      phone?: string | null;
      email?: string | null;
      marketing_whatsapp_opt_in?: boolean | null;
    }
  >();

  if (customerIds.length) {
    const chunkSize = 200;
    for (let i = 0; i < customerIds.length; i += chunkSize) {
      const chunk = customerIds.slice(i, i + chunkSize);
      const { data: customers, error: custErr } = await supabase
        .from("customers")
        .select("id, first_name, last_name, phone, email, marketing_whatsapp_opt_in")
        .in("id", chunk);

      if (custErr) throw new Error(custErr.message);
      for (const c of customers ?? []) {
        const id = String((c as { id?: unknown }).id);
        customersMap.set(id, c as {
          first_name?: string | null;
          last_name?: string | null;
          phone?: string | null;
          email?: string | null;
          marketing_whatsapp_opt_in?: boolean | null;
        });
      }
    }
  }

  function enrichCustomer(cid: string, base: Omit<CrmActionCustomer, "phone" | "whatsapp_ready">): CrmActionCustomer {
    const row = customersMap.get(cid);
    const phone = row?.phone ? String(row.phone).trim() : null;
    const optIn = Boolean(row?.marketing_whatsapp_opt_in);
    return {
      ...base,
      phone: phone || null,
      whatsapp_ready: Boolean(phone && optIn),
    };
  }

  const notReturned60: CrmActionCustomer[] = [];
  const notReturned90: CrmActionCustomer[] = [];

  for (const cid of allCustomerIds) {
    const last = lastVisitMs.get(cid) ?? null;
    const label = displayName(customersMap.get(cid), cid);
    if (last == null || last < cutoff60) {
      notReturned60.push(
        enrichCustomer(cid, {
          customer_id: cid,
          customer_name: label,
          detail:
            last == null
              ? "Nessuna visita registrata"
              : `Ultima visita ${new Date(last).toLocaleDateString("it-IT")}`,
          gross_total: spendMap.get(cid),
        }),
      );
    }
    if (last == null || last < cutoff90) {
      notReturned90.push(
        enrichCustomer(cid, {
          customer_id: cid,
          customer_name: label,
          detail:
            last == null
              ? "Nessuna visita registrata"
              : `Ultima visita ${new Date(last).toLocaleDateString("it-IT")}`,
          gross_total: spendMap.get(cid),
        }),
      );
    }
  }

  notReturned60.sort((a, b) => (b.gross_total ?? 0) - (a.gross_total ?? 0));
  notReturned90.sort((a, b) => (b.gross_total ?? 0) - (a.gross_total ?? 0));

  const topSpenders: CrmActionCustomer[] = [...spendMap.entries()]
    .map(([cid, gross]) =>
      enrichCustomer(cid, {
        customer_id: cid,
        customer_name: displayName(customersMap.get(cid), cid),
        detail: "Spesa storica salone",
        gross_total: gross,
      }),
    )
    .sort((a, b) => (b.gross_total ?? 0) - (a.gross_total ?? 0))
    .slice(0, LIST_LIMIT);

  const noShowCustomers: CrmActionCustomer[] = [...noShowIds]
    .map((cid) =>
      enrichCustomer(cid, {
        customer_id: cid,
        customer_name: displayName(customersMap.get(cid), cid),
        detail: "Ha fatto almeno un no-show (storico)",
      }),
    )
    .slice(0, LIST_LIMIT);

  const noRetailBuyers: CrmActionCustomer[] = [];
  for (const cid of apptCustomerIds) {
    if (productBuyers.has(cid)) continue;
    noRetailBuyers.push(
      enrichCustomer(cid, {
        customer_id: cid,
        customer_name: displayName(customersMap.get(cid), cid),
        detail: "Visite in salone ma nessun acquisto prodotto",
        gross_total: spendMap.get(cid),
      }),
    );
  }
  noRetailBuyers.sort((a, b) => (b.gross_total ?? 0) - (a.gross_total ?? 0));

  return {
    notReturned60: notReturned60.slice(0, LIST_LIMIT),
    notReturned90: notReturned90.slice(0, LIST_LIMIT),
    topSpenders,
    noShowCustomers,
    noRetailBuyers: noRetailBuyers.slice(0, LIST_LIMIT),
    colorAbsent: [],
  };
}
