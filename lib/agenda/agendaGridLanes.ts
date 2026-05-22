import { SLOT_MINUTES } from "@/components/agenda/utils";

export type AgendaLanePair = { app: unknown; line: unknown };

export type AgendaLaidOutLine = {
  app: unknown;
  line: unknown;
  laneIndex: number;
  laneCount: number;
};

function minutesFromTimeStr(ts: string): number {
  const raw = String(ts || "");
  const timePart = raw.includes("T") ? raw.split("T")[1] : raw.split(" ")[1];
  const time = timePart || "00:00:00";
  const [hh, mm] = time.split(":").map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

/**
 * Collision / stacking engine (estratto da AgendaGrid, stesso comportamento visivo).
 */
export function buildAgendaLanes(
  pairs: AgendaLanePair[],
  slotPx: number,
): AgendaLaidOutLine[] {
  if (!pairs.length) return [];

  const base: AgendaLaidOutLine[] = pairs.map((p) => ({
    app: p.app,
    line: p.line,
    laneIndex: 0,
    laneCount: 1,
  }));

  const items = pairs
    .map((p, idx) => {
      const start = minutesFromTimeStr(String((p.line as { start_time?: string })?.start_time ?? ""));

      const raw =
        Number(
          (p.line as { duration_minutes?: number })?.duration_minutes ??
            (p.line as { services?: { duration?: number } })?.services?.duration ??
            SLOT_MINUTES,
        ) || SLOT_MINUTES;

      const MIN_HEIGHT_PX = Math.max(56, slotPx * 1.35);
      const minSlots = Math.ceil(MIN_HEIGHT_PX / slotPx);
      const minDur = minSlots * SLOT_MINUTES;

      const duration = Math.max(raw, minDur);
      const end = start + duration;

      return { idx, start, end };
    })
    .sort((a, b) => a.start - b.start);

  type Active = { idx: number; end: number; lane: number };
  const active: Active[] = [];
  let currentMaxLanes = 1;

  for (const item of items) {
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].end <= item.start) active.splice(i, 1);
    }

    if (active.length === 0) {
      currentMaxLanes = 1;
    }

    let lane = 0;
    const used = new Set(active.map((a) => a.lane));
    while (used.has(lane)) lane++;

    active.push({ idx: item.idx, end: item.end, lane });

    currentMaxLanes = Math.max(
      currentMaxLanes,
      Math.max(...active.map((a) => a.lane)) + 1,
    );

    base[item.idx].laneIndex = lane;
    base[item.idx].laneCount = currentMaxLanes;

    for (const a of active) {
      base[a.idx].laneCount = currentMaxLanes;
    }
  }

  return base;
}
