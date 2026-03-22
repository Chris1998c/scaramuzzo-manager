// app/api/customer/claim/route.ts
// Collega l'utente autenticato al record customers tramite customer_code (legacy v1).
// Produzione: CUSTOMER_CLAIM_ALLOW_CODE_MANUAL=false e flusso /claim/request-otp + /claim/verify-otp.
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { findCustomerByCode, getLinkBlock } from "@/lib/customerClaim/claimShared";

async function ensureClaimReadyForLink(_ctx: {
  customerId: string;
  userId: string;
  customerCode: string;
}): Promise<{ ok: true } | { ok: false; message: string; code: string }> {
  if (process.env.CUSTOMER_CLAIM_ALLOW_CODE_MANUAL === "false") {
    return {
      ok: false,
      message:
        "Questo flusso non è abilitato. Usa la verifica OTP (WhatsApp) dal portale cliente.",
      code: "use_otp_flow",
    };
  }
  return { ok: true };
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { success: false, error: "Autenticazione richiesta." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => null);
    const raw = body?.customer_code;
    const customer_code =
      typeof raw === "string" ? raw.trim() : "";

    if (!customer_code) {
      return NextResponse.json(
        { success: false, error: "Parametro customer_code obbligatorio." },
        { status: 400 }
      );
    }

    const { data: customer, error: custErr } = await findCustomerByCode(
      customer_code
    );

    if (custErr) {
      return NextResponse.json(
        { success: false, error: "Errore durante la ricerca del cliente." },
        { status: 500 }
      );
    }

    if (!customer) {
      return NextResponse.json(
        { success: false, error: "Nessun cliente trovato per questo codice." },
        { status: 404 }
      );
    }

    const customerId = customer.id as string;
    const userId = user.id;

    const gate = await ensureClaimReadyForLink({
      customerId,
      userId,
      customerCode: customer_code,
    });
    if (!gate.ok) {
      return NextResponse.json(
        { success: false, error: gate.message, code: gate.code },
        { status: 403 }
      );
    }

    const link = await getLinkBlock(customerId, userId);
    if (!link.ok) {
      return NextResponse.json(
        { success: false, error: "Errore durante la verifica del collegamento." },
        { status: 500 }
      );
    }
    if (link.block === "customer_already_linked") {
      return NextResponse.json(
        {
          success: false,
          error: "Questo profilo cliente è già collegato a un account.",
          code: "customer_already_linked",
        },
        { status: 409 }
      );
    }
    if (link.block === "user_already_linked") {
      return NextResponse.json(
        {
          success: false,
          error: "Il tuo account è già collegato a un profilo cliente.",
          code: "user_already_linked",
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("customer_auth_links")
      .insert({
        customer_id: customerId,
        user_id: userId,
        link_method: "code_manual",
        verified_at: now,
      })
      .select("id")
      .maybeSingle();

    if (insErr) {
      const msg = insErr.message ?? "";
      if (msg.includes("duplicate") || msg.includes("unique")) {
        return NextResponse.json(
          {
            success: false,
            error: "Collegamento già esistente. Riprova tra un attimo.",
            code: "link_conflict",
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { success: false, error: "Impossibile completare il collegamento." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      customer_id: customerId,
      link_id: inserted?.id ?? null,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Richiesta non valida." },
      { status: 400 }
    );
  }
}
