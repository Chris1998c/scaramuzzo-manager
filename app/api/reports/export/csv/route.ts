// app/api/report/export/csv/route.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

import { getSalonTurnoverAnalytics } from "@/lib/reports/getSalonTurnoverAnalytics";
import { getCashSessionsReport } from "@/lib/reports/getCashSessionsReport";
import { getAgendaReport } from "@/lib/reports/getAgendaReport";
import { getClientsReport } from "@/lib/reports/getClientsReport";
import { getServicesReport } from "@/lib/reports/getServicesReport";
import { getProductsReport } from "@/lib/reports/getProductsReport";

export const runtime = "nodejs";

type TabKey =
  | "turnover"
  | "daily"
  | "top"
  | "staff"
  | "cassa"
  | "agenda"
  | "clienti"
  | "servizi"
  | "prodotti";

function escCsv(v: any) {
  const s = String(v ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}
function toCsv(rows: Record<string, any>[]) {
  if (rows.length === 0) return "sep=;\n";
  const headers = Object.keys(rows[0]);
  const lines = [
    "sep=;",
    headers.map(escCsv).join(";"),
    ...rows.map((r) => headers.map((h) => escCsv(r[h])).join(";")),
  ];
  return lines.join("\n") + "\n";
}

function toInt(x: string | null) {
  const n = x ? Number(x) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

function roleFromMetadata(user: any): string {
  return String(user?.user_metadata?.role ?? user?.app_metadata?.role ?? "").trim();
}

async function getRoleFromDb(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("roles:roles(name)")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  const roleName = (data as any)?.roles?.[0]?.name;
  return roleName ? String(roleName).trim() : null;
}

function normalizePaymentMethod(v: string | null) {
  if (!v) return null;
  const s = v.trim();
  return s === "cash" || s === "card" ? s : null;
}
function normalizeItemType(v: string | null) {
  if (!v) return null;
  const s = v.trim();
  return s === "service" || s === "product" ? s : null;
}
function normalizeTab(v: string | null): TabKey {
  const s = (v ?? "").trim();
  const allowed: TabKey[] = [
    "turnover",
    "daily",
    "top",
    "staff",
    "cassa",
    "agenda",
    "clienti",
    "servizi",
    "prodotti",
  ];
  return allowed.includes(s as any) ? (s as TabKey) : "turnover";
}

async function createRouteSupabase() {
  const cookieStore = await cookies(); // ✅ FIX

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        for (const { name, value, options } of toSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}

export async function GET(req: Request) {
  try {
    // AUTH (cookie-based)
 const supabase = await createRouteSupabase();
    const { data: authData, error: authErr } = await supabase.auth.getUser();

    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: "Non autenticato" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const user = authData.user;
    const dbRole = await getRoleFromDb(user.id);
    const role = (dbRole || roleFromMetadata(user)).trim().toLowerCase();
    if (role !== "coordinator") {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // PARAMS
    const url = new URL(req.url);
    const tab = normalizeTab(url.searchParams.get("tab"));
    const salonId = toInt(url.searchParams.get("salon_id"));
    const dateFrom = url.searchParams.get("date_from");
    const dateTo = url.searchParams.get("date_to");

    const staffIdRaw = url.searchParams.get("staff_id");
    const staffId = staffIdRaw && staffIdRaw.trim().length > 0 ? toInt(staffIdRaw) : null;

    const paymentMethod = normalizePaymentMethod(url.searchParams.get("payment_method"));
    const itemType = normalizeItemType(url.searchParams.get("item_type"));

    if (!Number.isFinite(salonId) || salonId <= 0 || !dateFrom || !dateTo) {
      return new Response(JSON.stringify({ error: "Missing/invalid params" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const out: Record<string, any>[] = [];

    out.push({
      TYPE: "META",
      tab,
      salon_id: salonId,
      date_from: dateFrom,
      date_to: dateTo,
      staff_id: staffId ?? "",
      payment_method: paymentMethod ?? "",
      item_type: itemType ?? "",
    });

    if (["turnover", "daily", "top", "staff"].includes(tab)) {
      const sales = await getSalonTurnoverAnalytics({
        salonId,
        dateFrom,
        dateTo,
        staffId,
        paymentMethod,
        itemType,
      });

      out.push({ TYPE: "TOTALS", ...sales.totals });
      out.push({ TYPE: "PREVIOUS_TOTALS", ...sales.previousTotals });

      if (tab === "turnover") for (const r of sales.rows ?? []) out.push({ TYPE: "ROW", ...r });
      if (tab === "daily") for (const r of sales.daily ?? []) out.push({ TYPE: "DAY", ...r });
      if (tab === "top") for (const r of sales.topItems ?? []) out.push({ TYPE: "ITEM", ...r });
      if (tab === "staff") for (const r of sales.staffPerformance ?? []) out.push({ TYPE: "STAFF_ROW", ...r });
    }

    if (tab === "cassa") {
      const cash = await getCashSessionsReport({ salonId, dateFrom, dateTo });
      out.push({ TYPE: "TOTALS", ...cash.totals });
      for (const r of cash.sessions ?? []) out.push({ TYPE: "SESSION", ...r });
    }

    if (tab === "agenda") {
      const agenda = await getAgendaReport({ salonId, dateFrom, dateTo });
      out.push({ TYPE: "TOTALS", ...agenda.totals });
      for (const r of agenda.daily ?? []) out.push({ TYPE: "DAY", ...r });
      for (const r of agenda.staffUtilization ?? []) out.push({ TYPE: "STAFF_ROW", ...r });
    }

    if (tab === "clienti") {
      const clients = await getClientsReport({ salonId, dateFrom, dateTo });
      out.push({ TYPE: "TOTALS", ...clients.totals });
      for (const r of clients.newCustomers ?? []) out.push({ TYPE: "NEW_CUSTOMER", ...r });
      for (const r of clients.topSpenders ?? []) out.push({ TYPE: "TOP_SPENDER", ...r });
    }

    if (tab === "servizi") {
      const services = await getServicesReport({
        salonId,
        dateFrom,
        dateTo,
        staffId,
        paymentMethod,
        itemType,
      } as any);
      out.push({ TYPE: "TOTALS", ...services.totals });
      for (const r of services.topServices ?? []) out.push({ TYPE: "SERVICE", ...r });
    }

    if (tab === "prodotti") {
      const products = await getProductsReport({ salonId, dateFrom, dateTo });
      out.push({ TYPE: "TOTALS", ...products.totals });
      for (const r of products.topProducts ?? []) out.push({ TYPE: "PRODUCT", ...r });
      for (const r of products.lowStock ?? []) out.push({ TYPE: "LOW_STOCK", ...r });
    }

    const csv = toCsv(out);

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="report-${tab}-${salonId}-${dateFrom}-${dateTo}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Errore export CSV" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}