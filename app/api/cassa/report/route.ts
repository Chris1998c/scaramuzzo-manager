// app/api/cassa/report/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StaffRole = "reception" | "coordinator" | "magazzino";

function errMsg(e: unknown) {
  if (!e) return "unknown";
  if (typeof e === "string") return e;
  if (typeof e === "object" && "message" in e) return String((e as any).message);
  try {
    return JSON.stringify(e);
  } catch {
    return "unknown";
  }
}

function toInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toNum(v: any, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

function round2(n: number) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function roleFromMetadata(user: any): string {
  return String(user?.user_metadata?.role ?? user?.app_metadata?.role ?? "").trim();
}

function todayRomeISO(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`; // YYYY-MM-DD
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

async function getReceptionSalonId(userId: string): Promise<number | null> {
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("salon_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  const sid = toInt((data as any)?.salon_id);
  return sid && sid > 0 ? sid : null;
}

export async function GET(req: Request) {
  try {
    const supabase = await createServerSupabase();

    // AUTH
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const user = authData.user;
    const userId = user.id;

    // ROLE (DB source-of-truth, fallback metadata)
    const dbRole = await getRoleFromDb(userId);
    const role = (dbRole || roleFromMetadata(user)) as StaffRole;

    if (!["reception", "coordinator", "magazzino"].includes(role)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    // salon_id:
    // - reception: forced from staff.user_id
    // - coordinator/magazzino: ?salon_id= required
    const url = new URL(req.url);
    const qSalon = toInt(url.searchParams.get("salon_id"));
    let salonId: number | null = qSalon;

    if (role === "reception") {
      const sid = await getReceptionSalonId(userId);
      if (!sid) {
        return NextResponse.json(
          { error: "Reception senza staff.salon_id associato" },
          { status: 403 }
        );
      }
      salonId = sid;
    }

    if (!salonId || salonId <= 0) {
      return NextResponse.json({ error: "salon_id missing/invalid" }, { status: 400 });
    }

    // validate salon exists
    const { data: salonRow, error: salonErr } = await supabaseAdmin
      .from("salons")
      .select("id, name")
      .eq("id", salonId)
      .maybeSingle();

    if (salonErr) return NextResponse.json({ error: salonErr.message }, { status: 500 });
    if (!salonRow) return NextResponse.json({ error: "Salone non trovato" }, { status: 404 });

    // RANGE OGGI (Europe/Rome)
    const today = todayRomeISO();
    const start = `${today}T00:00:00`;
    const end = `${today}T23:59:59.999`;

    // SALES di oggi
    const { data: sales, error: salesErr } = await supabaseAdmin
      .from("sales")
      .select("id, total_amount, payment_method, date")
      .eq("salon_id", salonId)
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: true });

    if (salesErr) return NextResponse.json({ error: salesErr.message }, { status: 500 });

    const saleIds = Array.isArray(sales) ? sales.map((s: any) => s.id).filter(Boolean) : [];

    // Totali vendite
    let gross = 0;
    let cash = 0;
    let card = 0;
    let countSales = 0;

    for (const s of Array.isArray(sales) ? sales : []) {
      const amt = toNum((s as any)?.total_amount, 0);
      gross += amt;
      countSales += 1;
      const pm = String((s as any)?.payment_method || "").toLowerCase();
      if (pm === "cash") cash += amt;
      if (pm === "card") card += amt;
    }

    // SALE_ITEMS (solo per split servizi/prodotti)
    let countItems = 0;
    let servicesGross = 0;
    let productsGross = 0;

    if (saleIds.length) {
      const { data: items, error: itemsErr } = await supabaseAdmin
        .from("sale_items")
        .select("kind, qty, quantity, unit_price, price, discount, discount_pct, discount_percent, total_amount, line_total, amount, total")
        .in("sale_id", saleIds);

      if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

      const saleItems = Array.isArray(items) ? items : [];
      countItems = saleItems.length;

      for (const it of saleItems as any[]) {
        const kind = String(it?.kind || "").toLowerCase(); // service|product
        const qty = Math.max(0, toNum(it?.qty ?? it?.quantity, 0));
        const unitPrice = toNum(it?.unit_price ?? it?.price, 0);

        const discRaw = toNum(it?.discount ?? it?.discount_pct ?? it?.discount_percent, 0);
        const discountPct = discRaw > 0 && discRaw <= 100 ? discRaw : 0;

        const storedLineTotal = toNum(
          it?.total_amount ?? it?.line_total ?? it?.amount ?? it?.total,
          NaN
        );

        const computed = unitPrice * qty * (1 - discountPct / 100);
        const lineTotal = Number.isFinite(storedLineTotal) ? storedLineTotal : computed;

        if (kind === "service") servicesGross += lineTotal;
        if (kind === "product") productsGross += lineTotal;
      }
    }

    return NextResponse.json({
      ok: true,
      salon: { id: (salonRow as any).id, name: (salonRow as any).name ?? null },
      day: today,
      range: { start, end },
      totals: {
        gross: round2(gross),
        cash: round2(cash),
        card: round2(card),
        count_sales: countSales,
        count_items: countItems,
        services_gross: round2(servicesGross),
        products_gross: round2(productsGross),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
