// app/api/report/export/csv/route.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSalonTurnoverAnalytics } from "@/lib/reports/getSalonTurnoverAnalytics";
import { getCashSessionsReport } from "@/lib/reports/getCashSessionsReport";
import { getAgendaReport } from "@/lib/reports/getAgendaReport";
import { getClientsReport } from "@/lib/reports/getClientsReport";
import { getServicesReport } from "@/lib/reports/getServicesReport";
import { getProductsReport } from "@/lib/reports/getProductsReport";
import { flattenStaffKpiRowItalian } from "@/lib/reports/flattenStaffKpiForExport";
import { reportExportPeriodError, resolveReportDateRange } from "@/lib/reports/reportDateRange";
import { mergeStaffKpiWithSalonStaff } from "@/lib/reports/buildStaffKpiFromRows";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchActiveStaffForSalon } from "@/lib/staffForSalon";
import { parseReportVatMode, reportVatModeLabel } from "@/lib/reports/reportVatMode";
import {
  exportUnauthorizedResponse,
  isExportAuthError,
  requireCoordinatorExportAccess,
} from "@/lib/reports/exportRouteAuth";

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
const SUPPORTED_EXPORT_TABS = new Set<TabKey>([
  "turnover",
  "daily",
  "top",
  "staff",
  "cassa",
  "agenda",
  "clienti",
  "servizi",
  "prodotti",
]);

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
function parseTab(v: string | null): TabKey | null {
  const s = (v ?? "").trim() as TabKey;
  return SUPPORTED_EXPORT_TABS.has(s) ? s : null;
}

function isIsoDate(v: string | null): v is string {
  if (!v) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
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
  let supabase;
  try {
    supabase = await createRouteSupabase();
  } catch {
    return exportUnauthorizedResponse();
  }

  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) {
    return exportUnauthorizedResponse();
  }

  const auth = await requireCoordinatorExportAccess();
  if (!auth.ok) return auth.response;
  const access = auth.access;

  try {
    // PARAMS
    const url = new URL(req.url);
    const tabRaw = url.searchParams.get("tab");
    const tab = parseTab(tabRaw);
    const salonId = toInt(url.searchParams.get("salon_id"));
    const dateFrom = url.searchParams.get("date_from");
    const dateTo = url.searchParams.get("date_to");

    const staffIdRaw = url.searchParams.get("staff_id");
    const hasStaffId = !!staffIdRaw && staffIdRaw.trim().length > 0;
    const staffId = hasStaffId ? toInt(staffIdRaw) : null;

    const paymentMethod = normalizePaymentMethod(url.searchParams.get("payment_method"));
    const itemType = normalizeItemType(url.searchParams.get("item_type"));

    if (!tab) {
      return new Response(
        JSON.stringify({
          error: "Tab export non supportata",
          supported_tabs: [...SUPPORTED_EXPORT_TABS],
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (!Number.isFinite(salonId) || salonId <= 0) {
      return new Response(JSON.stringify({ error: "Missing/invalid params" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!access.allowedSalonIds.includes(salonId)) {
      return new Response(JSON.stringify({ error: "salon_id non consentito per questo utente" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    const dateResolved = resolveReportDateRange({ dateFrom, dateTo });
    if (dateResolved.needsRedirect) {
      return new Response(JSON.stringify({ error: "date_from/date_to non valide" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const reportDateFrom = dateResolved.dateFrom;
    const reportDateTo = dateResolved.dateTo;

    const periodErr = reportExportPeriodError(dateResolved.spanDays);
    if (periodErr) {
      return new Response(JSON.stringify({ error: periodErr }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const vatMode = parseReportVatMode(
      url.searchParams.get("vat_mode") ?? url.searchParams.get("iva"),
    );
    if (hasStaffId && (!Number.isFinite(staffId) || (staffId ?? 0) <= 0)) {
      return new Response(JSON.stringify({ error: "staff_id non valido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const out: Record<string, any>[] = [];

    out.push({
      TYPE: "META",
      tab,
      salon_id: salonId,
      date_from: reportDateFrom,
      date_to: reportDateTo,
      vat_mode: vatMode,
      visualizzazione: reportVatModeLabel(vatMode),
      staff_id: staffId ?? "",
      payment_method: paymentMethod ?? "",
      item_type: itemType ?? "",
    });

    if (["turnover", "daily", "top", "staff"].includes(tab)) {
      const sales = await getSalonTurnoverAnalytics({
        salonId,
        dateFrom: reportDateFrom,
        dateTo: reportDateTo,
        staffId,
        paymentMethod,
        itemType,
      });

      out.push({ TYPE: "TOTALS", ...sales.totals });
      out.push({ TYPE: "PREVIOUS_TOTALS", ...sales.previousTotals });

      if (tab === "turnover") for (const r of sales.rows ?? []) out.push({ TYPE: "ROW", ...r });
      if (tab === "daily") for (const r of sales.daily ?? []) out.push({ TYPE: "DAY", ...r });
      if (tab === "top") for (const r of sales.topItems ?? []) out.push({ TYPE: "ITEM", ...r });
      if (tab === "staff") {
        let staffRows = sales.staffPerformance ?? [];
        if (!staffId) {
          const active = await fetchActiveStaffForSalon(supabaseAdmin, salonId, "id, name");
          const salonStaff = (active ?? [])
            .filter((s: any) => s?.id != null)
            .map((s: any) => ({
              id: Number(s.id),
              name: String(s.name ?? `Staff ${s.id}`),
            }));
          staffRows = mergeStaffKpiWithSalonStaff(staffRows, salonStaff);
        }
        for (const r of staffRows)
          out.push({ TYPE: "STAFF_ROW", ...flattenStaffKpiRowItalian(r, vatMode) });
      }
    }

    if (tab === "cassa") {
      const cash = await getCashSessionsReport({
        salonId,
        dateFrom: reportDateFrom,
        dateTo: reportDateTo,
      });
      out.push({ TYPE: "TOTALS", ...cash.totals });
      for (const r of cash.sessions ?? []) out.push({ TYPE: "SESSION", ...r });
    }

    if (tab === "agenda") {
      const agenda = await getAgendaReport({
        salonId,
        dateFrom: reportDateFrom,
        dateTo: reportDateTo,
      });
      out.push({ TYPE: "TOTALS", ...agenda.totals });
      for (const r of agenda.daily ?? []) out.push({ TYPE: "DAY", ...r });
      for (const r of agenda.staffUtilization ?? []) out.push({ TYPE: "STAFF_ROW", ...r });
    }

    if (tab === "clienti") {
      const clients = await getClientsReport({
        salonId,
        dateFrom: reportDateFrom,
        dateTo: reportDateTo,
        staffId,
        paymentMethod,
      });
      out.push({ TYPE: "TOTALS", ...clients.totals });
      for (const r of clients.newCustomers ?? []) out.push({ TYPE: "NEW_CUSTOMER", ...r });
      for (const r of clients.topSpenders ?? []) out.push({ TYPE: "TOP_SPENDER", ...r });
    }

    if (tab === "servizi") {
      const services = await getServicesReport({
        salonId,
        dateFrom: reportDateFrom,
        dateTo: reportDateTo,
        staffId,
        paymentMethod,
        itemType,
      } as any);
      out.push({ TYPE: "TOTALS", ...services.totals });
      for (const r of services.topServices ?? []) out.push({ TYPE: "SERVICE", ...r });
    }

    if (tab === "prodotti") {
      const products = await getProductsReport({
        salonId,
        dateFrom: reportDateFrom,
        dateTo: reportDateTo,
        staffId,
        paymentMethod,
      });
      out.push({ TYPE: "TOTALS", ...products.totals });
      for (const r of products.topProducts ?? []) out.push({ TYPE: "PRODUCT", ...r });
      for (const r of products.lowStock ?? []) out.push({ TYPE: "LOW_STOCK", ...r });
    }

    const csv = toCsv(out);

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="report-${tab}-${salonId}-${reportDateFrom}-${reportDateTo}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: unknown) {
    if (isExportAuthError(e)) return exportUnauthorizedResponse();
    const msg = e instanceof Error ? e.message : "Errore export CSV";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}