// POST /api/cassa/resolve-uncertain-void — coordinator only; no Epson command.
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserAccess } from "@/lib/getUserAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  sale_id?: number | string;
  outcome?: string;
  confirmation_note?: string;
  void_fiscal_receipt_number?: string;
  void_z_rep_number?: string;
  void_fiscal_receipt_date?: string;
  void_printer_serial?: string;
};

function toSaleId(v: unknown): number | null {
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

function mapRpcError(message: string): number {
  const m = message.toLowerCase();
  if (/non trovata|non trovato/.test(m)) return 404;
  if (
    /non in fiscal_void_pending|ancora attivo|non riconciliabile|servono n\.|obbligatoria|deve essere/.test(
      m,
    )
  ) {
    return 409;
  }
  return 500;
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const access = await getUserAccess();
    if (access.role !== "coordinator") {
      return NextResponse.json(
        { error: "Solo il coordinator può riconciliare un void incerto" },
        { status: 403 },
      );
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const saleId = toSaleId(body.sale_id);
    const outcome = String(body.outcome ?? "")
      .trim()
      .toLowerCase();
    const note =
      typeof body.confirmation_note === "string"
        ? body.confirmation_note.trim()
        : "";

    if (saleId == null) {
      return NextResponse.json(
        { error: "sale_id obbligatorio e valido" },
        { status: 400 },
      );
    }
    if (outcome !== "void_printed" && outcome !== "void_not_printed") {
      return NextResponse.json(
        { error: "outcome deve essere void_printed o void_not_printed" },
        { status: 400 },
      );
    }
    if (note.length < 10) {
      return NextResponse.json(
        { error: "confirmation_note obbligatoria (minimo 10 caratteri)" },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin.rpc(
      "resolve_uncertain_fiscal_void",
      {
        p_sale_id: saleId,
        p_actor_id: authData.user.id,
        p_outcome: outcome,
        p_confirmation_note: note,
        p_void_fiscal_receipt_number:
          typeof body.void_fiscal_receipt_number === "string"
            ? body.void_fiscal_receipt_number.trim()
            : null,
        p_void_z_rep_number:
          typeof body.void_z_rep_number === "string"
            ? body.void_z_rep_number.trim()
            : null,
        p_void_fiscal_receipt_date:
          typeof body.void_fiscal_receipt_date === "string"
            ? body.void_fiscal_receipt_date.trim()
            : null,
        p_void_printer_serial:
          typeof body.void_printer_serial === "string"
            ? body.void_printer_serial.trim()
            : null,
      },
    );

    if (error) {
      const msg = error.message ?? "Errore riconciliazione void";
      return NextResponse.json({ error: msg }, { status: mapRpcError(msg) });
    }

    return NextResponse.json({ ok: true, result: data });
  } catch (e) {
    console.error("POST /api/cassa/resolve-uncertain-void", e);
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
