import {
  isoDayOfWeekFromISODateLocal,
  isStaffOffScheduleForAgendaDay,
  isStaffVisibleOnAgendaDayForSalon,
  type StaffScheduleBySalon,
} from "@/lib/staffSchedule";
import {
  isSalonClosedOnDate,
  isSalonExtraOpenOnDate,
  type OperationalCalendarSnapshot,
  type SalonOperationalDay,
  type StaffDateOverride,
} from "@/lib/salonOperationalCalendar";
import { formatTimeRange } from "@/lib/operationalCalendarSettings";

export const SALON_CLOSED_UI_MESSAGE = "Salone chiuso in questa data";
export const STAFF_UNAVAILABLE_UI_MESSAGE =
  "Collaboratore non disponibile in questa data";

export function emptyOperationalSnapshot(): OperationalCalendarSnapshot {
  return { salonDay: null, staffOverrides: new Map() };
}

export function canSubmitNewBookingOnOperationalDay(
  salonDay: SalonOperationalDay | null | undefined,
): boolean {
  return !isSalonClosedOnDate(salonDay);
}

export function operationalOpenExtraHint(
  salonDay: SalonOperationalDay | null | undefined,
): string | null {
  if (!isSalonExtraOpenOnDate(salonDay) || !salonDay) return null;
  const range = formatTimeRange(salonDay.openStartTime, salonDay.openEndTime);
  return range ? `Apertura straordinaria · ${range}` : "Apertura straordinaria";
}

type StaffPickRow = { id: number | string | null; name: string };

function includeStaffIdSet(
  includeStaffIds?: Iterable<string | number | null | undefined>,
): Set<string> {
  return new Set(
    [...(includeStaffIds ?? [])]
      .filter((id) => id != null && id !== "")
      .map((id) => String(id)),
  );
}

/**
 * Select modali: available extra incluso; unavailable escluso salvo già assegnato (include).
 */
export function filterStaffForOperationalAgendaModal<T extends StaffPickRow>(
  staffRows: T[],
  scheduleMap: StaffScheduleBySalon,
  isoDate: string,
  operational: OperationalCalendarSnapshot,
  includeStaffIds?: Iterable<string | number | null | undefined>,
): T[] {
  const include = includeStaffIdSet(includeStaffIds);
  const dow = isoDayOfWeekFromISODateLocal(isoDate);
  const overrides = operational.staffOverrides;

  return staffRows.filter((row) => {
    const id = row.id;
    if (id == null || id === "") return true;
    const sid = String(id);
    const override = overrides.get(sid);

    if (override?.kind === "unavailable") {
      return include.has(sid);
    }
    if (override?.kind === "available") {
      return true;
    }
    if (include.has(sid)) return true;
    if (!dow) return true;
    return isStaffVisibleOnAgendaDayForSalon(scheduleMap, sid, dow);
  });
}

export function isStaffExtraOnOperationalDate(
  staffId: string | number | null | undefined,
  scheduleMap: StaffScheduleBySalon,
  isoDate: string,
  operational: OperationalCalendarSnapshot,
): boolean {
  if (staffId == null || staffId === "") return false;
  const sid = String(staffId);
  if (operational.staffOverrides.get(sid)?.kind === "available") {
    return isStaffOffScheduleForAgendaDay(scheduleMap, sid, isoDate);
  }
  return false;
}

export function isStaffUnavailableOnOperationalDate(
  staffId: string | number | null | undefined,
  operational: OperationalCalendarSnapshot,
): boolean {
  if (staffId == null || staffId === "") return false;
  return operational.staffOverrides.get(String(staffId))?.kind === "unavailable";
}

export function staffSelectLabelForOperationalDate(
  name: string,
  staffId: string | number | null | undefined,
  scheduleMap: StaffScheduleBySalon,
  isoDate: string,
  operational: OperationalCalendarSnapshot,
): string {
  if (staffId == null || staffId === "") return name;
  if (isStaffExtraOnOperationalDate(staffId, scheduleMap, isoDate, operational)) {
    return `${name} (extra)`;
  }
  const sid = String(staffId);
  if (
    isStaffOffScheduleForAgendaDay(scheduleMap, sid, isoDate) &&
    operational.staffOverrides.get(sid)?.kind !== "available"
  ) {
    return `${name} (fuori turno)`;
  }
  return name;
}

export function hasAssignedStaffUnavailableWarning(
  includeStaffIds: Iterable<string | number | null | undefined>,
  operational: OperationalCalendarSnapshot,
): boolean {
  for (const id of includeStaffIds) {
    if (isStaffUnavailableOnOperationalDate(id, operational)) return true;
  }
  return false;
}

export function getStaffOverride(
  staffId: string | number | null | undefined,
  operational: OperationalCalendarSnapshot,
): StaffDateOverride | null {
  if (staffId == null || staffId === "") return null;
  return operational.staffOverrides.get(String(staffId)) ?? null;
}
