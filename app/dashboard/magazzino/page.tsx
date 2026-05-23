"use client";

import { useMemo } from "react";
import { createClient } from "@/lib/supabaseClient";
import {
  ArrowDown,
  ArrowUp,
  Zap,
  Repeat,
  History,
  LayoutList,
  Package,
  Plus,
} from "lucide-react";
import { useMagazzinoSalonContext } from "@/hooks/useMagazzinoSalonContext";
import { useMagazzinoHubKpis } from "@/hooks/useMagazzinoHubKpis";
import { MAGAZZINO_CENTRALE_ID } from "@/lib/constants";
import { formatMagazzinoCurrency } from "@/lib/magazzino/magazzinoUi";
import {
  MagazzinoAlertBanner,
  MagazzinoHero,
  MagazzinoKpiCard,
  MagazzinoKpiRow,
  MagazzinoLoading,
  MagazzinoNavCard,
  MagazzinoPageShell,
  MagazzinoSalonContextBar,
} from "@/components/magazzino/ui/magazzinoUi";

export default function MagazzinoPage() {
  const supabase = useMemo(() => createClient(), []);
  const ctx = useMagazzinoSalonContext();
  const kpis = useMagazzinoHubKpis(supabase, ctx.ctxSalonId, ctx.isReady);

  const canCreateProduct =
    ctx.isWarehouse ||
    (ctx.isReception &&
      ctx.receptionSalonId != null &&
      ctx.receptionSalonId < MAGAZZINO_CENTRALE_ID);

  if (!ctx.isReady) {
    return <MagazzinoLoading />;
  }

  const kpiValue = (n: number | null) =>
    kpis.loading ? "…" : kpis.unavailable || n == null ? "—" : String(n);

  const stockValueLabel =
    kpis.loading || kpis.unavailable || kpis.stockValueEstimate == null
      ? "…"
      : formatMagazzinoCurrency(kpis.stockValueEstimate);

  const salonHint = ctx.isWarehouse
    ? "Cambia salone dallo switcher in alto."
    : "Operazioni sul tuo salone reception.";

  return (
    <MagazzinoPageShell>
      <MagazzinoHero
        eyebrow="Modulo"
        title="Magazzino"
        icon={Package}
        compact
        subtitle={
          <>
            Operazioni per{" "}
            <span className="font-semibold text-white/90">{ctx.contextLabel}</span>
          </>
        }
      />

      <MagazzinoSalonContextBar
        contextLabel={ctx.contextLabel}
        contextKind={ctx.contextKind}
        hint={salonHint}
      />

      {ctx.showMissingSalonBanner && (
        <MagazzinoAlertBanner title="Questo utente non ha un salone associato">
          Contatta l&apos;amministratore per assegnare il salone all&apos;account reception.
        </MagazzinoAlertBanner>
      )}

      <MagazzinoKpiRow>
        <MagazzinoKpiCard
          label="Valore stock stimato"
          value={stockValueLabel}
          hint="Σ giacenza × costo"
        />
        <MagazzinoKpiCard
          label="Sottoscorta"
          value={kpiValue(kpis.sottoscortaCount)}
          tone={(kpis.sottoscortaCount ?? 0) > 0 ? "err" : "ok"}
          hint="≤ 5 unità"
        />
        <MagazzinoKpiCard
          label="Movimenti oggi"
          value={kpiValue(kpis.movementsToday)}
        />
        <MagazzinoKpiCard
          label="Trasferimenti (7 gg)"
          value={kpiValue(kpis.transfersRecent)}
        />
      </MagazzinoKpiRow>

      {canCreateProduct && (
        <MagazzinoNavCard
          href="/dashboard/magazzino/nuovo-prodotto"
          icon={Plus}
          title="Nuovo prodotto"
          subtitle="Crea articolo con giacenza iniziale opzionale"
          accent="primary"
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <MagazzinoNavCard
          href="/dashboard/magazzino/carico"
          icon={ArrowDown}
          title="Carico"
          subtitle="Ingresso merce in salone"
        />
        <MagazzinoNavCard
          href="/dashboard/magazzino/scarico"
          icon={ArrowUp}
          title="Scarico"
          subtitle="Uscita merce da giacenza"
        />
        <MagazzinoNavCard
          href="/dashboard/magazzino/rapida"
          icon={Zap}
          title="Scarico rapido"
          subtitle="−1 unità con ricerca barcode"
        />
        <MagazzinoNavCard
          href="/dashboard/magazzino/trasferimenti"
          icon={Repeat}
          title="Trasferimenti"
          subtitle="Sposta stock tra saloni"
        />
        <MagazzinoNavCard
          href="/dashboard/magazzino/inventario"
          icon={LayoutList}
          title="Inventario"
          subtitle={`${kpiValue(kpis.totalProducts)} prodotti (filtri attivi)`}
        />
        <MagazzinoNavCard
          href="/dashboard/magazzino/movimenti"
          icon={History}
          title="Movimenti"
          subtitle="Audit ledger paginato"
        />
      </div>
    </MagazzinoPageShell>
  );
}
