import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";

import { createServerSupabase } from "@/lib/supabaseServer";
import { getUserAccess } from "@/lib/getUserAccess";
import { fetchServicesForSettings } from "@/lib/servicesCatalog";
import ImpostazioniShell from "@/components/settings/ImpostazioniShell";

export const metadata = {
  title: "Impostazioni | Scaramuzzo Manager",
  description: "Centro di controllo del gestionale",
};

export default async function ImpostazioniPage() {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const access = await getUserAccess();
  const activeSalonId = access.staffSalonId ?? access.defaultSalonId;
  const salonMeta =
    activeSalonId != null
      ? access.allowedSalons.find((s) => s.id === activeSalonId)
      : null;

  let services: Awaited<ReturnType<typeof fetchServicesForSettings>> = [];
  try {
    services = await fetchServicesForSettings(supabase, activeSalonId ?? 0);
  } catch (e) {
    console.error("Impostazioni: caricamento servizi", e);
    services = [];
  }

  const { data: catRows } = await supabase
    .from("service_categories")
    .select("id, name")
    .order("name");

  const categories = (catRows ?? []).map((c: { id: number; name: string }) => ({
    id: Number(c.id),
    name: String(c.name ?? ""),
  }));

  const canManageServices = access.role === "coordinator";

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 pb-12">
      <header className="relative overflow-hidden rounded-[2.5rem] border border-[#5c3a21]/50 bg-[#24140e]/60 p-8 md:p-10 backdrop-blur-xl shadow-2xl">
        <div className="relative z-10 space-y-4 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#f3d8b6]/10 border border-[#f3d8b6]/20 text-[#f3d8b6] text-xs font-bold tracking-widest uppercase">
            <Sparkles size={14} /> Centro di controllo
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-[#f3d8b6] tracking-tight">
            Impostazioni
          </h1>
          <p className="text-[#c9b299] text-base md:text-lg leading-relaxed">
            Configura listini, canali operativi e parametri del salone da un unico punto. Le sezioni
            sono organizzate per dominio così ogni blocco può evolvere senza rifare il layout.
          </p>
        </div>
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#f3d8b6]/10 blur-[120px] rounded-full pointer-events-none" />
      </header>

      <ImpostazioniShell
        initialServices={services}
        initialSalonId={activeSalonId}
        initialSalonLabel={salonMeta?.name ?? null}
        categories={categories}
        canManageServices={canManageServices}
      />
    </div>
  );
}
