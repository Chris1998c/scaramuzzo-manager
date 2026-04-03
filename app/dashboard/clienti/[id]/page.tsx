import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabaseServer";
import { getUserAccess } from "@/lib/getUserAccess";
import { canAccessClientiWeb } from "@/lib/clientiWebAccess";
import { ArrowLeft } from "lucide-react";
import ClienteProfile from "./cliente-profile";
import SchedeTecniche from "./schede-tecniche";
import ClientInsightsPanel from "./ClientInsightsPanel";
import ClienteAnagraficaForm from "./ClienteAnagraficaForm";

type Params = { id: string };

function canAccessClientiModule(role: string) {
  return role === "coordinator" || role === "reception" || role === "magazzino";
}

export default async function ClientePage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
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
    .select("id, first_name, last_name, phone, email, address, notes")
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

      <ClienteAnagraficaForm
        initial={{
          id: c.id,
          customer_code: "",
          first_name: c.first_name,
          last_name: c.last_name,
          phone: c.phone,
          email: c.email,
          address: c.address,
          notes: c.notes,
          marketing_whatsapp_opt_in: false,
          marketing_consent_at: null,
        }}
      />

      {/* GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1 space-y-6">
          <ClienteProfile customerId={customer.id} />
          <ClientInsightsPanel customerId={customer.id} />
        </div>

        <div className="xl:col-span-2 space-y-6">
          <SchedeTecniche customerId={customer.id} />
        </div>
      </div>
    </div>
  );
}
