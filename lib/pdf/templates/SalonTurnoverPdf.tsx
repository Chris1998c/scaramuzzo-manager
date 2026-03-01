// lib/pdf/templates/SalonTurnoverPdf.tsx
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

export type Row = {
  date: string;
  description: string;
  staff_name?: string;
  net_total: number;
};

export type Totals = {
  net_total: number;
  vat_total: number;
  gross_total: number;
  [key: string]: any;
};

type Props = {
  salonName: string;
  dateFrom: string;
  dateTo: string;
  totals: Totals;
  rows: Row[];
};

const BRAND = "#9D3D27"; // Scaramuzzo wine (accent)
const INK = "#0F172A"; // slate-900
const MUTED = "#64748B"; // slate-500
const LINE = "#E2E8F0"; // slate-200
const SOFT = "#F8FAFC"; // slate-50

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 28,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: INK,
  },

  // Header
  headerWrap: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 14,
  },
  headerTopBar: {
    height: 6,
    backgroundColor: BRAND,
  },
  header: {
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  brandBlock: { flexDirection: "column" },
  brandTitle: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.6,
  },
  brandSub: {
    marginTop: 2,
    fontSize: 10,
    color: MUTED,
  },

  metaBlock: {
    minWidth: 220,
    borderLeftWidth: 1,
    borderLeftColor: LINE,
    paddingLeft: 12,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  metaLabel: { color: MUTED },
  metaValue: { fontFamily: "Helvetica-Bold" },

  // KPI Cards
  kpiGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  kpiCard: {
    flexGrow: 1,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 12,
    padding: 12,
    backgroundColor: SOFT,
  },
  kpiLabel: { color: MUTED, fontSize: 9 },
  kpiValue: {
    marginTop: 6,
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
  },
  kpiHint: { marginTop: 3, fontSize: 8, color: MUTED },

  // Section title
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    letterSpacing: 0.3,
  },
  sectionLine: {
    flexGrow: 1,
    height: 1,
    backgroundColor: LINE,
    marginLeft: 10,
  },

  // Table
  tableWrap: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 12,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#111827",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  th: {
    color: "#FFFFFF",
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: LINE,
  },
  rowAlt: { backgroundColor: "#FFFFFF" },
  rowBase: { backgroundColor: SOFT },
  td: { fontSize: 9 },

  colDate: { width: "18%" },
  colDesc: { width: "42%" },
  colStaff: { width: "20%" },
  colAmount: { width: "20%", textAlign: "right" },

  emptyBox: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 12,
    padding: 14,
    backgroundColor: SOFT,
  },
  emptyTitle: { fontFamily: "Helvetica-Bold", marginBottom: 4 },
  emptyText: { color: MUTED },

  // Footer
  footer: {
    position: "absolute",
    left: 28,
    right: 28,
    bottom: 18,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: LINE,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footLeft: { color: MUTED, fontSize: 8 },
  footRight: { color: MUTED, fontSize: 8 },
});

function safeStr(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : "-";
}

function money(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  // formattazione IT con simbolo €
  try {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    // fallback (se Intl non disponibile in qualche runtime)
    return `${v.toFixed(2)} EUR`;
  }
}

export default function SalonTurnoverPdf({
  salonName,
  dateFrom,
  dateTo,
  totals,
  rows,
}: Props) {
  const net = Number(totals?.net_total ?? 0) || 0;
  const vat = Number(totals?.vat_total ?? 0) || 0;
  const gross = Number(totals?.gross_total ?? 0) || 0;

  const docTitle = "Report Fatturato Salone";
  const docCode = `SALON-${safeStr(salonName).slice(0, 8).toUpperCase()}`;

  return (
    <Document title={`${docTitle} - ${salonName}`}>
      <Page size="A4" style={styles.page}>
        {/* HEADER */}
        <View style={styles.headerWrap}>
          <View style={styles.headerTopBar} />
          <View style={styles.header}>
            <View style={styles.brandBlock}>
              <Text style={styles.brandTitle}>SCARAMUZZO MANAGER</Text>
              <Text style={styles.brandSub}>{docTitle}</Text>
              <Text style={styles.brandSub}>
                {safeStr(salonName)} • Periodo {safeStr(dateFrom)} → {safeStr(dateTo)}
              </Text>
            </View>

            <View style={styles.metaBlock}>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Documento</Text>
                <Text style={styles.metaValue}>PDF</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Codice</Text>
                <Text style={styles.metaValue}>{docCode}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Righe</Text>
                <Text style={styles.metaValue}>{String(rows?.length ?? 0)}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Valuta</Text>
                <Text style={styles.metaValue}>EUR</Text>
              </View>
            </View>
          </View>
        </View>

        {/* KPI */}
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Netto</Text>
            <Text style={styles.kpiValue}>{money(net)}</Text>
            <Text style={styles.kpiHint}>Imponibile (vendite)</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>IVA</Text>
            <Text style={styles.kpiValue}>{money(vat)}</Text>
            <Text style={styles.kpiHint}>Totale imposta</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Lordo</Text>
            <Text style={styles.kpiValue}>{money(gross)}</Text>
            <Text style={styles.kpiHint}>Netto + IVA</Text>
          </View>
        </View>

        {/* TABLE TITLE */}
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>Dettaglio movimenti</Text>
          <View style={styles.sectionLine} />
        </View>

        {/* TABLE */}
        {rows?.length ? (
          <View style={styles.tableWrap}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, styles.colDate]}>DATA</Text>
              <Text style={[styles.th, styles.colDesc]}>DESCRIZIONE</Text>
              <Text style={[styles.th, styles.colStaff]}>STAFF</Text>
              <Text style={[styles.th, styles.colAmount]}>NETTO</Text>
            </View>

            {rows.map((r, i) => {
              const isAlt = i % 2 === 0;
              return (
                <View
                  key={`${r.date}-${i}`}
                  style={[
                    styles.tableRow,
                    isAlt ? styles.rowAlt : styles.rowBase,
                  ]}
                >
                  <Text style={[styles.td, styles.colDate]}>
                    {safeStr(r.date)}
                  </Text>
                  <Text style={[styles.td, styles.colDesc]}>
                    {safeStr(r.description)}
                  </Text>
                  <Text style={[styles.td, styles.colStaff]}>
                    {safeStr(r.staff_name)}
                  </Text>
                  <Text style={[styles.td, styles.colAmount]}>
                    {money(Number(r.net_total ?? 0) || 0)}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Nessun dato nel periodo selezionato</Text>
            <Text style={styles.emptyText}>
              Prova a cambiare intervallo date o salone.
            </Text>
          </View>
        )}

        {/* FOOTER */}
        <View style={styles.footer} fixed>
          <Text style={styles.footLeft}>
            Scaramuzzo Manager • Report ufficiale (uso interno)
          </Text>
          <Text
            style={styles.footRight}
            render={({ pageNumber, totalPages }) =>
              `Pagina ${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}