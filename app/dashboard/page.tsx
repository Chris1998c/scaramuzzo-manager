import Link from "next/link";
import { createServerSupabase } from "@/lib/supabaseServer";
import { redirect } from "next/navigation";
import {
  CalendarDays,
  Package,
  Users,
  BarChart3,
  Settings,
  Sparkles,
  Lock,
} from "lucide-react";

type LiveTile = {
  kind: "live";
  title: string;
  subtitle: string;
  href: string;
  icon: any;
  tag?: "Live";
};

type LockedTile = {
  kind: "locked";
  title: string;
  subtitle: string;
  icon: any;
  tag?: "In arrivo";
};

type Tile = LiveTile | LockedTile;

const MODULES: Tile[] = [
  {
    kind: "live",
    title: "Agenda",
    subtitle: "Appuntamenti, staff, servizi",
    href: "/dashboard/agenda",
    icon: CalendarDays,
    tag: "Live",
  },
  {
    kind: "live",
    title: "Magazzino",
    subtitle: "Carico/scarico/trasferimenti",
    href: "/dashboard/magazzino",
    icon: Package,
    tag: "Live",
  },
  {
    kind: "locked",
    title: "Clienti",
    subtitle: "Anagrafiche, note, storico",
    icon: Users,
    tag: "In arrivo",
  },
  {
    kind: "locked",
    title: "Report",
    subtitle: "Incassi, KPI, performance",
    icon: BarChart3,
    tag: "In arrivo",
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="space-y-8">
      {/* HERO */}
      <div className="rounded-3xl border border-[#5c3a21]/50 bg-[#24140e]/60 p-6 md:p-8 backdrop-blur-md shadow-[0_0_60px_rgba(0,0,0,0.25)]">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-extrabold text-[#f3d8b6] tracking-tight">
              Dashboard operativa
            </h1>
            <p className="text-[#c9b299] mt-2 max-w-2xl">
              Pochi pulsanti, zero confusione: entri nei <b>moduli</b> e dentro trovi tutte le funzioni.
              Magazzino Centrale (5) è reale: carichi dal laboratorio e trasferisci ai saloni.
            </p>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-[#f3d8b6]/70">
            <span className="px-3 py-1 rounded-full border border-[#5c3a21]/60 bg-black/20">
              Scaramuzzo Manager
            </span>
          </div>
        </div>

        {/* QUICK ACTIONS */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <QuickAction href="/dashboard/agenda" label="Apri Agenda" icon={CalendarDays} />
          <QuickAction href="/dashboard/magazzino" label="Apri Magazzino" icon={Package} />
          <div className="flex-1" />
          <div className="hidden md:flex items-center gap-2 text-xs text-[#c9b299]">
            <Sparkles size={14} className="opacity-80" />
            Semplice, intuitivo, senza duplicati
          </div>
        </div>
      </div>

      {/* MODULES GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 md:gap-6">
        {MODULES.map((m) => (
          <ModuleCard key={m.title} tile={m} />
        ))}
      </div>
    </div>
  );
}

function QuickAction({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: any;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-3 rounded-2xl px-5 py-3
        bg-[#0FA958] text-white font-semibold
        shadow-[0_10px_35px_rgba(15,169,88,0.25)]
        hover:scale-[1.02] transition"
    >
      <Icon size={18} />
      {label}
    </Link>
  );
}

function ModuleCard({ tile }: { tile: Tile }) {
  const Icon = tile.icon;
  const locked = tile.kind === "locked";

  const content = (
    <div
      className={[
        "relative rounded-3xl p-6 md:p-7",
        "bg-[#24140e]/70 border border-[#5c3a21]/60 backdrop-blur-md",
        "shadow-[0_0_40px_rgba(0,0,0,0.18)]",
        locked
          ? "opacity-70 cursor-not-allowed"
          : "hover:border-[var(--accent)] hover:shadow-[0_0_55px_rgba(216,177,138,0.22)] hover:-translate-y-0.5 transition",
      ].join(" ")}
    >
      {/* TAG */}
      {"tag" in tile && tile.tag && (
        <div className="absolute top-4 right-4 text-xs">
          <span
            className={[
              "px-3 py-1 rounded-full border",
              tile.kind === "live"
                ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                : "border-[#5c3a21]/60 bg-black/20 text-[#f3d8b6]/70",
            ].join(" ")}
          >
            {tile.tag}
          </span>
        </div>
      )}

      <div className="flex items-start gap-4">
        <div className="shrink-0 rounded-2xl p-3 bg-black/20 border border-[#5c3a21]/60">
          <Icon className="text-[#f3d8b6]" size={26} strokeWidth={1.7} />
        </div>

        <div className="min-w-0">
          <h3 className="text-xl font-extrabold text-[#f3d8b6] tracking-tight">
            {tile.title}
          </h3>
          <p className="text-[#c9b299] mt-1">{tile.subtitle}</p>

          {locked && (
            <div className="mt-4 inline-flex items-center gap-2 text-xs text-[#f3d8b6]/60">
              <Lock size={14} />
              Sezione in arrivo
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (tile.kind === "locked") return content;
  return <Link href={tile.href}>{content}</Link>;
}
