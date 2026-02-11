import Link from "next/link";
import { redirect } from "next/navigation";
import { 
  CalendarDays, 
  Package, 
  Users, 
  BarChart3, 
  Settings, 
  Sparkles, 
  Lock,
  ArrowUpRight,
  TrendingUp,
  AlertTriangle,
  CheckCircle2
} from "lucide-react";

import { createServerSupabase } from "@/lib/supabaseServer";
import { getUserAccess } from "@/lib/getUserAccess";
// Importa la StatCard dal percorso corretto (occhio al typo "dasboard" se lo hai mantenuto così)
import { StatCard } from "@/components/dasboard/StatCard";

// --- TIPI ---
type LiveTile = {
  kind: "live";
  title: string;
  subtitle: string;
  href: string;
  icon: any;
  tag?: string;
  color?: string;
};

type LockedTile = {
  kind: "locked";
  title: string;
  subtitle: string;
  icon: any;
  tag?: string;
};

type Tile = LiveTile | LockedTile;

// --- CONFIGURAZIONE MODULI ---
const MODULES: Tile[] = [
  {
    kind: "live",
    title: "Agenda",
    subtitle: "Appuntamenti, staff, servizi",
    href: "/dashboard/agenda",
    icon: CalendarDays,
    tag: "Live",
    color: "emerald"
  },
  {
    kind: "live",
    title: "Magazzino",
    subtitle: "Carico/scarico/trasferimenti",
    href: "/dashboard/magazzino",
    icon: Package,
    tag: "Live",
    color: "amber"
  },
  {
    kind: "live",
    title: "Clienti",
    subtitle: "Anagrafiche, note, storico",
    href: "/dashboard/clienti",
    icon: Users,
    tag: "Live",
    color: "blue"
  },
  {
    kind: "live",
    title: "Report & KPI",
    subtitle: "Incassi, performance e stock",
    href: "/dashboard/report",
    icon: BarChart3,
    tag: "Analisi",
    color: "purple"
  },
  {
    kind: "locked",
    title: "Impostazioni",
    subtitle: "Configurazioni & parametri",
    icon: Settings,
    tag: "In arrivo",
  },
];

export default async function DashboardPage() {
  const supabase = await createServerSupabase();
  
  // 1. Controllo Accesso e Salone Attivo
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const access = await getUserAccess();
  // Usiamo il defaultSalonId se l'utente non ha ancora scelto (o staffSalonId)
  const activeSalonId = access.staffSalonId || access.defaultSalonId;

  // 2. Query Dati Reali (Filtrati per Salone se applicabile)
  const today = new Date().toISOString().split('T')[0];

  // Query 1: Incasso (solo completati del salone attivo)
  let incassoQuery = supabase
    .from("appointments")
    .select("price")
    .eq("date", today)
    .eq("status", "completed");
  
  if (activeSalonId) incassoQuery = incassoQuery.eq("salon_id", activeSalonId);
  const { data: incassoData } = await incassoQuery;
  const totaleIncasso = incassoData?.reduce((acc, curr) => acc + (curr.price || 0), 0) || 0;

  // Query 2: Appuntamenti (Totali vs Completati)
  let appQuery = supabase
    .from("appointments")
    .select("*", { count: 'exact', head: true })
    .eq("date", today);
  
  if (activeSalonId) appQuery = appQuery.eq("salon_id", activeSalonId);
  const { count: totalApp } = await appQuery;

  let compQuery = supabase
    .from("appointments")
    .select("*", { count: 'exact', head: true })
    .eq("date", today)
    .eq("status", "completed");
  
  if (activeSalonId) compQuery = compQuery.eq("salon_id", activeSalonId);
  const { count: completedApp } = await compQuery;

  // Query 3: Magazzino (Sottoscorta - Filter per salone se i prodotti sono divisi)
  let stockQuery = supabase
    .from("products")
    .select("*", { count: 'exact', head: true })
    .lt("stock", 5);
  
  // Se la tua tabella prodotti ha il salon_id, scommenta:
  // if (activeSalonId) stockQuery = stockQuery.eq("salon_id", activeSalonId);
  const { count: alertStock } = await stockQuery;

  return (
    <div className="max-w-[1600px] mx-auto space-y-10 pb-12">
      
      {/* --- HEADER HERO --- */}
      <section className="relative overflow-hidden rounded-[2.5rem] border border-[#5c3a21]/50 bg-[#24140e]/60 p-8 md:p-10 backdrop-blur-xl shadow-2xl">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#f3d8b6]/10 border border-[#f3d8b6]/20 text-[#f3d8b6] text-xs font-bold tracking-widest uppercase">
              <Sparkles size={14} /> Sistema Gestionale v3
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-[#f3d8b6] tracking-tight">
              Bentornato, <span className="text-white">Scaramuzzo</span>
            </h1>
            <p className="text-[#c9b299] text-lg max-w-xl leading-relaxed">
              Ecco cosa succede oggi nei tuoi saloni. Gestisci appuntamenti, 
              controlla lo stock e monitora le performance in tempo reale.
            </p>
          </div>

          <div className="flex flex-wrap gap-4">
            <QuickActionButton href="/dashboard/agenda" label="Nuovo Appuntamento" icon={CalendarDays} primary />
            <QuickActionButton href="/dashboard/magazzino" label="Carico Merce" icon={Package} />
          </div>
        </div>

        {/* Effetto luce soffusa */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#f3d8b6]/10 blur-[120px] rounded-full" />
      </section>

      {/* --- STATS GRID --- */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard 
          label="Incasso Giornaliero" 
          value={`€ ${totaleIncasso.toLocaleString('it-IT')}`} 
          description="Basato su servizi completati" 
          trend={totaleIncasso > 0 ? "up" : "neutral"} 
        />
        <StatCard 
          label="Stato Agenda" 
          value={`${completedApp || 0} / ${totalApp || 0}`} 
          description={`${(totalApp || 0) - (completedApp || 0)} appuntamenti rimasti`} 
          trend="neutral"
          variant={completedApp === totalApp && totalApp !== 0 ? "default" : "default"}
        />
        <StatCard 
          label="Alert Stock" 
          value={String(alertStock || 0)} 
          description="Referenze sotto la soglia minima" 
          trend={alertStock && alertStock > 0 ? "down" : "up"} 
          variant={alertStock && alertStock > 0 ? "warning" : "default"}
        />
      </section>

      {/* --- MODULES GRID --- */}
      <section className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <h2 className="text-2xl font-bold text-[#f3d8b6]">Moduli Operativi</h2>
          <div className="h-px flex-1 bg-[#5c3a21]/30 mx-6 hidden md:block" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
          {MODULES.map((m) => (
            <ModuleCard key={m.title} tile={m} />
          ))}
        </div>
      </section>
    </div>
  );
}

// --- SOTTO-COMPONENTI ---

function QuickActionButton({ href, label, icon: Icon, primary = false }: { href: string; label: string; icon: any; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`
        flex items-center gap-3 rounded-2xl px-6 py-4 font-bold transition-all active:scale-95
        ${primary 
          ? "bg-[#0FA958] text-white shadow-[0_10px_30px_rgba(15,169,88,0.3)] hover:bg-[#0da052] hover:shadow-[0_15px_40px_rgba(15,169,88,0.4)]" 
          : "bg-white/5 border border-[#5c3a21]/60 text-[#f3d8b6] hover:bg-white/10"
        }
      `}
    >
      <Icon size={20} />
      {label}
    </Link>
  );
}

function ModuleCard({ tile }: { tile: Tile }) {
  const Icon = tile.icon;
  const isLocked = tile.kind === "locked";

  const containerClasses = `
    group relative h-full rounded-[2rem] p-8 overflow-hidden
    bg-[#24140e]/80 border border-[#5c3a21]/60 backdrop-blur-md
    shadow-[0_10px_40px_rgba(0,0,0,0.2)]
    transition-all duration-500
    ${isLocked ? "opacity-60 cursor-not-allowed" : "hover:border-[#f3d8b6]/50 hover:-translate-y-2 hover:shadow-[0_20px_60px_rgba(0,0,0,0.4)]"}
  `;

  const CardContent = (
    <div className={containerClasses}>
      {/* Badge superiore */}
      {"tag" in tile && tile.tag && (
        <div className="absolute top-6 right-6">
          <span className={`
            px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border
            ${tile.kind === "live" 
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" 
              : "border-[#5c3a21] bg-black/20 text-[#c9b299]"}
          `}>
            {tile.tag}
          </span>
        </div>
      )}

      <div className="space-y-6">
        {/* Icona Box */}
        <div className="inline-flex rounded-2xl p-4 bg-gradient-to-br from-[#3a2217] to-[#24140e] border border-[#5c3a21] group-hover:border-[#f3d8b6]/40 transition-colors">
          <Icon className="text-[#f3d8b6]" size={32} strokeWidth={1.5} />
        </div>

        {/* Testi */}
        <div className="space-y-2">
          <h3 className="text-2xl font-black text-[#f3d8b6] group-hover:text-white transition-colors">
            {tile.title}
          </h3>
          <p className="text-[#c9b299] leading-relaxed font-medium">
            {tile.subtitle}
          </p>
        </div>

        {/* Footer Card */}
        <div className="pt-4 flex items-center justify-between">
          {isLocked ? (
            <div className="flex items-center gap-2 text-xs font-bold text-[#5c3a21] uppercase tracking-widest">
              <Lock size={14} /> Prossimamente
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm font-bold text-[#0FA958] group-hover:translate-x-1 transition-transform">
              Accedi al modulo <ArrowUpRight size={18} />
            </div>
          )}
        </div>
      </div>

      {/* Effetto Hover Background */}
      <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-[#f3d8b6]/5 blur-[60px] rounded-full group-hover:bg-[#f3d8b6]/10 transition-colors" />
    </div>
  );

  if (tile.kind === "locked") return CardContent;
  return (
    <Link href={tile.href} className="block h-full group">
      {CardContent}
    </Link>
  );
}