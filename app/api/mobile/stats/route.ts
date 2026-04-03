// Stats periodo Team: JWT Bearer obbligatorio; periodo da body (from/to); identità solo dal token.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyMobileToken, romeDayKeyFromIso } from "@/lib/mobileSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StatsBody = {
  /** Inclusive calendar day `YYYY-MM-DD` (naive local string, aligned with DB `timestamp without time zone`). */
  from?: string;
  /** Inclusive calendar day `YYYY-MM-DD`. */
  to?: string;
  /** Optional; if sent, must match `staff.salon_id` or the request is rejected. */
  salon_id?: number | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidYmd(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime());
}

/** Inclusive period bounds for `timestamp without time zone` columns. */
function periodBounds(from: string, to: string): { fromTs: string; toTs: string } {
  return {
    fromTs: `${from}T00:00:00`,
    toTs: `${to}T23:59:59.999`,
  };
}

type MobileAuthUserResult =
  | { ok: true; staffId: number; tokenSalonId: number }
  | { ok: false; response: NextResponse };

function bearerFromRequest(req: Request): string | null {
  const h = req.headers.get("authorization")?.trim();
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

/**
 * Autenticazione mobile per questa route: solo JWT (MOBILE_JWT_SECRET), nessun staff_id da body/query.
 */
function getMobileAuthUser(req: Request): MobileAuthUserResult {
  const token = bearerFromRequest(req);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const v = verifyMobileToken(token);
  if (!v.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, staffId: v.sid, tokenSalonId: v.salon_id };
}

/** PostgREST may return a single embedded row as object or one-element array. */
function embedOne<T>(x: unknown): T | null {
  if (x == null) return null;
  if (Array.isArray(x)) return (x[0] as T | undefined) ?? null;
  return x as T;
}

type AppointmentServiceRow = {
  id: number;
  service_id: number;
  appointment_id: number;
  appointments: {
    id: number;
    customer_id: string;
    status: string | null;
    start_time: string;
    salon_id: number | null;
  };
  services: {
    id: number;
    name: string;
    category_id: number | null;
    service_categories: { id: number; name: string } | null;
  } | null;
};

type SaleItemRow = {
  id: number;
  service_id: number | null;
  product_id: number | null;
  quantity: number | null;
  sales: {
    id: number;
    customer_id: string | null;
    salon_id: number | null;
    date: string;
  };
  services: { id: number; name: string } | null;
  products: { id: number; name: string } | null;
};

async function fetchAppointmentServiceOperationalRows(
  staffId: number,
  salonId: number,
  fromTs: string,
  toTs: string
): Promise<AppointmentServiceRow[]> {
  const pageSize = 1000;
  let offset = 0;
  const out: AppointmentServiceRow[] = [];
  for (;;) {
    const { data, error } = await supabaseAdmin
      .from("appointment_services")
      .select(
        `
        id,
        service_id,
        appointment_id,
        appointments!inner (
          id,
          customer_id,
          status,
          start_time,
          salon_id
        ),
        services:service_id (
          id,
          name,
          category_id,
          service_categories ( id, name )
        )
      `
      )
      .eq("staff_id", staffId)
      .eq("appointments.salon_id", salonId)
      .eq("appointments.status", "done")
      .gte("appointments.start_time", fromTs)
      .lte("appointments.start_time", toTs)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as unknown as AppointmentServiceRow[];
    out.push(...chunk);
    if (chunk.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

async function fetchSaleItemRowsForStats(
  staffId: number,
  salonId: number,
  fromTs: string,
  toTs: string
): Promise<SaleItemRow[]> {
  const pageSize = 1000;
  let offset = 0;
  const out: SaleItemRow[] = [];
  for (;;) {
    const { data, error } = await supabaseAdmin
      .from("sale_items")
      .select(
        `
        id,
        service_id,
        product_id,
        quantity,
        sales!inner (
          id,
          customer_id,
          salon_id,
          date
        ),
        services:service_id ( id, name ),
        products:product_id ( id, name )
      `
      )
      .eq("staff_id", staffId)
      .eq("sales.salon_id", salonId)
      .gte("sales.date", fromTs)
      .lte("sales.date", toTs)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as unknown as SaleItemRow[];
    out.push(...chunk);
    if (chunk.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

async function fetchWorkedDaysDistinctInPeriod(
  staffId: number,
  salonId: number,
  fromTs: string,
  toTs: string
): Promise<number> {
  const pageSize = 1000;
  let offset = 0;
  const days = new Set<string>();
  for (;;) {
    const { data, error } = await supabaseAdmin
      .from("attendance_logs")
      .select("created_at")
      .eq("staff_id", staffId)
      .eq("salon_id", salonId)
      .eq("type", "in")
      .gte("created_at", fromTs)
      .lte("created_at", toTs)
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
    const auth = getMobileAuthUser(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json()) as StatsBody;
    const staffId = auth.staffId;
    const from = String(body.from ?? "").trim();
    const to = String(body.to ?? "").trim();
    const bodySalonId =
      body.salon_id === undefined || body.salon_id === null
        ? null
        : Number(body.salon_id);
    if (!isValidYmd(from) || !isValidYmd(to)) {
      return NextResponse.json(
        { error: "Invalid period: from and to must be YYYY-MM-DD" },
        { status: 400 }
      );
    }
    if (from > to) {
      return NextResponse.json({ error: "Invalid period: from must be <= to" }, { status: 400 });
    }

    const { data: staffRow, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id, salon_id, mobile_enabled")
      .eq("id", staffId)
      .maybeSingle();

    if (staffErr) {
      console.error("mobile stats staff lookup:", staffErr.message);
      return NextResponse.json({ error: "Failed to verify staff" }, { status: 500 });
    }
    if (!staffRow) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!staffRow.mobile_enabled) {
      return NextResponse.json({ error: "Mobile access disabled" }, { status: 403 });
    }

    const salonIdRaw = staffRow.salon_id;
    if (salonIdRaw == null || !Number.isInteger(Number(salonIdRaw)) || Number(salonIdRaw) <= 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const salonId = Number(salonIdRaw);

    if (auth.tokenSalonId !== salonId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: salonRow, error: salonErr } = await supabaseAdmin
      .from("salons")
      .select("id")
      .eq("id", salonId)
      .maybeSingle();

    if (salonErr) {
      console.error("mobile stats salon lookup:", salonErr.message);
      return NextResponse.json({ error: "Failed to verify salon" }, { status: 500 });
    }
    if (!salonRow) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (bodySalonId != null) {
      if (!Number.isInteger(bodySalonId) || bodySalonId <= 0 || bodySalonId !== salonId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const { fromTs, toTs } = periodBounds(from, to);

    const opRows = await fetchAppointmentServiceOperationalRows(
      staffId,
      salonId,
      fromTs,
      toTs
    );

    const appointmentLinesByService = new Map<
      number,
      {
        service_id: number;
        name: string;
        category_id: number | null;
        category_name: string | null;
        count: number;
      }
    >();

    const completedAppointmentIds = new Set<number>();
    const agendaCustomerIds = new Set<string>();

    for (const row of opRows) {
      const ap = embedOne<AppointmentServiceRow["appointments"]>((row as AppointmentServiceRow).appointments);
      const sv = embedOne<NonNullable<AppointmentServiceRow["services"]>>(
        (row as AppointmentServiceRow).services
      );
      if (!ap || !sv) continue;

      const sc = embedOne<{ name?: string | null }>(sv.service_categories);

      const sid = Number(row.service_id);
      const name = String(sv.name ?? "").trim() || `Servizio ${sid}`;
      const catId = sv.category_id != null ? Number(sv.category_id) : null;
      const catName = sc?.name != null ? String(sc.name) : null;

      const cur = appointmentLinesByService.get(sid);
      if (cur) {
        cur.count += 1;
      } else {
        appointmentLinesByService.set(sid, {
          service_id: sid,
          name,
          category_id: catId,
          category_name: catName,
          count: 1,
        });
      }

      completedAppointmentIds.add(Number(ap.id));
      if (ap.customer_id != null && String(ap.customer_id).trim() !== "") {
        agendaCustomerIds.add(String(ap.customer_id));
      }
    }

    const saleRows = await fetchSaleItemRowsForStats(staffId, salonId, fromTs, toTs);

    let serviceLinesCount = 0;
    let productUnits = 0;
    const byServiceAgg = new Map<
      number,
      { service_id: number; name: string; qty: number; line_count: number }
    >();
    const byProductAgg = new Map<number, { product_id: number; name: string; qty: number }>();
    const salesCustomerIds = new Set<string>();

    for (const row of saleRows) {
      const sale = embedOne<SaleItemRow["sales"]>((row as SaleItemRow).sales);
      if (!sale) continue;

      const cid = sale.customer_id;
      if (cid != null && String(cid).trim() !== "") {
        salesCustomerIds.add(String(cid));
      }

      const svc = embedOne<NonNullable<SaleItemRow["services"]>>(row.services);
      const prd = embedOne<NonNullable<SaleItemRow["products"]>>(row.products);

      if (row.service_id != null) {
        serviceLinesCount += 1;
        const sid = Number(row.service_id);
        const name = String(svc?.name ?? "").trim() || `Servizio ${sid}`;
        const qty = Math.max(1, Math.floor(Number(row.quantity ?? 1)));
        const prev = byServiceAgg.get(sid);
        if (prev) {
          prev.qty += qty;
          prev.line_count += 1;
        } else {
          byServiceAgg.set(sid, {
            service_id: sid,
            name,
            qty,
            line_count: 1,
          });
        }
      }

      if (row.product_id != null) {
        const pid = Number(row.product_id);
        const pq = Math.max(1, Math.floor(Number(row.quantity ?? 1)));
        productUnits += pq;
        const pname = String(prd?.name ?? "").trim() || `Prodotto ${pid}`;
        const prev = byProductAgg.get(pid);
        if (prev) {
          prev.qty += pq;
        } else {
          byProductAgg.set(pid, { product_id: pid, name: pname, qty: pq });
        }
      }
    }

    let workedDaysCount: number;
    try {
      workedDaysCount = await fetchWorkedDaysDistinctInPeriod(staffId, salonId, fromTs, toTs);
    } catch (e) {
      console.error("mobile stats attendance_logs:", e);
      return NextResponse.json({ error: "Failed to load attendance" }, { status: 500 });
    }

    const completedAppointmentsN = completedAppointmentIds.size;

    const operational = {
      services_count: opRows.length,
      appointment_lines_by_service: Array.from(appointmentLinesByService.values()).sort((a, b) =>
        a.name.localeCompare(b.name, "it")
      ),
      appointments_completed_count: completedAppointmentsN,
      completed_appointments: completedAppointmentsN,
      appointments_completed: completedAppointmentsN,
      distinct_customers_agenda: agendaCustomerIds.size,
    };

    const sales_attributed = {
      service_lines_count: serviceLinesCount,
      product_units: productUnits,
      by_service: Array.from(byServiceAgg.values()).sort((a, b) => a.name.localeCompare(b.name, "it")),
      by_product: Array.from(byProductAgg.values()).sort((a, b) => a.name.localeCompare(b.name, "it")),
      distinct_customers_sales: salesCustomerIds.size,
    };

    return NextResponse.json({
      success: true,
      period: {
        from,
        to,
        salon_id: salonId,
      },
      operational,
      sales_attributed,
      attendance: {
        worked_days: workedDaysCount,
      },
    });
  } catch (error) {
    console.error("mobile stats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
