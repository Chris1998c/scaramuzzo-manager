// POST /api/customer/claim/verify-otp
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  findCustomerByCode,
  getLinkBlock,
  MAX_VERIFY_ATTEMPTS,
} from "@/lib/customerClaim/claimShared";
import { verifyClaimOtp } from "@/lib/customerClaim/otpCrypto";

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
    const customer_code =
      typeof body?.customer_code === "string" ? body.customer_code.trim() : "";
    const otpRaw = typeof body?.otp === "string" ? body.otp.trim() : "";

    if (!customer_code || !otpRaw) {
      return NextResponse.json(
        { success: false, error: "Parametri customer_code e otp obbligatori." },
        { status: 400 }
      );
    }

    if (!/^\d{4,8}$/.test(otpRaw)) {
      return NextResponse.json(
        { success: false, error: "Codice OTP non valido." },
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

    const { data: challenge, error: chErr } = await supabaseAdmin
      .from("customer_claim_otp_challenges")
      .select("id, otp_hash, expires_at, attempt_count")
      .eq("user_id", userId)
      .eq("customer_id", customerId)
      .maybeSingle();

    if (chErr) {
      return NextResponse.json(
        { success: false, error: "Errore durante la verifica." },
        { status: 500 }
      );
    }

    if (!challenge) {
      return NextResponse.json(
        {
          success: false,
          error: "Nessuna verifica in corso. Richiedi un nuovo codice.",
          code: "challenge_missing",
        },
        { status: 400 }
      );
    }

    const expiresAt = new Date(String(challenge.expires_at)).getTime();
    if (Number.isNaN(expiresAt) || expiresAt < Date.now()) {
      await supabaseAdmin
        .from("customer_claim_otp_challenges")
        .delete()
        .eq("id", challenge.id);
      return NextResponse.json(
        {
          success: false,
          error: "Codice scaduto. Richiedi un nuovo codice.",
          code: "challenge_expired",
        },
        { status: 400 }
      );
    }

    const attempts = Number(challenge.attempt_count) || 0;
    if (attempts >= MAX_VERIFY_ATTEMPTS) {
      await supabaseAdmin
        .from("customer_claim_otp_challenges")
        .delete()
        .eq("id", challenge.id);
      return NextResponse.json(
        {
          success: false,
          error: "Troppi tentativi errati. Richiedi un nuovo codice.",
          code: "challenge_locked",
        },
        { status: 429 }
      );
    }

    const ok = verifyClaimOtp(otpRaw, String(challenge.otp_hash));

    if (!ok) {
      await supabaseAdmin
        .from("customer_claim_otp_challenges")
        .update({ attempt_count: attempts + 1 })
        .eq("id", challenge.id);

      return NextResponse.json(
        {
          success: false,
          error: "Codice non valido.",
          code: "otp_invalid",
          attempts_remaining: Math.max(0, MAX_VERIFY_ATTEMPTS - attempts - 1),
        },
        { status: 400 }
      );
    }

    await supabaseAdmin
      .from("customer_claim_otp_challenges")
      .delete()
      .eq("id", challenge.id);

    const now = new Date().toISOString();
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("customer_auth_links")
      .insert({
        customer_id: customerId,
        user_id: userId,
        link_method: "whatsapp_otp",
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
            error: "Collegamento già esistente.",
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
