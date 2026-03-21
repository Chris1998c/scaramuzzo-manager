"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Package,
  Palette,
  Pencil,
  Plus,
  Receipt,
  Scissors,
  UserCog,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabaseClient";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import type { ServiceSettingsRow } from "@/lib/servicesCatalog";
import ServiceModal from "@/components/settings/ServiceModal";

type SectionKey =
  | "servizi"
  | "prodotti"
  | "collaboratori"
  | "clienti"
  | "fiscale"
  | "aspetto"
  | "saloni";

const SECTIONS: Array<{
  key: SectionKey;
  label: string;
  hint: string;
  icon: typeof Scissors;
  ready: boolean;
}> = [
  {
    key: "servizi",
    label: "Servizi e prezzi",
    hint: "Catalogo, listini per salone, visibilità agenda e cassa",
    icon: Scissors,
    ready: true,
  },
  {
    key: "prodotti",
    label: "Prodotti",
    hint: "Catalogo retail e collegamenti magazzino",
    icon: Package,
    ready: false,
  },
  {
    key: "collaboratori",
    label: "Collaboratori",
    hint: "Staff, ruoli e permessi",
    icon: UserCog,
    ready: false,
  },
  {
    key: "clienti",
    label: "Clienti",
    hint: "Privacy, campi anagrafica e comunicazioni",
    icon: Users,
    ready: false,
  },
  {
    key: "fiscale",
    label: "Fiscale e stampante",
    hint: "Registratore, bridge e stampanti di servizio",
    icon: Receipt,
    ready: false,
  },
  {
    key: "aspetto",
    label: "Aspetto",
    hint: "Tema, loghi e personalizzazione UI",
    icon: Palette,
    ready: false,
  },
  {
    key: "saloni",
    label: "Saloni",
    hint: "Unità operative, orari e parametri per sede",
    icon: Building2,
    ready: false,
  },
];

type CategoryOption = { id: number; name: string };

type Props = {
  initialServices: ServiceSettingsRow[];
  initialSalonId: number | null;
  initialSalonLabel: string | null;
  categories: CategoryOption[];
  canManageServices: boolean;
};

export default function ImpostazioniShell({
  initialServices,
  initialSalonId,
  initialSalonLabel,
  categories,
  canManageServices,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { activeSalonId, isReady, allowedSalons } = useActiveSalon();
  const [section, setSection] = useState<SectionKey>("servizi");
  const [rows, setRows] = useState<ServiceSettingsRow[]>(initialServices);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [modalRow, setModalRow] = useState<ServiceSettingsRow | null>(null);

  useEffect(() => {
    setRows(initialServices);
  }, [initialServices]);

  useEffect(() => {
    if (!isReady) return;

    async function syncPrices() {
      const sid = activeSalonId;
      if (!sid) {
        setRows((prev) => prev.map((r) => ({ ...r, price: 0 })));
        return;
      }

      if (sid === initialSalonId) {
        setRows(initialServices);
        return;
      }

      const ids = initialServices.map((s) => s.id);
      if (ids.length === 0) return;

      const { data, error } = await supabase
        .from("service_prices")
        .select("service_id, price")
        .eq("salon_id", sid)
        .in("service_id", ids);

      if (error) {
        console.error("Impostazioni: sync prezzi", error);
        return;
      }

      const map = new Map<number, number>();
      (data ?? []).forEach((p: { service_id: number; price: number }) => {
        map.set(Number(p.service_id), Number(p.price) || 0);
      });

      setRows(
        initialServices.map((s) => ({
          ...s,
          price: map.get(s.id) ?? 0,
        })),
      );
    }

    void syncPrices();
  }, [isReady, activeSalonId, initialSalonId, initialServices, supabase]);

  const salonLabel = useMemo(() => {
    if (activeSalonId == null) return initialSalonLabel;
    const hit = allowedSalons.find((s) => s.id === activeSalonId);
    return hit?.name ?? initialSalonLabel;
  }, [activeSalonId, allowedSalons, initialSalonLabel]);

  const effectiveSalonId = activeSalonId ?? initialSalonId ?? null;

  function openCreate() {
    setModalMode("create");
    setModalRow(null);
    setModalOpen(true);
  }

  function openEdit(row: ServiceSettingsRow) {
    setModalMode("edit");
    setModalRow(row);
    setModalOpen(true);
  }

  function handleSaved() {
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <nav className="w-full shrink-0 lg:w-72 space-y-1">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const active = section === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setSection(s.key)}
              className={[
                "w-full text-left rounded-2xl px-4 py-3 transition border flex gap-3",
                active
                  ? "bg-[#f3d8b6]/10 border-[#f3d8b6]/35 text-white shadow-[0_8px_30px_rgba(0,0,0,0.25)]"
                  : "border-transparent text-[#c9b299] hover:bg-white/5 hover:border-white/10",
              ].join(" ")}
            >
              <Icon
                size={20}
                className={active ? "text-[#f3d8b6]" : "text-[#f3d8b6]/60 shrink-0 mt-0.5"}
              />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-[#f3d8b6]">{s.label}</span>
                <span className="block text-xs text-[#c9b299]/90 mt-0.5 leading-snug">{s.hint}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="min-w-0 flex-1 rounded-[2rem] border border-[#5c3a21]/50 bg-[#24140e]/70 backdrop-blur-md p-6 md:p-8 shadow-2xl">
        {section !== "servizi" ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 px-6 py-12 text-center">
            <p className="text-lg font-bold text-[#f3d8b6]">Sezione in arrivo</p>
            <p className="mt-2 text-sm text-[#c9b299] max-w-md mx-auto leading-relaxed">
              Struttura pronta: qui verranno collegati i flussi reali (database e permessi) senza
              stravolgere questa impalcatura.
            </p>
          </div>
        ) : (
          <ServiziPrezziPanel
            rows={rows}
            salonLabel={salonLabel}
            canManageServices={canManageServices}
            onCreate={openCreate}
            onEdit={openEdit}
          />
        )}
      </div>

      <ServiceModal
        open={modalOpen}
        mode={modalMode}
        row={modalRow}
        categories={categories}
        salonId={effectiveSalonId}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}

function ServiziPrezziPanel({
  rows,
  salonLabel,
  canManageServices,
  onCreate,
  onEdit,
}: {
  rows: ServiceSettingsRow[];
  salonLabel: string | null;
  canManageServices: boolean;
  onCreate: () => void;
  onEdit: (row: ServiceSettingsRow) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 text-sm text-[#c9b299]">
        <span className="font-bold text-emerald-300/95">Listino salone</span>
        <span className="mx-2 text-white/25">·</span>
        Prezzi da <code className="text-[#f3d8b6]/90">service_prices</code> per il salone attivo
        {salonLabel ? (
          <>
            {" "}
            (<span className="text-[#f3d8b6] font-semibold">{salonLabel}</span>)
          </>
        ) : null}
        . Cambiando salone dall&apos;header, i prezzi si aggiornano automaticamente.
      </div>

      {!canManageServices ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-100/90">
          Modalità sola lettura: la modifica del catalogo servizi è riservata al ruolo{" "}
          <strong>coordinator</strong>.
        </div>
      ) : null}

      {canManageServices ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#0FA958] px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-emerald-900/25 hover:bg-[#0da052]"
          >
            <Plus size={18} />
            Nuovo servizio
          </button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-[#c9b299] text-sm">Nessun servizio in anagrafica.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#5c3a21]/40">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="bg-black/30 text-[10px] font-black uppercase tracking-[0.2em] text-[#c9b299]/80">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Durata</th>
                <th className="px-4 py-3">Stato</th>
                <th className="px-4 py-3">Agenda</th>
                <th className="px-4 py-3">Cassa</th>
                <th className="px-4 py-3 text-right">Prezzo (salone)</th>
                {canManageServices ? <th className="px-4 py-3 text-right w-28">Azioni</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#5c3a21]/30">
              {rows.map((r) => (
                <tr key={r.id} className="text-[#e8dcc8] hover:bg-white/[0.03]">
                  <td className="px-4 py-3 font-semibold text-[#f3d8b6]">{r.name}</td>
                  <td className="px-4 py-3 text-[#c9b299]">{r.category_name ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {r.duration != null ? `${r.duration} min` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={[
                        "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold border",
                        r.active
                          ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300"
                          : "border-white/10 bg-black/25 text-[#c9b299]/70",
                      ].join(" ")}
                    >
                      {r.active ? "Attivo" : "Disattivo"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <VisPill ok={!!r.visible_in_agenda} />
                  </td>
                  <td className="px-4 py-3">
                    <VisPill ok={!!r.visible_in_cash} />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-[#f3d8b6]">
                    €{" "}
                    {r.price.toLocaleString("it-IT", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  {canManageServices ? (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onEdit(r)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#5c3a21]/50 bg-black/20 px-3 py-1.5 text-xs font-bold text-[#f3d8b6] hover:bg-white/10"
                      >
                        <Pencil size={14} />
                        Modifica
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function VisPill({ ok }: { ok: boolean }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold border",
        ok
          ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300"
          : "border-white/10 bg-black/25 text-[#c9b299]/70",
      ].join(" ")}
    >
      {ok ? "Sì" : "No"}
    </span>
  );
}
