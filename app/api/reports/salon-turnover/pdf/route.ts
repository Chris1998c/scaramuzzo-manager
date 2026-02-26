// app/api/reports/salon-turnover/pdf/route.ts
import React from "react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createServerSupabase } from "@/lib/supabaseServer";
import { renderPdfToBuffer } from "@/lib/pdf/renderPdf";
import SalonTurnoverPdf from "@/lib/pdf/templates/SalonTurnoverPdf";

export const runtime = "nodejs";

type TemplateRow = {
  date: string;
  description: string;
  staff_name?: string;
  net_total: number;
};

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
    .select("id, roles:roles(name)")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  const roleName = (data as any)?.roles?.name;
  return roleName ? String(roleName).trim() : null;
}

export async function GET(req: Request) {
  try {
    // 0) AUTH
    const supabase = await createServerSupabase();
    const { data: authData, error: authErr } = await supabase.auth.getUser();

    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: "Non autenticato" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const user = authData.user;
    const userId = user.id;

    // SOLO coordinator (DB source-of-truth, fallback metadata)
    const dbRole = await getRoleFromDb(userId);
    const role = (dbRole || roleFromMetadata(user)).trim();

    if (role !== "coordinator") {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1) PARAMS
    const url = new URL(req.url);

    const salonId = toInt(url.searchParams.get("salon_id"));
    const dateFrom = url.searchParams.get("date_from"); // YYYY-MM-DD
    const dateTo = url.searchParams.get("date_to"); // YYYY-MM-DD

    // filtri opzionali
    const staffIdRaw = url.searchParams.get("staff_id");
    const paymentMethod = url.searchParams.get("payment_method"); // cash|card|null
    const itemType = url.searchParams.get("item_type"); // service|product|null
    const staffId =
      staffIdRaw && staffIdRaw.trim().length > 0 ? toInt(staffIdRaw) : null;

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

    // 2) Nome salone (per PDF)
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

    // 3) Totali via RPC
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

    const t0 =
      Array.isArray(totalsRows) && totalsRows.length > 0 ? totalsRows[0] : null;

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

    // 4) Righe via RPC
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