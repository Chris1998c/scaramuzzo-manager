import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabaseServer";
import NoteTecniche from "./note-tecniche";

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

  if (error || !customer) {
    redirect("/dashboard/clienti");
  }

  return (
    <div className="space-y-10">
      {/* HEADER */}
      <div className="rounded-3xl bg-[#24140e]/70 border border-[#5c3a21]/60 p-6">
        <h1 className="text-3xl font-extrabold text-[#f3d8b6]">
          {customer.first_name} {customer.last_name}
        </h1>
        <div className="mt-2 text-[#c9b299] space-y-1">
          <div>📞 {customer.phone}</div>
          {customer.address && <div>📍 {customer.address}</div>}
        </div>
      </div>

      {/* NOTE TECNICHE */}
      <NoteTecniche customerId={customer.id} />
    </div>
  );
}
