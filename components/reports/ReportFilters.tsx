"use client";

import { useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type StaffOption = { id: number; name: string };

type Props = {
  salonId: number;
  dateFrom: string;
  dateTo: string;
  staffId: number | null;
  paymentMethod: string | null;
  itemType: string | null;
  staffOptions: StaffOption[];
};

export default function ReportFilters({
  salonId,
  dateFrom,
  dateTo,
  staffId,
  paymentMethod,
  itemType,
  staffOptions,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function go(params: URLSearchParams, mode: "push" | "replace" = "push") {
    const url = `/dashboard/report?${params.toString()}`;
    startTransition(() => {
      if (mode === "replace") router.replace(url);
      else router.push(url);
      router.refresh(); // 🔥 forza server re-render con nuovi searchParams
    });
  }

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("salon_id", String(salonId));

    if (!value) params.delete(key);
    else params.set(key, value);

    go(params, "push");
  }

  // 🔥 quando cambia il salone globale: scrivi salon_id nuovo, reset staff_id, refresh server
  useEffect(() => {
    if (!salonId || salonId <= 0) return;

    const params = new URLSearchParams(searchParams.toString());
    const currentSalon = params.get("salon_id");

    if (currentSalon !== String(salonId)) {
      params.set("salon_id", String(salonId));
      params.delete("staff_id"); // reset filtro staff quando cambi salone
      go(params, "replace");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonId]);

  function exportPdf() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("salon_id", String(salonId));
    window.open(`/api/reports/export/pdf?${params.toString()}`, "_blank");
  }

  function exportCsv() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("salon_id", String(salonId));
    window.open(`/api/reports/export/csv?${params.toString()}`, "_blank");
  }

  return (
    <div className="bg-scz-dark border border-white/10 rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-white/40 font-black">
            REPORT ENTERPRISE
          </div>
          <div className="text-xl font-extrabold text-scz-gold">
            Vendite & Performance
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={exportPdf} className="px-4 py-2 rounded-xl bg-black/30 border border-white/10 font-bold">
            PDF
          </button>
          <button onClick={exportCsv} className="px-4 py-2 rounded-xl bg-black/30 border border-white/10 font-bold">
            CSV
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-5 gap-4">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => updateParam("date_from", e.target.value)}
          className="px-3 py-2 rounded-xl bg-black/30 border border-white/10"
        />

        <input
          type="date"
          value={dateTo}
          onChange={(e) => updateParam("date_to", e.target.value)}
          className="px-3 py-2 rounded-xl bg-black/30 border border-white/10"
        />

        <select
          value={staffId ?? ""}
          onChange={(e) => updateParam("staff_id", e.target.value || null)}
          className="px-3 py-2 rounded-xl bg-black/30 border border-white/10"
        >
          <option value="">Tutti Staff</option>
          {staffOptions.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          value={paymentMethod ?? ""}
          onChange={(e) => updateParam("payment_method", e.target.value || null)}
          className="px-3 py-2 rounded-xl bg-black/30 border border-white/10"
        >
          <option value="">Pagamento</option>
          <option value="cash">Contanti</option>
          <option value="card">Carta</option>
        </select>

        <select
          value={itemType ?? ""}
          onChange={(e) => updateParam("item_type", e.target.value || null)}
          className="px-3 py-2 rounded-xl bg-black/30 border border-white/10"
        >
          <option value="">Tipo</option>
          <option value="service">Servizi</option>
          <option value="product">Prodotti</option>
        </select>
      </div>

      {isPending && <div className="text-xs text-white/40">Aggiornamento report...</div>}
    </div>
  );
}