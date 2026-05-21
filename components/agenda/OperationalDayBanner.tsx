"use client";

import type { SalonOperationalDay } from "@/lib/salonOperationalCalendar";
import {
  canSubmitNewBookingOnOperationalDay,
  operationalOpenExtraHint,
  SALON_CLOSED_UI_MESSAGE,
} from "@/lib/agenda/operationalAgendaUi";

type Props = {
  salonDay: SalonOperationalDay | null;
  className?: string;
};

/** Banner compatto per modali agenda / walk-in (nessun popup). */
export default function OperationalDayBanner({ salonDay, className = "" }: Props) {
  const closed = !canSubmitNewBookingOnOperationalDay(salonDay);
  const openHint = operationalOpenExtraHint(salonDay);

  if (!closed && !openHint) return null;

  return (
    <div className={`space-y-2 ${className}`.trim()}>
      {closed ? (
        <p className="rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200/95">
          {SALON_CLOSED_UI_MESSAGE}
        </p>
      ) : null}
      {openHint ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200/90">
          {openHint}
        </p>
      ) : null}
    </div>
  );
}
