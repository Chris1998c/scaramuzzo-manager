// app/api/reports/salon-turnover/csv/route.ts
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function escCsv(v: any) {
  const s = String(v ?? "");
  // separatore ; (Italia) + escape doppi apici
  const safe = s.replace(/"/g, '""');
  // quota sempre per sicurezza
  return `"${safe}"`;
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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const salonIdRaw = url.searchParams.get("salon_id");
    const dateFrom = url.searchParams.get("date_from"); // YYYY-MM-DD
    const dateTo = url.searchParams.get("date_to"); // YYYY-MM-DD

    // filtri opzionali
    const staffIdRaw = url.searchParams.get("staff_id"); // int
    const paymentMethod = url.searchParams.get("payment_method"); // cash|card
    const itemType = url.searchParams.get("item_type"); // service|product

    const salonId = salonIdRaw ? Number(salonIdRaw) : NaN;
    const staffId =
      staffIdRaw && staffIdRaw.trim().length > 0 ? Number(staffIdRaw) : null;

    if (!Number.isFinite(salonId) || salonId <= 0 || !dateFrom || !dateTo) {
      return new Response(JSON.stringify({ error: "Missing/invalid params" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (staffId !== null && !Number.isFinite(staffId)) {
      return new Response(JSON.stringify({ error: "Invalid staff_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Nome salone per filename
    const { data: salonRow } = await supabaseAdmin
      .from("salons")
      .select("name")
      .eq("id", salonId)
      .maybeSingle();

    const salonName = salonRow?.name ? String(salonRow.name) : `salon-${salonId}`;
    const safeName = salonName
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-]/g, "");

    // 1) Totali
    const { data: totalsRows, error: totalsErr } = await supabaseAdmin.rpc(
      "report_turnover",
      {
        p_salon_id: salonId,
        p_from: dateFrom,
        p_to: dateTo,
        p_staff_id: staffId,
        p_payment_method: paymentMethod,
        p_item_type: itemType,
      }
    );

    if (totalsErr) {
      return new Response(JSON.stringify({ error: totalsErr.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const t0 = Array.isArray(totalsRows) && totalsRows.length > 0 ? totalsRows[0] : null;

    // 2) Righe
    const { data: rowsData, error: rowsErr } = await supabaseAdmin.rpc(
      "report_rows",
      {
        p_salon_id: salonId,
        p_from: dateFrom,
        p_to: dateTo,
        p_staff_id: staffId,
        p_payment_method: paymentMethod,
        p_item_type: itemType,
      }
    );

    if (rowsErr) {
      return new Response(JSON.stringify({ error: rowsErr.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // CSV “Boss-style”: prima riga TOT, poi righe dettaglio
    const out: Record<string, any>[] = [];

    out.push({
      TYPE: "TOTALS",
      salon_id: salonId,
      salon_name: salonName,
      date_from: dateFrom,
      date_to: dateTo,
      receipts_count: t0?.receipts_count ?? 0,
      gross_total: t0?.gross_total ?? 0,
      net_total: t0?.net_total ?? 0,
      vat_total: t0?.vat_total ?? 0,
      discount_total: t0?.discount_total ?? 0,
      gross_cash: t0?.gross_cash ?? 0,
      gross_card: t0?.gross_card ?? 0,
      gross_services: t0?.gross_services ?? 0,
      gross_products: t0?.gross_products ?? 0,
      staff_id: staffId ?? "",
      payment_method: paymentMethod ?? "",
      item_type: itemType ?? "",
    });

    // Riga vuota separatore
    out.push({ TYPE: "ROWS" });

    for (const r of rowsData ?? []) {
      out.push({
        TYPE: "ROW",
        sale_day: r.sale_day,
        sale_id: r.sale_id,
        payment_method: r.payment_method,
        item_type: r.item_type,
        service_id: r.service_id ?? "",
        service_name: r.service_name ?? "",
        product_id: r.product_id ?? "",
        product_name: r.product_name ?? "",
        staff_id: r.staff_id ?? "",
        staff_name: r.staff_name ?? "",
        quantity: r.quantity ?? 0,
        price: r.price ?? 0,
        item_discount: r.item_discount ?? 0,
        vat_rate: r.vat_rate ?? 0,
        line_total_gross: r.line_total_gross ?? 0,
        line_net: r.line_net ?? 0,
        line_vat: r.line_vat ?? 0,
      });
    }

    const csv = toCsv(out);

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="turnover-${safeName}-${dateFrom}-${dateTo}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Errore CSV" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}