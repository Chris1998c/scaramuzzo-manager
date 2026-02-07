import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabaseServer";
import ClientiView from "./ClientiView";

export default async function ClientiPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, first_name, last_name, phone, address, notes")
    .order("last_name", { ascending: true });

  if (error) {
    throw new Error("Errore caricamento clienti: " + error.message);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-[#f3d8b6] tracking-tight">
          Clienti
        </h1>
        <p className="text-[#c9b299] mt-2">
          Anagrafiche globali condivise tra tutti i saloni
        </p>
      </div>

      <ClientiView initial={customers ?? []} />
    </div>
  );
}
