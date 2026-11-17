/**
 * Matching nominativi LAV002 → staff solo per staff_code esatto.
 * Nessuna corrispondenza per solo nome (evita omonimi inventati).
 */

export type StaffMatchCandidate = {
  id: number;
  staff_code: string;
  name: string;
  active: boolean;
};

export type Lav002MatchStatus = "matched_active" | "matched_inactive" | "unmatched" | "ambiguous";

export type Lav002MatchResult = {
  status: Lav002MatchStatus;
  staffId: number | null;
  staffName: string | null;
  staffActive: boolean | null;
  reason: string;
};

export function matchLav002ByStaffCode(
  bossCode: string,
  staffByCode: Map<string, StaffMatchCandidate[]>,
): Lav002MatchResult {
  const code = String(bossCode ?? "").trim();
  if (!code) {
    return {
      status: "unmatched",
      staffId: null,
      staffName: null,
      staffActive: null,
      reason: "codice BOSS vuoto",
    };
  }
  const hits = staffByCode.get(code) ?? [];
  if (hits.length === 0) {
    return {
      status: "unmatched",
      staffId: null,
      staffName: null,
      staffActive: null,
      reason: `nessuno staff con codice ${code}`,
    };
  }
  if (hits.length > 1) {
    return {
      status: "ambiguous",
      staffId: null,
      staffName: null,
      staffActive: null,
      reason: `codice ${code} corrisponde a ${hits.length} persone: ${hits
        .map((h) => `${h.id}:${h.name}`)
        .join(", ")}`,
    };
  }
  const s = hits[0]!;
  return {
    status: s.active ? "matched_active" : "matched_inactive",
    staffId: s.id,
    staffName: s.name,
    staffActive: s.active,
    reason: s.active ? "codice univoco, staff attivo" : "codice univoco, staff disattivo (storico)",
  };
}

export function indexStaffByCode(rows: StaffMatchCandidate[]): Map<string, StaffMatchCandidate[]> {
  const map = new Map<string, StaffMatchCandidate[]>();
  for (const r of rows) {
    const code = String(r.staff_code ?? "").trim();
    if (!code) continue;
    const list = map.get(code) ?? [];
    list.push(r);
    map.set(code, list);
  }
  return map;
}
