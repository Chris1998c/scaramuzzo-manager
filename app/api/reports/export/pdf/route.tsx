// app/api/report/export/pdf/route.ts
import React from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

import { renderPdfToBuffer } from "@/lib/pdf/renderPdf";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

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
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    }
  );
}

function safeStr(v: any) {
  const s = String(v ?? "");
  return s.length > 180 ? s.slice(0, 177) + "..." : s;
}

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 10 },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 6 },
  meta: { marginBottom: 10, color: "#555" },
  sectionTitle: { marginTop: 10, marginBottom: 6, fontSize: 12, fontWeight: 700 },
  box: { border: "1px solid #ddd", borderRadius: 6, padding: 8, marginBottom: 8 },
  row: { flexDirection: "row", borderBottom: "1px solid #eee", paddingVertical: 4 },
  cellK: { width: "40%", paddingRight: 6 },
  cellV: { width: "60%" },
  tableHead: { flexDirection: "row", borderBottom: "1px solid #ddd", paddingVertical: 6, fontWeight: 700 },
  tableRow: { flexDirection: "row", borderBottom: "1px solid #eee", paddingVertical: 5 },
  col1: { width: "18%", paddingRight: 6 },
  col2: { width: "52%", paddingRight: 6 },
  col3: { width: "30%", textAlign: "right" },
  foot: { marginTop: 14, color: "#777" },
});

function KeyValueBox({ title, data }: { title: string; data: Record<string, any> }) {
  const entries = Object.entries(data ?? {});
  return (
    <View style={styles.box}>
      <Text style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{title}</Text>
      {entries.length === 0 ? (
        <Text>Nessun dato.</Text>
      ) : (
        entries.map(([k, v]) => (
          <View style={styles.row} key={k}>
            <Text style={styles.cellK}>{safeStr(k)}</Text>
            <Text style={styles.cellV}>{safeStr(v)}</Text>
          </View>
        ))
      )}
    </View>
  );
}

function SimpleTable({
  title,
  rows,
  col1,
  col2,
  col3,
}: {
  title: string;
  rows: Array<{ a: any; b: any; c: any }>;
  col1: string;
  col2: string;
  col3: string;
}) {
  return (
    <View style={styles.box}>
      <Text style={styles.sectionTitle}>{title}</Text>

      <View style={styles.tableHead}>
        <Text style={styles.col1}>{col1}</Text>
        <Text style={styles.col2}>{col2}</Text>
        <Text style={styles.col3}>{col3}</Text>
      </View>

      {rows.length === 0 ? (
        <Text style={{ paddingTop: 6 }}>Nessuna riga.</Text>
      ) : (
        rows.map((r, i) => (
          <View style={styles.tableRow} key={i}>
            <Text style={styles.col1}>{safeStr(r.a)}</Text>
            <Text style={styles.col2}>{safeStr(r.b)}</Text>
            <Text style={styles.col3}>{safeStr(r.c)}</Text>
          </View>
        ))
      )}
    </View>
  );
}

function ReportPdfDoc(props: {
  tab: string;
  salonName: string;
  salonId: number;
  dateFrom: string;
  dateTo: string;
  totals: Record<string, any>;
  rowsPreview: Array<{ a: any; b: any; c: any }>;
  rowsTitle: string;
}) {
  const { tab, salonName, salonId, dateFrom, dateTo, totals, rowsPreview, rowsTitle } = props;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Report — {safeStr(tab)}</Text>
        <Text style={styles.meta}>
          Salone: {safeStr(salonName)} (ID {salonId}) — Periodo: {dateFrom} → {dateTo}
        </Text>

        <KeyValueBox title="Totali" data={totals} />

        <SimpleTable
          title={rowsTitle}
          rows={rowsPreview}
          col1="A"
          col2="Descrizione"
          col3="Valore"
        />

        <Text style={styles.foot}>Scaramuzzo Manager — Export PDF</Text>
      </Page>
    </Document>
  );
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

    // Salone name (per titolo)
    const { data: salonRow } = await supabaseAdmin
      .from("salons")
      .select("name")
      .eq("id", salonId)
      .maybeSingle();

    const salonName = salonRow?.name ? String(salonRow.name) : `Salon ${salonId}`;

    // DATA by tab (preview compatta)
    let totals: Record<string, any> = {};
    let rowsPreview: Array<{ a: any; b: any; c: any }> = [];
    let rowsTitle = "Preview";

    if (["turnover", "daily", "top", "staff"].includes(tab)) {
      const sales = await getSalonTurnoverAnalytics({
        salonId,
        dateFrom,
        dateTo,
        staffId,
        paymentMethod,
        itemType,
      });

      totals = sales.totals ?? {};

      if (tab === "turnover") {
        rowsTitle = "Prime righe (vendite)";
        rowsPreview = (sales.rows ?? []).slice(0, 35).map((r: any) => ({
          a: r.sale_day ?? "",
          b: r.product_name ?? r.service_name ?? "Voce",
          c: r.line_total_gross ?? r.line_net ?? "",
        }));
      } else if (tab === "daily") {
        rowsTitle = "Giornaliero";
        rowsPreview = (sales.daily ?? []).slice(0, 35).map((r: any) => ({
          a: r.day ?? r.sale_day ?? "",
          b: "Totale",
          c: r.gross_total ?? r.net_total ?? "",
        }));
      } else if (tab === "top") {
        rowsTitle = "Top Items";
        rowsPreview = (sales.topItems ?? []).slice(0, 35).map((r: any) => ({
          a: r.item_type ?? "",
          b: r.item_name ?? r.service_name ?? r.product_name ?? "Item",
          c: r.gross_total ?? r.gross ?? "",
        }));
      } else if (tab === "staff") {
        rowsTitle = "Performance Staff";
        rowsPreview = (sales.staffPerformance ?? []).slice(0, 35).map((r: any) => ({
          a: r.staff_name ?? r.staff_id ?? "",
          b: `Servizi ${r.services_qty ?? 0} / Prodotti ${r.products_qty ?? 0}`,
          c: r.gross_total ?? "",
        }));
      }
    }

    if (tab === "cassa") {
      const cash = await getCashSessionsReport({ salonId, dateFrom, dateTo });
      totals = cash.totals ?? {};
      rowsTitle = "Cash Sessions";
      rowsPreview = (cash.sessions ?? []).slice(0, 35).map((r: any) => ({
        a: r.session_date ?? r.opened_at ?? "",
        b: `Aperta: ${r.opening_cash ?? ""} — Chiusa: ${r.closing_cash ?? ""}`,
        c: r.gross_total ?? "",
      }));
    }

    if (tab === "agenda") {
      const agenda = await getAgendaReport({ salonId, dateFrom, dateTo });
      totals = agenda.totals ?? {};
      rowsTitle = "No-show / Giornaliero";
      rowsPreview = (agenda.daily ?? []).slice(0, 35).map((r: any) => ({
        a: r.day ?? r.date ?? "",
        b: `Done ${r.done ?? 0} — NoShow ${r.no_show ?? 0} — Canc ${r.cancelled ?? 0}`,
        c: r.appointments ?? "",
      }));
    }

    if (tab === "clienti") {
      const clients = await getClientsReport({ salonId, dateFrom, dateTo });
      totals = clients.totals ?? {};
      rowsTitle = "Top Spenders";
      rowsPreview = (clients.topSpenders ?? []).slice(0, 35).map((r: any) => ({
        a: r.customer_name ?? r.customer_id ?? "",
        b: `Scontrini ${r.receipts_count ?? ""}`,
        c: r.gross_total ?? r.total_spent ?? "",
      }));
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

      totals = (services as any).totals ?? {};
      rowsTitle = "Top Servizi";
      rowsPreview = ((services as any).topServices ?? []).slice(0, 35).map((r: any) => ({
        a: r.service_id ?? "",
        b: r.service_name ?? "Servizio",
        c: r.gross_total ?? r.gross ?? "",
      }));
    }

    if (tab === "prodotti") {
      const products = await getProductsReport({ salonId, dateFrom, dateTo });
      totals = products.totals ?? {};
      rowsTitle = "Top Prodotti / Low stock";
      const top = (products.topProducts ?? []).slice(0, 20).map((r: any) => ({
        a: r.product_id ?? "",
        b: r.product_name ?? "Prodotto",
        c: r.gross_total ?? r.gross ?? "",
      }));
      const low = (products.lowStock ?? []).slice(0, 15).map((r: any) => ({
        a: r.product_id ?? "",
        b: `LOW: ${r.product_name ?? "Prodotto"}`,
        c: `qty ${r.qty_on_hand ?? ""} < min ${r.min_qty ?? ""}`,
      }));
      rowsPreview = [...top, ...low].slice(0, 35);
    }

    const document = React.createElement(ReportPdfDoc, {
      tab,
      salonName,
      salonId,
      dateFrom,
      dateTo,
      totals,
      rowsPreview,
      rowsTitle,
    });

    const buffer = await renderPdfToBuffer(document);

    return new Response(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="report-${tab}-${salonId}-${dateFrom}-${dateTo}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Errore export PDF" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}