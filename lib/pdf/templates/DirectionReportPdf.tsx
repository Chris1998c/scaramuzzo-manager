import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { DirectionPdfPayload } from "@/lib/reports/mapDirectionReportPdf";
import {
  pdfEnterpriseStyles as s,
  pdfMoney,
  pdfPct,
  pdfRetailPct,
  pdfSafeStr,
  PDF_BRAND,
} from "@/lib/pdf/pdfEnterpriseTheme";

type Props = DirectionPdfPayload;

function Header({ p }: { p: Props }) {
  return (
    <View style={s.headerWrap}>
      <View style={s.headerBar} />
      <View style={s.headerBody}>
        <View>
          <Text style={s.brandTitle}>SCARAMUZZO MANAGER</Text>
          <Text style={s.brandSub}>Riepilogo direzionale · Cockpit stampabile</Text>
          <Text style={s.brandSub}>{pdfSafeStr(p.salonName)} · {p.generatedAt}</Text>
        </View>
        <View style={s.metaBlock}>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Oggi</Text>
            <Text style={s.metaValue}>{p.todayLabel}</Text>
          </View>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Mese</Text>
            <Text style={s.metaValue}>{p.monthLabel}</Text>
          </View>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Importi</Text>
            <Text style={s.metaValue}>{p.vatModeLabel}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function Footer() {
  return (
    <View style={s.foot} fixed>
      <Text style={s.footText}>Scaramuzzo Manager · Riepilogo coordinator · Uso interno</Text>
      <Text
        style={s.footText}
        render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}

export default function DirectionReportPdf(props: Props) {
  const p = props;

  return (
    <Document title={`Riepilogo direzionale — ${p.salonName}`}>
      <Page size="A4" style={s.page}>
        <Header p={p} />

        <View
          style={{
            borderWidth: 1,
            borderColor: "#E2E8F0",
            borderRadius: 10,
            padding: 14,
            marginBottom: 14,
            backgroundColor: "#F8FAFC",
          }}
        >
          <Text style={{ fontSize: 8, color: "#64748B", textTransform: "uppercase", letterSpacing: 1 }}>
            Incasso reale · oggi
          </Text>
          <Text style={{ fontSize: 26, fontFamily: "Helvetica-Bold", color: PDF_BRAND, marginTop: 4 }}>
            {pdfMoney(p.incassoOggi)}
          </Text>
          <Text style={{ marginTop: 6, fontSize: 9, color: "#64748B" }}>
            Listino {pdfMoney(p.listinoOggi)} · vs ieri {pdfPct(p.vsIeriPct)} ({pdfMoney(p.vsIeriAmount)}) ·
            vs sett. {pdfPct(p.vsSettimanaPct)} ({pdfMoney(p.vsSettimanaAmount)})
          </Text>
        </View>

        <View style={s.sectionTitleRow}>
          <Text style={s.sectionTitle}>Overview giornata</Text>
          <View style={s.sectionLine} />
        </View>
        <View style={s.kpiGrid}>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Scontrini</Text>
            <Text style={s.kpiValue}>{String(p.scontriniOggi)}</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Clienti</Text>
            <Text style={s.kpiValue}>{String(p.clientiOggi)}</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Ticket medio</Text>
            <Text style={s.kpiValue}>{pdfMoney(p.ticketMedioOggi)}</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Retail oggi</Text>
            <Text style={s.kpiValue}>{pdfRetailPct(p.retailPctOggi)}</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Sconti dati</Text>
            <Text style={s.kpiValue}>{pdfMoney(p.scontiOggi)}</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Sconto %</Text>
            <Text style={s.kpiValue}>{p.scontoPctOggi.toFixed(1)}%</Text>
          </View>
        </View>

        <View style={s.sectionTitleRow}>
          <Text style={s.sectionTitle}>Overview mese corrente</Text>
          <View style={s.sectionLine} />
        </View>
        <View style={s.kpiGrid}>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Incasso mese</Text>
            <Text style={s.kpiValue}>{pdfMoney(p.meseCorrente)}</Text>
            <Text style={{ fontSize: 7, color: "#64748B", marginTop: 2 }}>
              {pdfPct(p.meseVsPrecPct)} vs mese prec.
            </Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Valore listino</Text>
            <Text style={s.kpiValue}>{pdfMoney(p.meseListino)}</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Sconti mese</Text>
            <Text style={s.kpiValue}>{pdfMoney(p.meseSconti)}</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Scontrini mese</Text>
            <Text style={s.kpiValue}>{String(p.meseScontrini)}</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Clienti mese</Text>
            <Text style={s.kpiValue}>{String(p.meseClienti)}</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Ticket medio mese</Text>
            <Text style={s.kpiValue}>{pdfMoney(p.meseTicketMedio)}</Text>
          </View>
        </View>

        <Footer />
      </Page>

      <Page size="A4" style={s.page}>
        <View style={s.sectionTitleRow}>
          <Text style={s.sectionTitle}>Alert prioritari</Text>
          <View style={s.sectionLine} />
        </View>
        {p.alerts.length === 0 && p.colorAbsentCount === 0 ? (
          <Text style={{ fontSize: 9, color: "#64748B" }}>Nessun alert prioritario oggi.</Text>
        ) : (
          <>
            {p.colorAbsentCount > 0 ? (
              <View style={s.alertBox}>
                <Text style={s.alertTitle}>Clienti colore assenti ({p.colorAbsentCount})</Text>
                <Text style={s.alertDetail}>
                  Schede colore attive senza appuntamento colore in tempo — richiamare.
                </Text>
              </View>
            ) : null}
            {p.alerts.map((a, i) => (
              <View style={s.alertBox} key={`alert-${i}`}>
                <Text style={s.alertTitle}>
                  {a.title} ({a.count})
                </Text>
                <Text style={s.alertDetail}>{a.detail}</Text>
              </View>
            ))}
          </>
        )}

        <View style={[s.sectionTitleRow, { marginTop: 12 }]}>
          <Text style={s.sectionTitle}>Team · oggi</Text>
          <View style={s.sectionLine} />
        </View>
        {p.topStaff.length === 0 ? (
          <Text style={{ fontSize: 9, color: "#64748B" }}>Nessun dato team oggi.</Text>
        ) : (
          p.topStaff.map((st, i) => (
            <View style={s.listRow} key={`staff-${i}`}>
              <Text style={{ fontSize: 9, width: "40%" }}>{st.name}</Text>
              <Text style={{ fontSize: 9, width: "30%", textAlign: "right" }}>
                {pdfMoney(st.incassato)}
              </Text>
              <Text style={{ fontSize: 9, width: "15%", textAlign: "right" }}>
                {st.scontoPct.toFixed(1)}%
              </Text>
              <Text style={{ fontSize: 9, width: "15%", textAlign: "right" }}>
                {pdfRetailPct(st.retailPct)}
              </Text>
            </View>
          ))
        )}

        <View style={[s.sectionTitleRow, { marginTop: 14 }]}>
          <Text style={s.sectionTitle}>Clienti da richiamare ({p.recallCount})</Text>
          <View style={s.sectionLine} />
        </View>
        {p.recallClients.length === 0 ? (
          <Text style={{ fontSize: 9, color: "#64748B" }}>Nessun cliente in recall 60+ giorni.</Text>
        ) : (
          p.recallClients.map((c, i) => (
            <View style={s.listRow} key={`recall-${i}`}>
              <Text style={{ fontSize: 9, width: "35%" }}>{pdfSafeStr(c.name, 40)}</Text>
              <Text style={{ fontSize: 8, width: "65%", color: "#64748B" }}>{pdfSafeStr(c.detail, 90)}</Text>
            </View>
          ))
        )}

        <View style={[s.sectionTitleRow, { marginTop: 14 }]}>
          <Text style={s.sectionTitle}>Azioni CRM suggerite</Text>
          <View style={s.sectionLine} />
        </View>
        {p.crmActions.length === 0 ? (
          <Text style={{ fontSize: 9, color: "#64748B" }}>Nessuna azione CRM in coda.</Text>
        ) : (
          p.crmActions.map((a, i) => (
            <View style={s.alertBox} key={`crm-${i}`}>
              <Text style={s.alertTitle}>
                {pdfSafeStr(a.name, 40)} · {a.reason}
              </Text>
              <Text style={s.alertDetail}>{a.detail}</Text>
            </View>
          ))
        )}

        <Footer />
      </Page>
    </Document>
  );
}
