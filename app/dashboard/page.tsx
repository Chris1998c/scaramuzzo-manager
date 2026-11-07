import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ComponentType } from "react";
import {
  CalendarDays,
  ClipboardList,
  Package,
  Users,
  BarChart3,
  Settings,
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
import { StatCard } from "@/components/dasboard/StatCard";

type StaffRole = "coordinator" | "reception" | "magazzino" | "cliente";

type Shortcut = {
  title: string;
  href: string;
  icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  hint: string;
  visibleFor: (role: StaffRole) => boolean;
  primary?: boolean;
};

/** Scorciatoie per l’apertura del salone — non ripete tutto il menu laterale. */
const OPENING_SHORTCUTS: Shortcut[] = [
  {
    title: "Agenda",
    href: "/dashboard/agenda",
    icon: CalendarDays,
    hint: "Appuntamenti di oggi",
    visibleFor: (r) => r !== "cliente",
    primary: true,
  },
  {
    title: "In sala",
    href: "/dashboard/in-sala",
    icon: UserSquare2,
    hint: "Servizi in corso e cassa",
    visibleFor: (r) => r !== "cliente",
    primary: true,
  },
  {
    title: "Magazzino",
    href: "/dashboard/magazzino",
    icon: Package,
    hint: "Giacenze e movimenti",
    visibleFor: (r) => r !== "cliente",
  },
  {
    title: "Clienti",
    href: "/dashboard/clienti",
    icon: Users,
    hint: "Anagrafiche",
    visibleFor: (r) => canAccessMarketingWeb(r),
  },
];

/** Link secondari: utili ma già in sidebar — una riga compatta, non card. */
const SECONDARY_LINKS: Shortcut[] = [
  {
    title: "Presenze",
    href: "/dashboard/presenze",
    icon: ClipboardList,
    hint: "",
    visibleFor: (r) => r === "coordinator" || r === "reception",
  },
  {
    title: "WhatsApp",
    href: "/dashboard/marketing",
    icon: MessageCircle,
    hint: "",
    visibleFor: (r) => canAccessMarketingWeb(r),
  },
  {
    title: "Report",
    href: "/dashboard/report",
    icon: BarChart3,
    hint: "",
    visibleFor: (r) => r === "coordinator",
  },
  {
    title: "Impostazioni",
    href: "/dashboard/impostazioni",
    icon: Settings,
    hint: "",
    visibleFor: (r) => r !== "cliente",
  },
];

type DashboardSearchParams = Record<string, string | string[] | undefined>;

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

  const {
    data: { user },
  } = await supabase.auth.getUser();
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
      : (access.allowedSalons.find((s) => s.id === activeSalonId)?.name ??
        `Salone ${activeSalonId}`);

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const pad2 = (n: number) => String(n).padStart(2, "0");
  const toLocalDateTime = (d: Date) =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

  const startOfDayLocal = toLocalDateTime(startOfDay);
  const endOfDayLocal = toLocalDateTime(endOfDay);

  const todayLabel = now.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const incassoBaseQuery = supabase
    .from("sales")
    .select("total_amount")
    .eq("status", SALES_LEDGER_STATUS)
    .eq("operation_type", SALES_LEDGER_OPERATION_TYPE);

  let totaleIncasso = 0;
  let incassoUnavailable = false;
  try {
    let incassoQuery = incassoBaseQuery.gte("date", startOfDayLocal).lt("date", endOfDayLocal);
    if (activeSalonId) incassoQuery = incassoQuery.eq("salon_id", activeSalonId);

    const { data: incassoData, error: incassoErr } = await incassoQuery;
    if (incassoErr) throw incassoErr;

    totaleIncasso = (incassoData ?? []).reduce(
      (acc, curr) => acc + (Number((curr as { total_amount?: unknown })?.total_amount) || 0),
      0,
    );
  } catch (e) {
    console.error("[dashboard] Incasso Giornaliero query error", e);
    incassoUnavailable = true;
  }

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
        const id = Number((row as { id?: unknown }).id);
        if (!Number.isFinite(id) || id <= 0) continue;
        const min = Number((row as { low_stock?: unknown }).low_stock);
        minByProductId.set(id, Number.isFinite(min) ? Math.max(0, min) : 2);
      }

      let lowCount = 0;
      for (const row of stockRows ?? []) {
        const productId = Number((row as { product_id?: unknown }).product_id);
        if (!Number.isFinite(productId) || productId <= 0) continue;
        const qty = Number((row as { quantity?: unknown }).quantity);
        const minQty = minByProductId.get(productId) ?? 2;
        if ((Number.isFinite(qty) ? qty : 0) < minQty) lowCount += 1;
      }
      alertStock = lowCount;
    }
  } catch (e) {
    console.error("[dashboard] Alert Stock query error", e);
    stockUnavailable = true;
  }

  const role = access.role as StaffRole;
  const opening = OPENING_SHORTCUTS.filter((s) => s.visibleFor(role));
  const secondary = SECONDARY_LINKS.filter((s) => s.visibleFor(role));

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 md:space-y-7 pb-10">
      {access.role === "coordinator" || access.role === "magazzino" ? (
        <Suspense fallback={null}>
          <DashboardSalonQuerySync />
        </Suspense>
      ) : null}

      {access.role === "cliente" ? (
        <section className="rounded-xl border border-[#f3d8b6]/20 bg-[#f3d8b6]/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-[#f5e7d6]/95 leading-relaxed">
            <span className="font-semibold text-[#f3d8b6]">Collega il tuo profilo cliente</span>
            {" — "}
            verifica l&apos;anagrafica con il codice del salone e un codice WhatsApp.
          </p>
          <Link
            href="/cliente/collega"
            className="shrink-0 inline-flex items-center justify-center rounded-lg bg-[#f3d8b6] px-4 py-2 text-sm font-semibold text-[#1c0f0a] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6] transition"
          >
            Avvia collegamento
          </Link>
        </section>
      ) : null}

      {/* Intestazione sobria */}
      <section className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 px-0.5">
        <div className="min-w-0">
          <p className="text-sm text-white/50 capitalize">{todayLabel}</p>
          <h1 className="text-xl md:text-2xl font-semibold text-[#f3d8b6] tracking-tight">
            Oggi
            {activeSalonLabel && access.role !== "cliente" ? (
              <span className="text-white/50 font-normal"> · {activeSalonLabel}</span>
            ) : null}
          </h1>
        </div>
      </section>

      {/* KPI */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        <StatCard
          label="Incasso di oggi"
          value={`€ ${totaleIncasso.toLocaleString("it-IT")}`}
          description={incassoUnavailable ? "Dato non disponibile" : "Vendite registrate"}
          trend={incassoUnavailable ? "neutral" : totaleIncasso > 0 ? "up" : "neutral"}
        />
        <StatCard
          label="Agenda"
          value={`${completedApp || 0} / ${totalApp || 0}`}
          description={
            agendaUnavailable
              ? "Dato non disponibile"
              : `${(totalApp || 0) - (completedApp || 0)} ancora da fare`
          }
          trend="neutral"
        />
        <StatCard
          label="Sottoscorta"
          value={String(alertStock || 0)}
          description={
            stockUnavailable ? "Dato non disponibile" : "Referenze sotto soglia"
          }
          trend={stockUnavailable ? "neutral" : alertStock && alertStock > 0 ? "down" : "up"}
          variant={stockUnavailable ? "default" : alertStock && alertStock > 0 ? "warning" : "default"}
        />
      </section>

      {/* Scorciatoie apertura */}
      {access.role !== "cliente" ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-white/50 px-0.5">Apri il salone</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
            {opening.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "group flex items-center gap-3 rounded-xl px-3.5 py-3 border transition-premium",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6]/50",
                    item.primary
                      ? "border-[#f3d8b6]/25 bg-[#f3d8b6]/10 hover:bg-[#f3d8b6]/14"
                      : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.12]",
                  ].join(" ")}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-black/25 text-[#f3d8b6] shrink-0">
                    <Icon size={18} strokeWidth={1.85} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[#f3d8b6] truncate">
                      {item.title}
                    </span>
                    {item.hint ? (
                      <span className="block text-xs text-white/45 truncate">{item.hint}</span>
                    ) : null}
                  </span>
                </Link>
              );
            })}
          </div>

          {secondary.length > 0 ? (
            <nav
              className="flex flex-wrap items-center gap-x-1 gap-y-1 pt-1 px-0.5"
              aria-label="Altre sezioni"
            >
              {secondary.map((item, idx) => (
                <span key={item.href} className="inline-flex items-center">
                  {idx > 0 ? (
                    <span className="mx-2 text-white/20" aria-hidden>
                      ·
                    </span>
                  ) : null}
                  <Link
                    href={item.href}
                    className="text-sm text-white/50 hover:text-[#f3d8b6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6]/50 rounded px-0.5 transition"
                  >
                    {item.title}
                  </Link>
                </span>
              ))}
            </nav>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
