/**
 * @deprecated Mobile LEGACY — POST /api/mobile/dashboard/stats
 * Conteggi globali senza periodo. Contratto KPI attuale: POST /api/mobile/stats (from/to).
 * Ogni risposta include `X-SM-API-Class` + `X-SM-Preferred-Replacement`. Rimuovere quando nessun client la chiama.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveMobileStaffId, romeDayKeyFromIso } from "@/lib/mobileSession";

function markLegacyMobileStats(res: NextResponse): NextResponse {
  res.headers.set("X-SM-API-Class", "mobile-legacy-dashboard-stats");
  res.headers.set("X-SM-Preferred-Replacement", "POST /api/mobile/stats");
  return res;
}

type StatsBody = {
  staff_id?: number;
};

async function countWorkedDaysAllTimeFromAttendanceLogs(staffId: number): Promise<number> {
  const pageSize = 1000;
  let offset = 0;
  const days = new Set<string>();
  for (;;) {
    const { data, error } = await supabaseAdmin
      .from("attendance_logs")
      .select("created_at")
      .eq("staff_id", staffId)
      .eq("type", "in")
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const row of rows) {
      const ts = (row as { created_at?: string | null }).created_at;
      if (ts) days.add(romeDayKeyFromIso(ts));
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return days.size;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as StatsBody;
    const idRes = resolveMobileStaffId(req, body);
    if (!idRes.ok) return markLegacyMobileStats(idRes.response);

    const staffId = idRes.staffId;

    const stats = {
      services_count: 0,
      clients_count: 0,
      products_count: 0,
      worked_days_count: 0,
    };

    const [
      { count: servicesCount, error: servicesErr },
      { count: productsCount, error: productsErr },
      { data: saleCustomerRows, error: clientsErr },
    ] = await Promise.all([
      supabaseAdmin
        .from("sale_items")
        .select("*", { count: "exact", head: true })
        .eq("staff_id", staffId)
        .not("service_id", "is", null),
      supabaseAdmin
        .from("sale_items")
        .select("*", { count: "exact", head: true })
        .eq("staff_id", staffId)
        .not("product_id", "is", null),
      supabaseAdmin.from("sale_items").select("sales(customer_id)").eq("staff_id", staffId),
    ]);

    if (!servicesErr && typeof servicesCount === "number") {
      stats.services_count = servicesCount;
    }

    if (!productsErr && typeof productsCount === "number") {
      stats.products_count = productsCount;
    }

    if (!clientsErr && saleCustomerRows) {
      const customerIds = new Set<string>();
      for (const row of saleCustomerRows as unknown as Array<{ sales: { customer_id: string | null } | null }>) {
        const cid = row?.sales?.customer_id;
        if (cid != null && cid !== "") customerIds.add(String(cid));
      }
      stats.clients_count = customerIds.size;
    }

    try {
      stats.worked_days_count = await countWorkedDaysAllTimeFromAttendanceLogs(staffId);
    } catch (e) {
      console.error("mobile dashboard stats attendance_logs:", e);
    }

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error("mobile dashboard stats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
