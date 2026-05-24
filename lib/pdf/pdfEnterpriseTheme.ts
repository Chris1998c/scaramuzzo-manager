import { StyleSheet } from "@react-pdf/renderer";

export const PDF_BRAND = "#9D3D27";
export const PDF_INK = "#0F172A";
export const PDF_MUTED = "#64748B";
export const PDF_LINE = "#E2E8F0";
export const PDF_SOFT = "#F8FAFC";
export const PDF_WHITE = "#FFFFFF";
export const PDF_WARN = "#B45309";
export const PDF_OK = "#047857";

export function pdfMoney(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `${v.toFixed(2).replace(".", ",")} €`;
  }
}

export function pdfPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

export function pdfRetailPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

export function pdfSafeStr(v: unknown, max = 120): string {
  const s = String(v ?? "").trim();
  if (!s) return "—";
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}

export const pdfEnterpriseStyles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 48,
    paddingHorizontal: 32,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: PDF_INK,
    backgroundColor: PDF_WHITE,
  },
  headerWrap: {
    borderWidth: 1,
    borderColor: PDF_LINE,
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 16,
  },
  headerBar: { height: 5, backgroundColor: PDF_BRAND },
  headerBody: {
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  brandTitle: { fontSize: 15, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  brandSub: { marginTop: 3, fontSize: 9, color: PDF_MUTED },
  metaBlock: {
    minWidth: 200,
    borderLeftWidth: 1,
    borderLeftColor: PDF_LINE,
    paddingLeft: 12,
  },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  metaLabel: { fontSize: 8, color: PDF_MUTED },
  metaValue: { fontSize: 8, fontFamily: "Helvetica-Bold" },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 10,
  },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 11, letterSpacing: 0.3 },
  sectionLine: { flexGrow: 1, height: 1, backgroundColor: PDF_LINE, marginLeft: 10 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  kpiCard: {
    width: "31%",
    minWidth: 140,
    borderWidth: 1,
    borderColor: PDF_LINE,
    borderRadius: 8,
    padding: 10,
    backgroundColor: PDF_SOFT,
  },
  kpiLabel: { fontSize: 8, color: PDF_MUTED, textTransform: "uppercase", letterSpacing: 0.6 },
  kpiValue: { marginTop: 5, fontSize: 13, fontFamily: "Helvetica-Bold", color: PDF_INK },
  staffCard: {
    borderWidth: 1,
    borderColor: PDF_LINE,
    borderRadius: 10,
    marginBottom: 12,
    overflow: "hidden",
  },
  staffCardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    backgroundColor: PDF_SOFT,
    borderBottomWidth: 1,
    borderBottomColor: PDF_LINE,
  },
  staffName: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  staffRank: { fontSize: 9, color: PDF_MUTED },
  staffBody: { padding: 10 },
  metricsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  metricPill: {
    width: "23%",
    minWidth: 100,
    borderWidth: 1,
    borderColor: PDF_LINE,
    borderRadius: 6,
    padding: 6,
  },
  metricLabel: { fontSize: 7, color: PDF_MUTED, textTransform: "uppercase" },
  metricValue: { marginTop: 3, fontSize: 10, fontFamily: "Helvetica-Bold" },
  subSectionTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 4 },
  listRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 },
  badge: {
    fontSize: 8,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: "#FEF3C7",
    color: PDF_WARN,
  },
  badgeMuted: { backgroundColor: PDF_SOFT, color: PDF_MUTED },
  badgeWarn: { backgroundColor: "#FEE2E2", color: "#B91C1C" },
  alertBox: {
    borderWidth: 1,
    borderColor: PDF_LINE,
    borderRadius: 8,
    padding: 8,
    marginBottom: 6,
    backgroundColor: PDF_SOFT,
  },
  alertTitle: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  alertDetail: { marginTop: 2, fontSize: 8, color: PDF_MUTED },
  foot: {
    position: "absolute",
    left: 32,
    right: 32,
    bottom: 20,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: PDF_LINE,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footText: { fontSize: 8, color: PDF_MUTED },
});
