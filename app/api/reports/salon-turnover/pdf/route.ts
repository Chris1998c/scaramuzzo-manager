// app/api/reports/salon-turnover/pdf/route.ts
import React from "react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { renderPdfToBuffer } from "@/lib/pdf/renderPdf";
import SalonTurnoverPdf from "@/lib/pdf/templates/SalonTurnoverPdf";

export const runtime = "nodejs";

type TemplateRow = {
  date: string;
  description: string;
  staff_name?: string;
  net_total: number;
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const salonIdRaw = url.searchParams.get("salon_id");
    const dateFrom = url.searchParams.get("date_from"); // YYYY-MM-DD
    const dateTo = url.searchParams.get("date_to"); // YYYY-MM-DD

    // filtri opzionali (enterprise)
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

    // Nome salone (così nel PDF è bello)
    const { data: salonRow, error: salonErr } = await supabaseAdmin
      .from("salons")
      .select("name")
      .eq("id", salonId)
      .maybeSingle();

    if (salonErr) {
      return new Response(JSON.stringify({ error: salonErr.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const salonName = salonRow?.name ? String(salonRow.name) : `Salon ${salonId}`;

    // 1) Totali via RPC (enterprise)
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

    const totals =
      t0 ??
      ({
        salon_id: salonId,
        date_from: dateFrom,
        date_to: dateTo,
        receipts_count: 0,
        gross_total: 0,
        net_total: 0,
        vat_total: 0,
        discount_total: 0,
        gross_cash: 0,
        gross_card: 0,
        gross_services: 0,
        gross_products: 0,
      } as any);

    // 2) Righe via RPC (così abbiamo già tutto filtrato e ordinato)
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

    const rows: TemplateRow[] = (rowsData ?? []).map((r: any) => {
      const date = String(r.sale_day ?? "");
      const base = r.product_name ?? r.service_name ?? "Voce";
      const staff = r.staff_name ? String(r.staff_name) : undefined;

      return {
        date,
        description: String(base),
        staff_name: staff,
        net_total: Number(r.line_net ?? 0),
      };
    });

    // NOTE: NO JSX in route.ts
    const document = React.createElement(SalonTurnoverPdf, {
      salonName,
      dateFrom,
      dateTo,
      totals,
      rows,
    });

    const buffer = await renderPdfToBuffer(document);

    return new Response(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="salon-turnover-${salonId}-${dateFrom}-${dateTo}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Errore PDF" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}