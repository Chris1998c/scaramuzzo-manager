import { SLOT_MINUTES } from "@/components/agenda/utils";
import type { AgendaAppointment, AgendaServiceLine } from "@/lib/agenda/agendaContract";
import { resolveAppointmentServiceOccupancyIntervals } from "@/lib/agenda/agendaContract";
import {
  agendaMinutesFromStartTime,
  resolveAgendaLineDurationMinutes,
} from "@/lib/agenda/agendaBoxLayout";

export type AgendaLanePair = {
  app: Pick<AgendaAppointment, "appointment_services">;
  line: Pick<
    AgendaServiceLine,
    | "start_time"
    | "duration_minutes"
    | "duration_active"
    | "duration_processing"
    | "need_processing"
    | "services"
  >;
};

export type AgendaLaidOutLine = {
  app: AgendaLanePair["app"];
  line: AgendaLanePair["line"];
  laneIndex: number;
  laneCount: number;
};

type BusyMinuteInterval = {
  start: number;
  end: number;
};

type LaneItem = {
  idx: number;
  start: number;
  end: number;
  busy: BusyMinuteInterval[];
};

/** [start, end) si sovrappongono */
export function agendaIntervalsOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end;
}

export function agendaBusySegmentsOverlap(
  a: BusyMinuteInterval[],
  b: BusyMinuteInterval[],
): boolean {
  for (const x of a) {
    for (const y of b) {
      if (agendaIntervalsOverlap(x, y)) return true;
    }
  }
  return false;
}

/** Segmenti busy in minuti da mezzanotte (posa esclusa). */
export function resolveAgendaLaneBusyMinutes(
  pair: AgendaLanePair,
): BusyMinuteInterval[] {
  const start = agendaMinutesFromStartTime(pair.line.start_time);
  const occ = resolveAppointmentServiceOccupancyIntervals({
    duration_minutes: pair.line.duration_minutes,
    duration_active: pair.line.duration_active,
    duration_processing: pair.line.duration_processing,
    need_processing: pair.line.need_processing,
  });
  return occ.busy
    .map((b) => ({
      start: start + b.startOffsetMinutes,
      end: start + b.endOffsetMinutes,
    }))
    .filter((b) => b.end > b.start);
}

function resolveLaneItem(pair: AgendaLanePair, slotPx: number, idx: number): LaneItem {
  const busy = resolveAgendaLaneBusyMinutes(pair);
  if (busy.length) {
    return {
      idx,
      start: Math.min(...busy.map((b) => b.start)),
      end: Math.max(...busy.map((b) => b.end)),
      busy,
    };
  }
  const start = agendaMinutesFromStartTime(pair.line.start_time);
  const duration = resolveAgendaLineDurationMinutes(pair.line, pair.app);
  const minCardDur =
    Math.ceil(Math.max(56, slotPx * 1.35) / slotPx) * SLOT_MINUTES;
  const dur = Math.max(duration, minCardDur);
  return { idx, start, end: start + dur, busy: [{ start, end: start + dur }] };
}

/** Allinea laneCount nel cluster di overlap busy. */
export function finalizeAgendaLaneCounts(
  laid: AgendaLaidOutLine[],
  items: LaneItem[],
): void {
  const n = items.length;
  if (n <= 1) return;

  const parent = items.map((_, i) => i);

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
      if (agendaBusySegmentsOverlap(items[i]!.busy, items[j]!.busy)) {
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
      Math.max(...members.map((i) => laid[items[i]!.idx]!.laneIndex)) + 1;
    for (const i of members) {
      laid[items[i]!.idx]!.laneCount = maxLanePlusOne;
    }
  }
}

/**
 * Lane orizzontali solo se i segmenti busy si sovrappongono.
 * Overlap solo in posa libera → stessa corsia (larghezza piena).
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

  const items: LaneItem[] = pairs.map((p, idx) => resolveLaneItem(p, slotPx, idx));
  const sorted = [...items].sort((a, b) => a.start - b.start);

  type Active = { idx: number; end: number; lane: number; busy: BusyMinuteInterval[] };
  const active: Active[] = [];

  for (const item of sorted) {
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i]!.end <= item.start) active.splice(i, 1);
    }

    const used = new Set(
      active
        .filter((a) => agendaBusySegmentsOverlap(a.busy, item.busy))
        .map((a) => a.lane),
    );
    let lane = 0;
    while (used.has(lane)) lane++;

    active.push({ idx: item.idx, end: item.end, lane, busy: item.busy });
    base[item.idx]!.laneIndex = lane;

    for (const a of active) {
      const peers = active.filter(
        (b) => a.idx === b.idx || agendaBusySegmentsOverlap(a.busy, b.busy),
      );
      const count = Math.max(...peers.map((p) => p.lane), 0) + 1;
      base[a.idx]!.laneCount = Math.max(base[a.idx]!.laneCount, count);
    }
  }

  finalizeAgendaLaneCounts(base, items);

  return base;
}
