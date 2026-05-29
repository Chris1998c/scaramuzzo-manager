import { SLOT_MINUTES } from "@/components/agenda/utils";
import type { AgendaAppointment, AgendaServiceLine } from "@/lib/agenda/agendaContract";
import {
  agendaMinutesFromStartTime,
  resolveAgendaLineDurationMinutes,
} from "@/lib/agenda/agendaBoxLayout";

export type AgendaLanePair = {
  app: Pick<AgendaAppointment, "appointment_services">;
  line: Pick<AgendaServiceLine, "start_time" | "duration_minutes" | "services">;
};

export type AgendaLaidOutLine = {
  app: AgendaLanePair["app"];
  line: AgendaLanePair["line"];
  laneIndex: number;
  laneCount: number;
};

type LaneInterval = {
  idx: number;
  start: number;
  end: number;
};

/** [start, end) si sovrappongono */
export function agendaIntervalsOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end;
}

function resolvePairIntervalMinutes(
  pair: AgendaLanePair,
  slotPx: number,
): LaneInterval {
  const start = agendaMinutesFromStartTime(pair.line.start_time);
  const duration = resolveAgendaLineDurationMinutes(pair.line, pair.app);
  const minCardDur =
    Math.ceil(Math.max(56, slotPx * 1.35) / slotPx) * SLOT_MINUTES;
  const dur = Math.max(duration, minCardDur);
  return { start, end: start + dur, idx: 0 };
}

/** Allinea laneCount nel cluster di overlap (greedy può lasciare count=1 su righe già affiancate). */
export function finalizeAgendaLaneCounts(
  laid: AgendaLaidOutLine[],
  intervals: LaneInterval[],
): void {
  const n = intervals.length;
  if (n <= 1) return;

  const parent = intervals.map((_, i) => i);

  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  }

  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (agendaIntervalsOverlap(intervals[i]!, intervals[j]!)) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(i);
    groups.set(root, list);
  }

  for (const members of groups.values()) {
    if (members.length <= 1) continue;

    const maxLanePlusOne =
      Math.max(...members.map((i) => laid[intervals[i]!.idx]!.laneIndex)) + 1;

    for (const i of members) {
      laid[intervals[i]!.idx]!.laneCount = maxLanePlusOne;
    }
  }
}

/**
 * Collision / stacking: lane orizzontali per box sovrapposti nella stessa colonna staff.
 * Usa durata aggregata multi-servizio (resolveAgendaLineDurationMinutes).
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

  const intervals: LaneInterval[] = pairs.map((p, idx) => {
    const interval = resolvePairIntervalMinutes(p, slotPx);
    return { ...interval, idx };
  });

  const items = [...intervals].sort((a, b) => a.start - b.start);

  type Active = { idx: number; end: number; lane: number };
  const active: Active[] = [];
  let currentMaxLanes = 1;

  for (const item of items) {
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i]!.end <= item.start) active.splice(i, 1);
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
      Math.max(...active.map((a) => a.lane), 0) + 1,
    );

    base[item.idx]!.laneIndex = lane;
    base[item.idx]!.laneCount = currentMaxLanes;

    for (const a of active) {
      base[a.idx]!.laneCount = currentMaxLanes;
    }
  }

  finalizeAgendaLaneCounts(base, intervals);

  return base;
}
