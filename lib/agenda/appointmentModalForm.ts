import { SLOT_MINUTES } from "@/components/agenda/utils";

export type AgendaServiceCatalogRow = {
  id: number;
  name?: string | null;
  duration?: number | null;
};

export type ServiceTimelineItem = {
  id: number;
  name: string | undefined;
  duration: number;
  startTime: string;
};

/** Allinea orario slot griglia alla lista slot disponibili (step 15m). */
export function resolveGridStartTime(slotTime: string, agendaHours: string[]): string {
  const t = String(slotTime ?? "").trim();
  if (!agendaHours.length) return t;
  return agendaHours.includes(t) ? t : agendaHours[0] ?? t;
}

/** Timeline servizi sequenziale da start_time + durate catalogo (source of truth UI create). */
export function buildSequentialServiceTimeline(args: {
  currentDate: string;
  startTime: string;
  serviceIds: number[];
  services: AgendaServiceCatalogRow[];
  slotMinutes?: number;
}): ServiceTimelineItem[] {
  const step = args.slotMinutes ?? SLOT_MINUTES;
  const start = String(args.startTime ?? "").trim();
  if (!start || !args.serviceIds.length) return [];

  let cursor = new Date(`${args.currentDate}T${start}:00`);

  return args.serviceIds.map((sid) => {
    const s = args.services.find((x) => x.id === sid);
    const duration = Math.max(step, Number(s?.duration ?? step));

    const item: ServiceTimelineItem = {
      id: sid,
      name: s?.name ?? undefined,
      duration,
      startTime: cursor.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    cursor = new Date(cursor.getTime() + duration * 60_000);
    return item;
  });
}

export function totalTimelineMinutes(items: ServiceTimelineItem[]): number {
  return items.reduce((acc, s) => acc + s.duration, 0);
}

export function filterServicesByQuery<T extends { name?: string | null }>(
  services: T[],
  rawQuery: string,
): T[] {
  const q = String(rawQuery ?? "").toLowerCase().trim();
  if (!q) return services;
  return services.filter((s) =>
    String(s.name ?? "")
      .toLowerCase()
      .includes(q),
  );
}

export function toStrOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

export function numOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
