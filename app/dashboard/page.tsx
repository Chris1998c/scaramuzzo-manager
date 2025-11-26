import { createServerSupabase } from "@/lib/supabaseServer";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

      <Card href="/dashboard/magazzino" title="Magazzino" subtitle="Giacenze & Prodotti" />
      <Card href="/dashboard/movimenti" title="Movimenti" subtitle="Entrate / Uscite" />
      <Card href="/dashboard/trasferimenti" title="Trasferimenti" subtitle="Tra saloni" />
      <Card href="/dashboard/prodotti" title="Prodotti" subtitle="Catalogo completo" />
      <Card href="/dashboard/report" title="Report" subtitle="Statistiche" />
      <Card href="/dashboard/staff" title="Staff & Permessi" subtitle="Ruoli utenti" />

    </div>
  );
}

function Card({ href, title, subtitle }: { href: string; title: string; subtitle: string }) {
  return (
    <a
      href={href}
      className="
        bg-[#24140e]/70 border border-[#5c3a21]/60 
        p-6 rounded-xl
        hover:border-[var(--accent)]
        hover:shadow-[0_0_40px_rgba(216,177,138,0.25)]
        transition block 
        backdrop-blur-md
      "
    >
      <h3 className="text-xl font-bold text-[#f3d8b6] tracking-wide">{title}</h3>
      <p className="text-[#c9b299] mt-1">{subtitle}</p>
    </a>
  );
}
