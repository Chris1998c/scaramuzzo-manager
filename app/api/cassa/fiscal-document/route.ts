import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { getFiscalDocumentBySaleId } from "@/lib/fiscal/getFiscalDocumentBySaleId";
import { computeVoidFiscalEligibility } from "@/lib/fiscal/voidFiscalEligibility";
import { getUserAccess } from "@/lib/getUserAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function errMsg(e: unknown) {
  if (!e) return "unknown";
  if (typeof e === "string") return e;
  if (typeof e === "object" && e && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return "Errore server";
}

export async function GET(req: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const access = await getUserAccess();
    if (access.role === "cliente" || access.role === "magazzino") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    const url = new URL(req.url);
    const saleId = toInt(url.searchParams.get("sale_id"));
    if (saleId == null) {
      return NextResponse.json(
        { error: "sale_id obbligatorio e valido" },
        { status: 400 },
      );
    }

    const { data: sale, error: saleErr } = await supabase
      .from("sales")
      .select("id, salon_id")
      .eq("id", saleId)
      .maybeSingle();

    if (saleErr) {
      return NextResponse.json({ error: saleErr.message }, { status: 500 });
    }
    if (!sale) {
      return NextResponse.json({ error: "Vendita non trovata" }, { status: 404 });
    }

    const salonId = Number((sale as { salon_id?: unknown }).salon_id);
    if (
      access.role !== "coordinator" &&
      !access.allowedSalonIds.includes(salonId)
    ) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    const { fiscal_status, sale_status, document, void_void_job } =
      await getFiscalDocumentBySaleId(saleId);

    const voidEligibility = computeVoidFiscalEligibility({
      isCoordinator: access.role === "coordinator",
      fiscalStatus: fiscal_status,
      saleStatus: sale_status,
      document,
      voidVoidJob: void_void_job,
    });

    return NextResponse.json({
      ok: true,
      sale_id: saleId,
      fiscal_status,
      sale_status,
      document,
      void_void_job,
      can_void_fiscal: voidEligibility.canVoid,
      void_blocked_reason: voidEligibility.reason,
    });
  } catch (e) {
    console.error("GET /api/cassa/fiscal-document", e);
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
