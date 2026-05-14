// app/api/cassa/close-session/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserAccess } from "@/lib/getUserAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  salon_id?: number; // required for coordinator/magazzino; ignored for reception (forced)
  closing_cash?: number; // optional (default 0)
  notes?: string | null; // optional
};

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

function toMoney(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  const clamped = Math.max(0, Math.min(n, 1_000_000));
  return Math.round(clamped * 100) / 100;
}

const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

async function sumSalesByRange(args: {
  salonId: number;
  startIso: string;
  endIso: string;
}): Promise<{ gross: number; cash: number; card: number; count: number }> {
  const { data, error } = await supabaseAdmin
    .from("sales")
    .select("total_amount, payment_method")
    .eq("salon_id", args.salonId)
    .gte("date", args.startIso)
    .lte("date", args.endIso);

  if (error || !Array.isArray(data)) return { gross: 0, cash: 0, card: 0, count: 0 };

  let gross = 0;
  let cash = 0;
  let card = 0;

  for (const s of data as any[]) {
    const amt = Number(s?.total_amount) || 0;
    gross += amt;
    if (s?.payment_method === "cash") cash += amt;
    if (s?.payment_method === "card") card += amt;
  }

  return {
    gross: round2(gross),
    cash: round2(cash),
    card: round2(card),
    count: data.length,
  };
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();

    // AUTH
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const userId = authData.user.id;
    const access = await getUserAccess();
    const role = access.role;

    if (!["reception", "coordinator", "magazzino"].includes(role)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({} as Body))) as Body;

    // salon_id:
    // - reception: forced from staff.user_id
    // - coordinator/magazzino: required in body
    let salonId = toInt(body?.salon_id);

    if (role === "reception") {
      const sid = access.staffSalonId;
      if (!sid) {
        return NextResponse.json(
          { error: "Reception senza staff.salon_id associato" },
          { status: 403 }
        );
      }
      salonId = sid; // hard force
    }

    if (!salonId || salonId <= 0) {
      return NextResponse.json({ error: "salon_id missing/invalid" }, { status: 400 });
    }

    // AUTHZ salone per coordinator/magazzino
    if (role !== "reception" && !access.allowedSalonIds.includes(salonId)) {
      return NextResponse.json(
        { error: "salon_id non consentito per questo utente" },
        { status: 403 },
      );
    }

    // validate salon exists
    const { data: salonRow, error: salonErr } = await supabaseAdmin
      .from("salons")
      .select("id, name")
      .eq("id", salonId)
      .maybeSingle();

    if (salonErr) return NextResponse.json({ error: salonErr.message }, { status: 500 });
    if (!salonRow) return NextResponse.json({ error: "Salone non trovato" }, { status: 404 });

    // latest open session
    const { data: session, error: sessErr } = await supabaseAdmin
      .from("cash_sessions")
      .select(
        "id, salon_id, session_date, opening_cash, closing_cash, status, opened_by, opened_at, closed_by, closed_at, notes"
      )
      .eq("salon_id", salonId)
      .is("closed_at", null)
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 500 });

    if (!session) {
      return NextResponse.json({ error: "Nessuna cassa aperta per questo salone" }, { status: 400 });
    }

    const sessionId = (session as any).id as number | bigint;

    const nowIso = new Date().toISOString();
    const openedAt = String((session as any).opened_at || nowIso);

    // Totali sessione: opened_at -> now
    const totals = await sumSalesByRange({
      salonId,
      startIso: openedAt,
      endIso: nowIso,
    });

    // closing_cash e note
    const closingCash = toMoney((body as any)?.closing_cash);
    const notes = typeof body?.notes === "string" ? body.notes.trim() : null;

    const cashSessionId =
      typeof sessionId === "bigint" ? Number(sessionId) : Number(sessionId);

    const { data: blockRows, error: blockErr } = await supabaseAdmin
      .from("fiscal_print_jobs")
      .select("id")
      .eq("salon_id", salonId)
      .eq("kind", "sale_receipt")
      .in("status", ["pending", "processing", "error"])
      .limit(1);

    if (blockErr) {
      return NextResponse.json({ error: blockErr.message }, { status: 500 });
    }
    if (blockRows && blockRows.length > 0) {
      return NextResponse.json(
        { error: "Impossibile chiudere la cassa: ricevute fiscali non completate." },
        { status: 409 }
      );
    }

    let fiscalWarning: string | null = null;
    let fiscalJob: any | null = null;
    try {
      const { data: profile, error: profErr } = await supabaseAdmin.rpc("get_fiscal_profile", {
        p_salon_id: salonId,
        p_on_date: nowIso.slice(0, 10),
      });

      if (profErr || !profile || profile.length === 0) {
        fiscalWarning = "Fiscal profile non trovato per il salone; Z non richiesta";
      } else {
        const fiscal = profile[0] as any;

        const selectZForSession = async () => {
          const { data: row, error: selErr } = await supabaseAdmin
            .from("fiscal_print_jobs")
            .select()
            .eq("kind", "z_report")
            .eq("cash_session_id", cashSessionId)
            .maybeSingle();
          return { row, selErr };
        };

        const existing = await selectZForSession();
        if (existing.selErr) {
          throw new Error(`Job fiscale Z: lookup fallito: ${existing.selErr.message ?? "errore"}`);
        }
        if (existing.row) {
          fiscalJob = existing.row;
        } else {
          const payload = {
            cash_session_id: cashSessionId,
            requested_at: nowIso,
            printer_serial: fiscal.printer_serial,
          };
          const { data: inserted, error: jobErr } = await supabaseAdmin
            .from("fiscal_print_jobs")
            .insert({
              salon_id: salonId,
              created_by: userId,
              kind: "z_report",
              cash_session_id: cashSessionId,
              printer_model: fiscal.printer_model,
              printer_serial: fiscal.printer_serial,
              payload,
              status: "pending",
            })
            .select()
            .single();

          const dup =
            jobErr?.code === "23505" ||
            /duplicate key|unique constraint/i.test(String(jobErr?.message ?? ""));

          if (!jobErr && inserted) {
            fiscalJob = inserted;
          } else if (dup) {
            const again = await selectZForSession();
            if (again.selErr) {
              throw new Error(
                `Job fiscale Z: conflitto ma refetch fallito: ${again.selErr.message ?? "errore"}`
              );
            }
            if (again.row) {
              fiscalJob = again.row;
            } else {
              throw new Error("Job fiscale Z: conflitto unique senza job trovato");
            }
          } else if (jobErr) {
            throw new Error(`Job fiscale Z non creato: ${jobErr.message ?? "errore"}`);
          }
        }
      }
    } catch (e) {
      return NextResponse.json({ error: errMsg(e) }, { status: 500 });
    }

    const patch: any = {
      closing_cash: closingCash,
      status: "closed",
      closed_by: authData.user.id,
      closed_at: nowIso,
    };

    if (notes) patch.notes = notes;

    const { data: updatedRows, error: updErr } = await supabaseAdmin
      .from("cash_sessions")
      .update(patch)
      .eq("id", sessionId)
      .is("closed_at", null)
      .select(
        "id, salon_id, session_date, opening_cash, closing_cash, status, opened_by, opened_at, closed_by, closed_at, notes"
      );

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    const updated =
      Array.isArray(updatedRows) && updatedRows.length > 0 ? updatedRows[0] : null;

    if (!updated) {
      const { data: closedSession, error: closedErr } = await supabaseAdmin
        .from("cash_sessions")
        .select(
          "id, salon_id, session_date, opening_cash, closing_cash, status, opened_by, opened_at, closed_by, closed_at, notes"
        )
        .eq("id", sessionId)
        .maybeSingle();

      if (closedErr || !closedSession) {
        return NextResponse.json(
          { error: closedErr?.message ?? "Sessione non trovata dopo chiusura concorrente" },
          { status: 500 }
        );
      }

      const cs = closedSession as any;
      const closedAtIso = String(cs.closed_at ?? nowIso);
      const openedAtReplay = String(cs.opened_at ?? closedAtIso);
      const totalsReplay = await sumSalesByRange({
        salonId,
        startIso: openedAtReplay,
        endIso: closedAtIso,
      });

      return NextResponse.json({
        ok: true,
        already_closed: true,
        salon: { id: (salonRow as any).id, name: (salonRow as any).name ?? null },
        session: closedSession,
        totals: {
          session_gross: totalsReplay.gross,
          session_cash: totalsReplay.cash,
          session_card: totalsReplay.card,
          session_count_sales: totalsReplay.count,
        },
        fiscal_job: null,
        fiscal_warning: null,
      });
    }

    return NextResponse.json({
      ok: true,
      salon: { id: (salonRow as any).id, name: (salonRow as any).name ?? null },
      session: updated,
      totals: {
        session_gross: totals.gross,
        session_cash: totals.cash,
        session_card: totals.card,
        session_count_sales: totals.count,
      },
      fiscal_job: fiscalJob,
      fiscal_warning: fiscalWarning,
    });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
