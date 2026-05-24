import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { CashReportPdfPayload } from "@/lib/reports/mapCashReportPdf";
import {
  pdfEnterpriseStyles as s,
  pdfMoney,
  pdfSafeStr,
} from "@/lib/pdf/pdfEnterpriseTheme";

type Props = CashReportPdfPayload;

function Header({ p }: { p: Props }) {
  return (
    <View style={s.headerWrap}>
      <View style={s.headerBar} />
      <View style={s.headerBody}>
        <View>
          <Text style={s.brandTitle}>SCARAMUZZO MANAGER</Text>
          <Text style={s.brandSub}>Report Cassa · Audit sessioni</Text>
          <Text style={s.brandSub}>
            {pdfSafeStr(p.salonName)} · Periodo {p.dateFrom} → {p.dateTo}
          </Text>
        </View>
        <View style={s.metaBlock}>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Salone ID</Text>
            <Text style={s.metaValue}>{String(p.salonId)}</Text>
          </View>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Generato il</Text>
            <Text style={s.metaValue}>{p.generatedAt}</Text>
          </View>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Documento</Text>
            <Text style={s.metaValue}>PDF Cassa enterprise</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function Footer() {
  return (
    <View style={s.foot} fixed>
      <Text style={s.footText}>Scaramuzzo Manager · Report Cassa · Uso interno coordinator</Text>
      <Text
        style={s.footText}
        render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}

export default function CashReportPdf(props: Props) {
  const p = props;

  return (
    <Document title={`Report Cassa — ${p.salonName}`}>
      <Page size="A4" style={s.page}>
        <Header p={p} />

        <View style={s.sectionTitleRow}>
          <Text style={s.sectionTitle}>Riepilogo periodo</Text>
          <View style={s.sectionLine} />
        </View>
        <View style={s.kpiGrid}>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Sessioni</Text>
            <Text style={s.kpiValue}>{String(p.totals.sessions)}</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Incassato totale</Text>
            <Text style={s.kpiValue}>{pdfMoney(p.totals.gross_total)}</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Contanti</Text>
            <Text style={s.kpiValue}>{pdfMoney(p.totals.gross_cash)}</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>POS / Carta</Text>
            <Text style={s.kpiValue}>{pdfMoney(p.totals.gross_card)}</Text>
          </View>
        </View>

        {p.anomalies.length > 0 ? (
          <>
            <View style={s.sectionTitleRow}>
              <Text style={s.sectionTitle}>Anomalie rilevate</Text>
              <View style={s.sectionLine} />
            </View>
            {p.anomalies.map((a, i) => (
              <View style={s.alertBox} key={`anomaly-${i}`}>
                <Text style={s.alertTitle}>{a.title}</Text>
                <Text style={s.alertDetail}>{a.detail}</Text>
              </View>
            ))}
          </>
        ) : null}

        <View style={s.sectionTitleRow}>
          <Text style={s.sectionTitle}>Sessioni di cassa</Text>
          <View style={s.sectionLine} />
        </View>
        {p.sessions.length === 0 ? (
          <Text style={{ fontSize: 9, color: "#64748B" }}>Nessuna sessione nel periodo.</Text>
        ) : (
          <>
            <View
              style={{
                flexDirection: "row",
                borderBottomWidth: 1,
                borderBottomColor: "#E2E8F0",
                paddingBottom: 4,
                marginBottom: 4,
              }}
            >
              <Text style={{ width: "12%", fontSize: 7, fontFamily: "Helvetica-Bold" }}>Data</Text>
              <Text style={{ width: "10%", fontSize: 7, fontFamily: "Helvetica-Bold" }}>Stato</Text>
              <Text style={{ width: "14%", fontSize: 7, fontFamily: "Helvetica-Bold" }}>Apertura</Text>
              <Text style={{ width: "14%", fontSize: 7, fontFamily: "Helvetica-Bold" }}>Chiusura</Text>
              <Text style={{ width: "12%", fontSize: 7, fontFamily: "Helvetica-Bold", textAlign: "right" }}>
                Lordo
              </Text>
              <Text style={{ width: "11%", fontSize: 7, fontFamily: "Helvetica-Bold", textAlign: "right" }}>
                Contanti
              </Text>
              <Text style={{ width: "11%", fontSize: 7, fontFamily: "Helvetica-Bold", textAlign: "right" }}>
                Carta
              </Text>
              <Text style={{ width: "13%", fontSize: 7, fontFamily: "Helvetica-Bold", textAlign: "right" }}>
                Dichiarati
              </Text>
              <Text style={{ width: "13%", fontSize: 7, fontFamily: "Helvetica-Bold", textAlign: "right" }}>
                Diff.
              </Text>
            </View>
            {p.sessions.slice(0, 28).map((row, i) => (
              <View style={s.listRow} key={`sess-${i}`}>
                <Text style={{ width: "12%", fontSize: 8 }}>{row.session_label}</Text>
                <Text style={{ width: "10%", fontSize: 8 }}>{row.status_label}</Text>
                <Text style={{ width: "14%", fontSize: 7, color: "#64748B" }}>{row.opened_at}</Text>
                <Text style={{ width: "14%", fontSize: 7, color: "#64748B" }}>{row.closed_at}</Text>
                <Text style={{ width: "12%", fontSize: 8, textAlign: "right" }}>
                  {pdfMoney(row.gross_total)}
                </Text>
                <Text style={{ width: "11%", fontSize: 8, textAlign: "right" }}>
                  {pdfMoney(row.gross_cash)}
                </Text>
                <Text style={{ width: "11%", fontSize: 8, textAlign: "right" }}>
                  {pdfMoney(row.gross_card)}
                </Text>
                <Text style={{ width: "13%", fontSize: 8, textAlign: "right" }}>
                  {row.declared_cash != null ? pdfMoney(row.declared_cash) : "—"}
                </Text>
                <Text
                  style={{
                    width: "13%",
                    fontSize: 8,
                    textAlign: "right",
                    color:
                      row.cash_difference != null && Math.abs(row.cash_difference) >= 0.01
                        ? "#B45309"
                        : "#0F172A",
                  }}
                >
                  {row.cash_difference != null ? pdfMoney(row.cash_difference) : "—"}
                </Text>
              </View>
            ))}
            {p.sessions.length > 28 ? (
              <Text style={{ marginTop: 6, fontSize: 8, color: "#64748B" }}>
                … altre {p.sessions.length - 28} sessioni non mostrate
              </Text>
            ) : null}
          </>
        )}

        <Footer />
      </Page>
    </Document>
  );
}
