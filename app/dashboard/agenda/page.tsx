"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Users } from "lucide-react";

import AgendaGrid from "@/components/agenda/AgendaGrid";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";

function toYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function AgendaPage() {
  return (
    <Suspense fallback={<AgendaPageSkeleton />}>
      <AgendaPageInner />
    </Suspense>
  );
}

function AgendaPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const { isReady } = useActiveSalon();

  const today = toYmd(new Date());
  const spDate = sp.get("date");
  const currentDate = spDate && /^\d{4}-\d{2}-\d{2}$/.test(spDate) ? spDate : today;
  const highlightAppointmentId = sp.get("highlight") ?? null;

  function clearHighlightParam() {
    if (!highlightAppointmentId) return;
    const params = new URLSearchParams(sp.toString());
    params.delete("highlight");
    const qs = params.toString();
    router.replace(qs ? `/dashboard/agenda?${qs}` : "/dashboard/agenda", { scroll: false });
  }

  if (!isReady) return <AgendaPageSkeleton />;

  return (
    <div className="w-full h-screen flex flex-col gap-2 overflow-hidden pb-2 pt-0">
      {/* Sede: solo SalonSwitcher in header — evita doppio selettore */}
      <div className="shrink-0 rounded-xl border border-white/10 bg-scz-dark/95 px-2 py-1.5 md:px-3 md:py-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => router.push("/dashboard/in-sala")}
          className="h-8 px-3 rounded-lg border border-emerald-500/35 bg-emerald-500/10 text-emerald-300/95 font-bold text-[10px] uppercase tracking-wide hover:bg-emerald-500/18 transition-colors inline-flex items-center gap-1.5"
        >
          <Users size={13} />
          In sala
        </button>
      </div>

      <div className="flex-1 min-h-0 rounded-lg border border-white/10 bg-scz-darker/50 overflow-hidden">
        <AgendaGrid
          currentDate={currentDate}
          highlightAppointmentId={highlightAppointmentId}
          onHighlightHandled={clearHighlightParam}
        />
      </div>
    </div>
  );
}

function AgendaPageSkeleton() {
  return (
    <div className="w-full h-screen flex flex-col gap-2 animate-pulse overflow-hidden pb-2">
      <div className="h-11 rounded-xl bg-scz-dark border border-white/10 shrink-0" />
      <div className="flex-1 min-h-0 rounded-lg bg-scz-darker/50 border border-white/10" />
    </div>
  );
}
