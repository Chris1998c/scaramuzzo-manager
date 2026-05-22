import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  CalendarDays,
  ClipboardList,
  Package,
  Users,
  BarChart3,
  Settings,
  Sparkles,
  Lock,
  ArrowUpRight,
  MessageCircle,
  UserSquare2,
} from "lucide-react";

import { createServerSupabase } from "@/lib/supabaseServer";
import { getUserAccess } from "@/lib/getUserAccess";
import {
  SALES_LEDGER_OPERATION_TYPE,
  SALES_LEDGER_STATUS,
} from "@/lib/reports/ledgerSalesFilter";
import { canAccessMarketingWeb } from "@/lib/marketingWebAccessShared";
import { MAGAZZINO_CENTRALE_ID } from "@/lib/constants";
import DashboardSalonQuerySync from "@/components/dashboard/DashboardSalonQuerySync";
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

type StaffRole = "coordinator" | "reception" | "magazzino" | "cliente";

type ModuleDef = LiveTile & { visibleFor: (role: StaffRole) => boolean };

// --- CONFIGURAZIONE MODULI (filtrati per ruolo in pagina) ---
const HOME_MODULE_DEFS: ModuleDef[] = [
  {
    kind: "live",
    title: "Agenda",
    subtitle: "Appuntamenti, staff, servizi",
    href: "/dashboard/agenda",
    icon: CalendarDays,
    tag: "Live",
    color: "emerald",
    visibleFor: (r) => r !== "cliente",
  },
  {
    kind: "live",
    title: "In sala",
    subtitle: "Appuntamenti in corso e cassa",
    href: "/dashboard/in-sala",
    icon: UserSquare2,
    tag: "Live",
    color: "emerald",
    visibleFor: (r) => r !== "cliente",
  },
  {
    kind: "live",
    title: "Magazzino",
    subtitle: "Carico/scarico/trasferimenti",
    href: "/dashboard/magazzino",
    icon: Package,
    tag: "Live",
    color: "amber",
    visibleFor: (r) => r !== "cliente",
  },
  {
    kind: "live",
    title: "Clienti",
    subtitle: "Anagrafiche, note, storico",
    href: "/dashboard/clienti",
    icon: Users,
    tag: "Live",
    color: "blue",
    visibleFor: (r) => canAccessMarketingWeb(r),
  },
  {
    kind: "live",
    title: "Presenze",
    subtitle: "Riepilogo timbrature collaboratori",
    href: "/dashboard/presenze",
    icon: ClipboardList,
    tag: "Team",
    color: "cyan",
    visibleFor: (r) => r === "coordinator" || r === "reception",
  },
  {
    kind: "live",
    title: "WhatsApp manuale",
    subtitle: "Invio messaggi, storico e consensi (non un modulo campagne)",
    href: "/dashboard/marketing",
    icon: MessageCircle,
    tag: "Messaggi",
    color: "violet",
    visibleFor: (r) => canAccessMarketingWeb(r),
  },
  {
    kind: "live",
    title: "Report & KPI",
    subtitle: "Incassi, performance e stock",
    href: "/dashboard/report",
    icon: BarChart3,
    tag: "Analisi",
    color: "purple",
    visibleFor: (r) => r === "coordinator",
  },
  {
    kind: "live",
    title: "Impostazioni",
    subtitle: "Centro di controllo e personalizzazione",
    href: "/dashboard/impostazioni",
    icon: Settings,
    tag: "Sistema",
    color: "stone",
    visibleFor: (r) => r !== "cliente",
  },
];

type DashboardSearchParams = Record<string, string | string[] | undefined>;

/** Stessa logica di default del client (hub se presente, poi default, poi primo consentito). */
function pickKpiSalonForChooser(
  allowedSalonIds: number[],
  defaultSalonId: number | null | undefined,
): number | null {
  if (!allowedSalonIds.length) return null;
  if (allowedSalonIds.includes(MAGAZZINO_CENTRALE_ID)) return MAGAZZINO_CENTRALE_ID;
  if (defaultSalonId != null && allowedSalonIds.includes(defaultSalonId)) return defaultSalonId;
  return allowedSalonIds[0] ?? null;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<DashboardSearchParams>;
}) {
  const supabase = await createServerSupabase();
  
  // 1. Controllo Accesso e Salone Attivo
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const access = await getUserAccess();
  const sp = (await searchParams) ?? {};
  const rawSalon = sp.salon_id;
  const querySalon =
    typeof rawSalon === "string"
      ? Number(rawSalon)
      : Array.isArray(rawSalon)
        ? Number(rawSalon[0])
        : NaN;

  const baseKpiSalonId =
    access.staffSalonId ?? access.defaultSalonId ?? access.allowedSalonIds[0] ?? null;

  let activeSalonId: number | null;

  if (access.role === "coordinator" || access.role === "magazzino") {
    if (
      Number.isFinite(querySalon) &&
      querySalon > 0 &&
      access.allowedSalonIds.includes(querySalon)
    ) {
      activeSalonId = querySalon;
    } else {
      activeSalonId = pickKpiSalonForChooser(
        access.allowedSalonIds,
        access.defaultSalonId ?? null,
      );
    }
  } else {
    activeSalonId = baseKpiSalonId;
  }
  const activeSalonLabel =
    activeSalonId == null
      ? null
      : access.allowedSalons.find((s) => s.id === activeSalonId)?.name ??
        `Salone ${activeSalonId}`;

  // 2. Query Dati Reali (Filtrati per Salone se applicabile)
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const pad2 = (n: number) => String(n).padStart(2, "0");
  const toLocalDateTime = (d: Date) =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

  const startOfDayLocal = toLocalDateTime(startOfDay);
  const endOfDayLocal = toLocalDateTime(endOfDay);

  // Query 1: Incasso (solo completati del salone attivo)
  const incassoBaseQuery = supabase
    .from("sales")
    .select("total_amount")
    .eq("status", SALES_LEDGER_STATUS)
    .eq("operation_type", SALES_LEDGER_OPERATION_TYPE);

  let totaleIncasso = 0;
  let incassoUnavailable = false;
  try {
    let incassoQuery = incassoBaseQuery
      .gte("date", startOfDayLocal)
      .lt("date", endOfDayLocal);
    if (activeSalonId) incassoQuery = incassoQuery.eq("salon_id", activeSalonId);

    const { data: incassoData, error: incassoErr } = await incassoQuery;
    if (incassoErr) throw incassoErr;

    totaleIncasso = (incassoData ?? []).reduce(
      (acc, curr) => acc + (Number((curr as any)?.total_amount) || 0),
      0
    );
  } catch (e) {
    console.error("[dashboard] Incasso Giornaliero query error", e);
    incassoUnavailable = true;
  }

  // Query 2: Appuntamenti (Totali vs Completati)
  let totalApp = 0;
  let completedApp = 0;
  let agendaUnavailable = false;
  try {
    let appQuery = supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .gte("start_time", startOfDayLocal)
      .lt("start_time", endOfDayLocal);

    if (activeSalonId) appQuery = appQuery.eq("salon_id", activeSalonId);

    const { count: totalCount, error: totalErr } = await appQuery;
    if (totalErr) throw totalErr;
    totalApp = totalCount ?? 0;

    let compQuery = supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .gte("start_time", startOfDayLocal)
      .lt("start_time", endOfDayLocal)
      .eq("status", "done");

    if (activeSalonId) compQuery = compQuery.eq("salon_id", activeSalonId);

    const { count: doneCount, error: doneErr } = await compQuery;
    if (doneErr) throw doneErr;
    completedApp = doneCount ?? 0;
  } catch (e) {
    console.error("[dashboard] Stato Agenda query error", e);
    agendaUnavailable = true;
  }

  // Query 3: Magazzino (sottoscorta allineata al report prodotti: soglia per prodotto)
  let alertStock = 0;
  let stockUnavailable = false;
  try {
    if (!activeSalonId) {
      alertStock = 0;
    } else {
      const [{ data: productMeta, error: productErr }, { data: stockRows, error: stockErr }] =
        await Promise.all([
          supabase.from("products").select("id, low_stock").eq("active", true),
          supabase.from("product_stock").select("product_id, quantity").eq("salon_id", activeSalonId),
        ]);

      if (productErr) throw productErr;
      if (stockErr) throw stockErr;

      const minByProductId = new Map<number, number>();
      for (const row of productMeta ?? []) {
        const id = Number((row as any).id);
        if (!Number.isFinite(id) || id <= 0) continue;
        const min = Number((row as any).low_stock);
        minByProductId.set(id, Number.isFinite(min) ? Math.max(0, min) : 2);
      }

      let lowCount = 0;
      for (const row of stockRows ?? []) {
        const productId = Number((row as any).product_id);
        if (!Number.isFinite(productId) || productId <= 0) continue;
        const qty = Number((row as any).quantity);
        const minQty = minByProductId.get(productId) ?? 2;
        if ((Number.isFinite(qty) ? qty : 0) < minQty) lowCount += 1;
      }
      alertStock = lowCount;
    }
  } catch (e) {
    console.error("[dashboard] Alert Stock query error", e);
    stockUnavailable = true;
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 md:space-y-10 pb-12">

      {access.role === "coordinator" || access.role === "magazzino" ? (
        <Suspense fallback={null}>
          <DashboardSalonQuerySync />
        </Suspense>
      ) : null}

      {access.role === "cliente" ? (
        <section className="rounded-2xl border border-[#f3d8b6]/25 bg-[#f3d8b6]/10 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="text-sm text-[#f5e7d6]/95 leading-relaxed">
            <span className="font-bold text-[#f3d8b6]">Collega il tuo profilo cliente</span>
            {" — "}verifica l&apos;anagrafica con il codice del salone e un codice WhatsApp.
          </p>
          <Link
            href="/cliente/collega"
            className="shrink-0 inline-flex items-center justify-center rounded-xl bg-[#f3d8b6] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#1c0f0a] hover:brightness-110 transition"
          >
            Avvia collegamento
          </Link>
        </section>
      ) : null}
      
      {/* --- HEADER HERO --- */}
      <section className="relative overflow-hidden rounded-[2rem] border border-white/[0.08] bg-gradient-to-br from-[#2a1610]/75 via-[#24140e]/55 to-[#160a06]/80 p-8 md:p-10 shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_24px_56px_-28px_rgba(0,0,0,0.65)] ring-1 ring-white/[0.04]">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#f3d8b6]/10 border border-[#f3d8b6]/20 text-[#f3d8b6] text-[10px] font-bold tracking-[0.18em] uppercase">
              <Sparkles size={13} /> Sistema Gestionale v3
            </div>
            <h1 className="text-3xl md:text-[2.65rem] font-black text-[#f3d8b6] tracking-tight leading-[1.05]">
              Bentornato, <span className="text-white/95">Scaramuzzo</span>
            </h1>
            <p className="text-[#c9b299]/95 text-base md:text-lg max-w-xl leading-relaxed">
              Ecco cosa succede oggi nei tuoi saloni. Gestisci appuntamenti, 
              controlla lo stock e monitora le performance in tempo reale.
            </p>
            {activeSalonLabel && access.role !== "cliente" ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs font-bold text-white/70">
                KPI riferiti a:{" "}
                <span className="text-white/90">{activeSalonLabel}</span>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-4">
            {access.role !== "cliente" ? (
              <>
                <QuickActionButton
                  href="/dashboard/agenda"
                  label="Apri agenda"
                  icon={CalendarDays}
                  primary
                />
                <QuickActionButton
                  href="/dashboard/magazzino"
                  label="Carico Merce"
                  icon={Package}
                />
              </>
            ) : null}
          </div>
        </div>

        {/* Effetto luce soffusa */}
        <div className="absolute -top-20 -right-16 w-80 h-80 bg-[#f3d8b6]/8 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent pointer-events-none" />
      </section>

      {/* --- STATS GRID --- */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
        <StatCard 
          label="Incasso Giornaliero" 
          value={`€ ${totaleIncasso.toLocaleString('it-IT')}`} 
          description={incassoUnavailable ? "Dato non disponibile" : "Somma sales di oggi"} 
          trend={incassoUnavailable ? "neutral" : (totaleIncasso > 0 ? "up" : "neutral")} 
        />
        <StatCard 
          label="Stato Agenda" 
          value={`${completedApp || 0} / ${totalApp || 0}`} 
          description={
            agendaUnavailable
              ? "Dato non disponibile"
              : `${(totalApp || 0) - (completedApp || 0)} appuntamenti rimasti`
          } 
          trend="neutral"
          variant={completedApp === totalApp && totalApp !== 0 ? "default" : "default"}
        />
        <StatCard 
          label="Alert Stock" 
          value={String(alertStock || 0)} 
          description={
            stockUnavailable
              ? "Dato non disponibile"
              : "Referenze sotto la soglia minima (logica report)"
          } 
          trend={stockUnavailable ? "neutral" : (alertStock && alertStock > 0 ? "down" : "up")} 
          variant={stockUnavailable ? "default" : (alertStock && alertStock > 0 ? "warning" : "default")}
        />
      </section>

      {/* --- MODULES GRID --- */}
      {access.role !== "cliente" ? (
        <section className="space-y-5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xl md:text-2xl font-bold text-[#f3d8b6] tracking-tight">Moduli Operativi</h2>
          <div className="h-px flex-1 bg-gradient-to-r from-[#5c3a21]/40 via-white/[0.08] to-transparent mx-6 hidden md:block" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5">
          {HOME_MODULE_DEFS.filter((m) => m.visibleFor(access.role as StaffRole)).map(
            ({ visibleFor: _v, ...tile }) => (
              <ModuleCard key={tile.title} tile={tile} />
            ),
          )}
        </div>
      </section>
      ) : null}
    </div>
  );
}

// --- SOTTO-COMPONENTI ---

function QuickActionButton({ href, label, icon: Icon, primary = false }: { href: string; label: string; icon: any; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`
        flex items-center gap-3 rounded-xl px-5 py-3.5 text-sm font-bold transition-premium active:scale-[0.98]
        ${primary
          ? "bg-[#0FA958] text-white shadow-[0_8px_24px_-8px_rgba(15,169,88,0.45)] hover:bg-[#0da052]"
          : "bg-white/[0.04] border border-white/[0.1] text-[#f3d8b6] hover:bg-white/[0.08] hover:border-white/[0.14]"
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
    group relative h-full rounded-2xl p-6 md:p-7 overflow-hidden
    border border-white/[0.08] bg-gradient-to-br from-[#2a1610]/55 via-[#24140e]/40 to-[#160a06]/70
    shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_12px_36px_-20px_rgba(0,0,0,0.5)]
    transition-premium
    ${isLocked ? "opacity-60 cursor-not-allowed" : "hover:border-[#f3d8b6]/35 hover:-translate-y-1 hover:shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_18px_44px_-16px_rgba(0,0,0,0.55)]"}
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

      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#f3d8b6]/15 to-transparent" aria-hidden />

      <div className="space-y-5">
        {/* Icona Box */}
        <div className="inline-flex rounded-xl p-3.5 bg-white/[0.04] border border-white/[0.08] group-hover:border-[#f3d8b6]/30 group-hover:bg-white/[0.06] transition-premium">
          <Icon className="text-[#f3d8b6]/90 group-hover:text-[#f3d8b6]" size={28} strokeWidth={1.75} />
        </div>

        {/* Testi */}
        <div className="space-y-1.5">
          <h3 className="text-xl font-black text-[#f3d8b6] group-hover:text-white/95 transition-premium tracking-tight">
            {tile.title}
          </h3>
          <p className="text-[#c9b299]/90 text-sm leading-relaxed font-medium">
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
      <div className="absolute -bottom-10 -right-10 w-28 h-28 bg-[#f3d8b6]/4 blur-[50px] rounded-full group-hover:bg-[#f3d8b6]/8 transition-premium pointer-events-none" />
    </div>
  );

  if (tile.kind === "locked") return CardContent;
  return (
    <Link href={tile.href} className="block h-full group">
      {CardContent}
    </Link>
  );
}