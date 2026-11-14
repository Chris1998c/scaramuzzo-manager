import {
  pickDefaultSalonIdForReport,
} from "@/lib/reportSalonResolve";
import { isOperationalSalonId, REAL_SALON_IDS } from "@/lib/constants";
import {
  resolveReportDateRange,
  type ResolvedReportDateRange,
} from "@/lib/reports/reportDateRange";
import { salonIdsForAttendanceFilter } from "@/lib/attendanceWebAccess";
import type { getUserAccess } from "@/lib/getUserAccess";

type Access = Awaited<ReturnType<typeof getUserAccess>>;

export type ResolvedAttendanceQuery = {
  /** null = tutti i saloni permessi (coordinator "Tutti"). */
  salonId: number | null;
  /** Saloni effettivamente interrogabili (sempre non vuoto se ok). */
  querySalonIds: number[] | null;
  staffId: number | null;
  dateRange: ResolvedReportDateRange;
  canChooseSalon: boolean;
  allowedSalonIds: number[];
};

function toInt(x: string | null | undefined): number | null {
  if (x == null || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Risolve filtri Presenze da searchParams + permessi ruolo.
 * Reception: salone forzato a staffSalonId (header non sceglie).
 * Coordinator: salon_id URL / default operativo; salon_id=all → tutti i consentiti.
 */
export function resolveAttendanceQuery(params: {
  access: Access;
  salonIdRaw?: string | null;
  staffIdRaw?: string | null;
  dateFromRaw?: string | null;
  dateToRaw?: string | null;
  todayRome?: string;
}): ResolvedAttendanceQuery {
  const roleSalonIds = salonIdsForAttendanceFilter(params.access);
  const canChooseSalon = params.access.role === "coordinator";

  const allowedSalonIds =
    roleSalonIds === null
      ? params.access.allowedSalonIds.filter((id) => isOperationalSalonId(id))
      : roleSalonIds;

  const dateRange = resolveReportDateRange({
    dateFrom: params.dateFromRaw,
    dateTo: params.dateToRaw,
    today: params.todayRome,
  });

  const staffId = toInt(params.staffIdRaw);

  if (!canChooseSalon) {
    const forced =
      roleSalonIds && roleSalonIds.length === 1 ? roleSalonIds[0]! : null;
    return {
      salonId: forced,
      querySalonIds: roleSalonIds,
      staffId,
      dateRange,
      canChooseSalon,
      allowedSalonIds: allowedSalonIds.length
        ? allowedSalonIds
        : [...REAL_SALON_IDS],
    };
  }

  const raw = (params.salonIdRaw ?? "").trim().toLowerCase();
  if (raw === "all" || raw === "0") {
    return {
      salonId: null,
      querySalonIds: null,
      staffId,
      dateRange,
      canChooseSalon,
      allowedSalonIds,
    };
  }

  const requested = toInt(params.salonIdRaw);
  let salonId: number | null = null;
  if (
    requested != null &&
    allowedSalonIds.includes(requested) &&
    isOperationalSalonId(requested)
  ) {
    salonId = requested;
  } else {
    salonId = pickDefaultSalonIdForReport(
      allowedSalonIds,
      params.access.defaultSalonId,
    );
  }

  return {
    salonId,
    querySalonIds: salonId != null ? [salonId] : null,
    staffId,
    dateRange,
    canChooseSalon,
    allowedSalonIds,
  };
}
