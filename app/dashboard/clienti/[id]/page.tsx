import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabaseServer";
import { ArrowLeft } from "lucide-react";
import ClienteProfile from "./cliente-profile";
import SchedeTecniche from "./schede-tecniche";

type Params = { id: string };

export default async function ClientePage({ params }: { params: Params }) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: customer, error } = await supabase
    .from("customers")
    .select("id, first_name, last_name, phone, address")
    .eq("id", params.id)
    .single();

  if (error || !customer) redirect("/dashboard/clienti");

  return (
    <div className="space-y-8">
      {/* TOP HEADER */}
      <div className="rounded-3xl bg-[#24140e]/70 border border-[#5c3a21]/60 p-6 backdrop-blur-md shadow-[0_0_60px_rgba(0,0,0,0.22)]">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <Link
              href="/dashboard/clienti"
              className="inline-flex items-center gap-2 text-sm text-[#c9b299] hover:text-[#f3d8b6] transition"
            >
              <ArrowLeft size={16} />
              Torna ai clienti
            </Link>

            <h1 className="mt-3 text-3xl font-extrabold text-[#f3d8b6] tracking-tight truncate">
              {customer.first_name} {customer.last_name}
            </h1>

            <div className="mt-2 text-[#c9b299] space-y-1 text-sm">
              <div>📞 {customer.phone}</div>
              {customer.address && <div>📍 {customer.address}</div>}
            </div>
          </div>

          <div className="hidden md:block">
            <span className="inline-flex px-3 py-1 rounded-full border border-[#5c3a21]/60 bg-black/15 text-xs text-[#f3d8b6]/70">
              Scheda cliente globale (tutti i saloni)
            </span>
          </div>
        </div>
      </div>

      {/* GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1 space-y-6">
          <ClienteProfile customerId={customer.id} />
        </div>

        <div className="xl:col-span-2 space-y-6">
          <SchedeTecniche customerId={customer.id} />
        </div>
      </div>
    </div>
  );
}
