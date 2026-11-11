import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabaseServer";
import { getUserAccess } from "@/lib/getUserAccess";
import { canAccessClientiWeb } from "@/lib/clientiWebAccess";
import { ArrowLeft } from "lucide-react";
import ClienteProfile from "./cliente-profile";
import SchedeTecniche from "./schede-tecniche";
import ClientInsightsPanel from "./ClientInsightsPanel";
import ClientTimelinePanel from "./ClientTimelinePanel";
import ClienteAnagraficaForm from "./ClienteAnagraficaForm";
import { mapCustomerMarketingToInitial } from "@/lib/customers/clienteAnagraficaMarketing";
import {
  parseAppointmentIdSearchParam,
  resolveClienteSchedaAppointmentContext,
  type VerifiedSchedaAppointmentContext,
} from "@/lib/customers/clienteSchedaAppointmentContext";

type Params = { id: string };
type SearchParams = { appointment_id?: string | string[] };

function canAccessClientiModule(role: string) {
  return role === "coordinator" || role === "reception" || role === "magazzino";
}

export default async function ClientePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const access = await getUserAccess();
  if (!canAccessClientiWeb(access.role)) {
    redirect("/dashboard");
  }

  const { data: customer, error: fetchError } = await supabase
    .from("customers")
    .select(
      "id, customer_code, first_name, last_name, phone, email, address, notes, marketing_whatsapp_opt_in, marketing_consent_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !customer) {
    const message = fetchError?.message ?? "Customer not found for id";
    console.error("[CLIENTE_DETAIL_ERROR]", {
      requestedId: id,
      message,
      queryError: fetchError ?? null,
    });
    return (
      <div className="space-y-6 p-4 min-h-screen bg-[#1A0F0A] text-white">
 <Link
 href="/dashboard/clienti"
          className="inline-flex items-center gap-2 text-sm text-[#c9b299] hover:text-[#f3d8b6] transition"
        >
          <ArrowLeft size={16} />
          Torna ai clienti
        </Link>
        <div
          className="rounded-2xl border-4 border-red-500 bg-red-950/80 p-6 font-mono text-sm space-y-3
 text-red-100"
        >
          <div className="text-lg font-black uppercase tracking-wide text-red-300">
            CLIENTE NON TROVATO O FETCH FALLITO
          </div>
          <div>
            <span className="text-red-400/90">requestedId:</span> {id}
          </div>
          <div>
            <span className="text-red-400/90">fetchError.message:</span>{" "}
 {fetchError?.message ?? "(nessun errore PostgREST — riga assente)"}
          </div>
        </div>
      </div>
    );
  }

  const c = customer;

  const requested = parseAppointmentIdSearchParam(sp.appointment_id);
  let schedaAppointment: VerifiedSchedaAppointmentContext | null = null;
  let schedaAppointmentWarning: string | null = null;

  if (requested.present) {
    let appointmentRow: {
      id: number;
      customer_id: string | null;
      salon_id: number | null;
      staff_id: number | null;
    } | null = null;

    if (requested.appointmentId != null) {
      const { data: appt } = await supabase
        .from("appointments")
        .select("id, customer_id, salon_id, staff_id")
        .eq("id", requested.appointmentId)
        .maybeSingle();
      appointmentRow = appt
        ? {
            id: Number(appt.id),
            customer_id: appt.customer_id == null ? null : String(appt.customer_id),
            salon_id: appt.salon_id == null ? null : Number(appt.salon_id),
            staff_id: appt.staff_id == null ? null : Number(appt.staff_id),
          }
        : null;
    }

    const resolved = resolveClienteSchedaAppointmentContext({
      pageCustomerId: String(c.id),
      requested,
      appointment: appointmentRow,
      role: access.role,
      allowedSalonIds: access.allowedSalonIds,
      staffSalonId: access.staffSalonId,
    });

    if (resolved.status === "ok") {
      schedaAppointment = resolved.context;
    } else if (resolved.status === "error") {
      schedaAppointmentWarning = resolved.message;
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
 <Link
 href="/dashboard/clienti"
          className="inline-flex items-center gap-2 text-sm text-[#c9b299] hover:text-[#f3d8b6] transition"
        >
          <ArrowLeft size={16} />
          Torna ai clienti
        </Link>
        <span className="inline-flex px-3 py-1 rounded-full border border-[#5c3a21]/60 bg-black/15 text-xs text-[#f3d8b6]/70">
          Scheda cliente globale (tutti i saloni)
        </span>
      </div>

      {schedaAppointmentWarning ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {schedaAppointmentWarning}
        </div>
      ) : null}
      {schedaAppointment ? (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          Contesto appuntamento #{schedaAppointment.appointmentId}: le nuove schede
          tecniche verranno collegate a questo appuntamento.
        </div>
      ) : null}

      <ClienteAnagraficaForm
        initial={{
          id: c.id,
          customer_code: String(c.customer_code),
          first_name: c.first_name,
          last_name: c.last_name,
          phone: c.phone,
          email: c.email,
          address: c.address,
          notes: c.notes,
          ...mapCustomerMarketingToInitial({
            marketing_whatsapp_opt_in: c.marketing_whatsapp_opt_in,
            marketing_consent_at: c.marketing_consent_at,
          }),
        }}
      />

      {/* GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1 space-y-6">
          <ClienteProfile customerId={customer.id} />
          <ClientTimelinePanel customerId={customer.id} />
          <ClientInsightsPanel customerId={customer.id} />
        </div>

        <div className="xl:col-span-2 space-y-6">
          <SchedeTecniche
            customerId={customer.id}
            appointmentId={schedaAppointment?.appointmentId ?? null}
            salonId={schedaAppointment?.salonId ?? null}
            staffId={schedaAppointment?.staffId ?? null}
          />
        </div>
      </div>
    </div>
  );
}
