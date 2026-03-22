import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabaseServer";
import { ArrowLeft } from "lucide-react";
import ClienteProfile from "./cliente-profile";
import SchedeTecniche from "./schede-tecniche";
import ClientInsightsPanel from "./ClientInsightsPanel";
import ClienteAnagraficaForm from "./ClienteAnagraficaForm";

type Params = { id: string };

export default async function ClientePage({ params }: { params: Params }) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: customer, error } = await supabase
    .from("customers")
    .select("id, customer_code, first_name, last_name, phone, email, address, notes")
    .eq("id", params.id)
    .single();

  if (error || !customer) redirect("/dashboard/clienti");

  const c = customer as {
    id: string;
    customer_code: string;
    first_name: string;
    last_name: string;
    phone: string;
    email: string | null;
    address: string | null;
    notes: string | null;
  };

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
          customer_code: c.customer_code,
          first_name: c.first_name,
          last_name: c.last_name,
          phone: c.phone,
          email: c.email,
          address: c.address,
          notes: c.notes,
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
