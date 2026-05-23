import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { DirectionPdfPayload } from "@/lib/reports/mapDirectionReportPdf";
import { formatPdfMoney, formatPdfPct, formatRetailPenetrationPct } from "@/lib/reports/mapDirectionReportPdf";

type Props = DirectionPdfPayload;

const BRAND = "#9D3D27";
const INK = "#0F172A";
const MUTED = "#64748B";
const LINE = "#E2E8F0";
const SOFT = "#F8FAFC";

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 10, fontFamily: "Helvetica", color: INK },
  headerBar: { height: 6, backgroundColor: BRAND, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 10, color: MUTED, marginBottom: 16 },
  heroBox: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 10,
    padding: 16,
    marginBottom: 14,
    backgroundColor: SOFT,
  },
  heroLabel: { fontSize: 9, color: MUTED, textTransform: "uppercase", letterSpacing: 1 },
  heroValue: { fontSize: 28, fontWeight: 700, color: BRAND, marginTop: 4 },
  row: { flexDirection: "row", gap: 10, marginBottom: 10 },
  col: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 8, padding: 10 },
  colLabel: { fontSize: 8, color: MUTED, textTransform: "uppercase" },
  colValue: { fontSize: 14, fontWeight: 700, marginTop: 4 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginTop: 8, marginBottom: 8 },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: LINE,
    paddingBottom: 6,
    fontWeight: 700,
  },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#f1f5f9", paddingVertical: 6 },
  c1: { width: "40%" },
  c2: { width: "30%", textAlign: "right" },
  c3: { width: "30%", textAlign: "right" },
  alertRow: { marginBottom: 6, padding: 8, backgroundColor: SOFT, borderRadius: 6 },
  foot: { marginTop: 20, fontSize: 8, color: MUTED, textAlign: "center" },
});

export default function DirectionReportPdf(props: Props) {
  const p = props;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerBar} />
        <Text style={styles.title}>Riepilogo direzionale</Text>
        <Text style={styles.subtitle}>
          {p.salonName} · {p.generatedAt}
        </Text>

        <View style={styles.heroBox}>
          <Text style={styles.heroLabel}>Incasso reale · oggi</Text>
          <Text style={styles.heroValue}>{formatPdfMoney(p.incassoOggi)}</Text>
          <Text style={{ marginTop: 6, color: MUTED, fontSize: 9 }}>
            vs ieri {formatPdfPct(p.vsIeriPct)} ({formatPdfMoney(p.vsIeriAmount)}) · vs sett. scorsa{" "}
            {formatPdfPct(p.vsSettimanaPct)} ({formatPdfMoney(p.vsSettimanaAmount)})
          </Text>
        </View>

        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.colLabel}>Mese corrente</Text>
            <Text style={styles.colValue}>{formatPdfMoney(p.meseCorrente)}</Text>
            <Text style={{ fontSize: 8, color: MUTED, marginTop: 2 }}>
              {formatPdfPct(p.meseVsPrecPct)} vs mese prec.
            </Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.colLabel}>Scontrini oggi</Text>
            <Text style={styles.colValue}>{p.scontriniOggi}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.colLabel}>Retail oggi</Text>
            <Text style={styles.colValue}>{formatRetailPenetrationPct(p.retailPctOggi)}</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.colLabel}>Sconti dati oggi</Text>
            <Text style={styles.colValue}>{formatPdfMoney(p.scontiOggi)}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.colLabel}>Sconto %</Text>
            <Text style={styles.colValue}>{p.scontoPctOggi.toFixed(1)}%</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.colLabel}>Da richiamare</Text>
            <Text style={styles.colValue}>{p.recallCount}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Top 3 team · oggi</Text>
        <View style={styles.tableHead}>
          <Text style={styles.c1}>Collaboratore</Text>
          <Text style={styles.c2}>Incassato</Text>
          <Text style={styles.c3}>Sconto %</Text>
        </View>
        {p.topStaff.length === 0 ? (
          <Text style={{ color: MUTED }}>Nessun dato team oggi.</Text>
        ) : (
          p.topStaff.map((s, i) => (
            <View style={styles.tableRow} key={i}>
              <Text style={styles.c1}>{s.name}</Text>
              <Text style={styles.c2}>{formatPdfMoney(s.incassato)}</Text>
              <Text style={styles.c3}>{s.scontoPct.toFixed(1)}%</Text>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>Alert e priorità</Text>
        {p.alerts.length === 0 && p.colorAbsentCount === 0 ? (
          <Text style={{ color: MUTED }}>Nessun alert prioritario.</Text>
        ) : (
          <>
            {p.colorAbsentCount > 0 ? (
              <View style={styles.alertRow}>
                <Text>
                  Clienti colore assenti ({p.colorAbsentCount}) — richiamare per mantenere il colore
                </Text>
              </View>
            ) : null}
            {p.alerts.map((a, i) => (
              <View style={styles.alertRow} key={i}>
                <Text>
                  {a.title} ({a.count}) — {a.detail}
                </Text>
              </View>
            ))}
          </>
        )}

        <Text style={styles.foot}>Scaramuzzo Manager · Report direzionale coordinator</Text>
      </Page>
    </Document>
  );
}
