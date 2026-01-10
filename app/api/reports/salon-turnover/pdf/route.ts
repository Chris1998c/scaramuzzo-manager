// app/api/reports/salon-turnover/pdf/route.ts
import React from "react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { renderPdfToBuffer } from "@/lib/pdf/renderPdf";
import SalonTurnoverPdf from "@/lib/pdf/templates/SalonTurnoverPdf";

export const runtime = "nodejs";

type TemplateRow = {
  date: string;
  description: string;
  net_total: number;
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const salonIdRaw = url.searchParams.get("salon_id");
    const dateFrom = url.searchParams.get("date_from");
    const dateTo = url.searchParams.get("date_to");

    const salonId = salonIdRaw ? Number(salonIdRaw) : NaN;

    if (!Number.isFinite(salonId) || salonId <= 0 || !dateFrom || !dateTo) {
      return new Response(JSON.stringify({ error: "Missing/invalid params" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1) Totali (funzione ufficiale)
    const { data: report, error: reportErr } = await supabaseAdmin.rpc(
      "report_salon_turnover",
      {
        p_salon_id: salonId,
        p_date_from: dateFrom,
        p_date_to: dateTo,
      }
    );

    if (reportErr) {
      return new Response(JSON.stringify({ error: reportErr.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const totals =
      report?.totals ??
      ({
        salon_id: salonId,
        date_from: dateFrom,
        date_to: dateTo,
        gross_total: 0,
        net_total: 0,
        vat_total: 0,
        discount_total: 0,
      } as any);

    // 2) Righe da view sale_items_report (poi le mappo nel formato del template)
    const { data: rowsData, error: rowsErr } = await supabaseAdmin
      .from("sale_items_report")
      .select("sale_day,item_type,product_name,service_name,staff_name,line_net")
      .eq("salon_id", salonId)
      .gte("sale_day", dateFrom)
      .lte("sale_day", dateTo)
      .order("sale_day", { ascending: true });

    if (rowsErr) {
      return new Response(JSON.stringify({ error: rowsErr.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const rows: TemplateRow[] = (rowsData ?? []).map((r: any) => {
      const date = String(r.sale_day);
      const base = r.product_name ?? r.service_name ?? "Voce";
      const staff = r.staff_name ? ` — ${r.staff_name}` : "";
      const description = `${base}${staff}`;
      const net_total = Number(r.line_net ?? 0);

      return { date, description, net_total };
    });

    // NOTE: NO JSX in route.ts
    const document = React.createElement(SalonTurnoverPdf, {
      salonName: `Salon ${salonId}`,
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
        "Content-Disposition": `attachment; filename="salon-turnover-${salonId}.pdf"`,
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
