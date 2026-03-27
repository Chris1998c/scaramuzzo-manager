import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type StatsBody = {
  staff_id?: number;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as StatsBody;
    const staffId = Number(body.staff_id);

    if (!Number.isInteger(staffId) || staffId <= 0) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

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
      { data: clockInRows, error: clockErr },
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
      supabaseAdmin
        .from("staff_attendance_logs")
        .select("created_at")
        .eq("staff_id", staffId)
        .eq("event_type", "clock_in"),
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

    if (!clockErr && clockInRows) {
      const days = new Set<string>();
      for (const row of clockInRows as { created_at: string | null }[]) {
        const ts = row?.created_at;
        if (ts) days.add(String(ts).slice(0, 10));
      }
      stats.worked_days_count = days.size;
    }

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error("mobile dashboard stats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
