import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { AgendaReportPdfPayload } from "@/lib/reports/mapAgendaReportPdf";
import {
  pdfEnterpriseStyles as s,
  pdfPct,
  pdfSafeStr,
} from "@/lib/pdf/pdfEnterpriseTheme";

type Props = AgendaReportPdfPayload;

function Header({ p }: { p: Props }) {
  return (
    <View style={s.headerWrap}>
      <View style={s.headerBar} />
      <View style={s.headerBody}>
        <View>
          <Text style={s.brandTitle}>SCARAMUZZO MANAGER</Text>
          <Text style={s.brandSub}>Report Agenda · Audit appuntamenti</Text>
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
            <Text style={s.metaValue}>PDF Agenda enterprise</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function Footer() {
  return (
    <View style={s.foot} fixed>
      <Text style={s.footText}>Scaramuzzo Manager · Report Agenda · Uso interno coordinator</Text>
      <Text
        style={s.footText}
        render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}

export default function AgendaReportPdf(props: Props) {
  const p = props;
  const t = p.totals;

  return (
    <Document title={`Report Agenda — ${p.salonName}`}>
      <Page size="A4" style={s.page}>
        <Header p={p} />

        <View style={s.sectionTitleRow}>
          <Text style={s.sectionTitle}>Riepilogo periodo</Text>
          <View style={s.sectionLine} />
        </View>
        <View style={s.kpiGrid}>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Appuntamenti</Text>
            <Text style={s.kpiValue}>{String(t.appointments)}</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Completati</Text>
            <Text style={s.kpiValue}>{String(t.done)}</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>No-show</Text>
            <Text style={s.kpiValue}>{String(t.no_show)}</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Cancellati</Text>
            <Text style={s.kpiValue}>{String(t.cancelled)}</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Persi (no-show)</Text>
            <Text style={s.kpiValue}>{String(t.missed)}</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Completion rate</Text>
            <Text style={s.kpiValue}>{pdfPct(t.completion_rate)}</Text>
          </View>
        </View>

        <View style={s.sectionTitleRow}>
          <Text style={s.sectionTitle}>Giorni con no-show</Text>
          <View style={s.sectionLine} />
        </View>
        {p.noShowDays.length === 0 ? (
          <Text style={{ fontSize: 9, color: "#64748B" }}>Nessun no-show nel periodo.</Text>
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
              <Text style={{ width: "22%", fontSize: 7, fontFamily: "Helvetica-Bold" }}>Giorno</Text>
              <Text style={{ width: "18%", fontSize: 7, fontFamily: "Helvetica-Bold", textAlign: "right" }}>
                Appunt.
              </Text>
              <Text style={{ width: "15%", fontSize: 7, fontFamily: "Helvetica-Bold", textAlign: "right" }}>
                Done
              </Text>
              <Text style={{ width: "15%", fontSize: 7, fontFamily: "Helvetica-Bold", textAlign: "right" }}>
                No-show
              </Text>
              <Text style={{ width: "15%", fontSize: 7, fontFamily: "Helvetica-Bold", textAlign: "right" }}>
                Canc.
              </Text>
            </View>
            {p.noShowDays.map((row, i) => (
              <View style={s.listRow} key={`day-${i}`}>
                <Text style={{ width: "22%", fontSize: 8 }}>{row.day}</Text>
                <Text style={{ width: "18%", fontSize: 8, textAlign: "right" }}>{row.appointments}</Text>
                <Text style={{ width: "15%", fontSize: 8, textAlign: "right" }}>{row.done}</Text>
                <Text style={{ width: "15%", fontSize: 8, textAlign: "right", color: "#B45309" }}>
                  {row.no_show}
                </Text>
                <Text style={{ width: "15%", fontSize: 8, textAlign: "right" }}>{row.cancelled}</Text>
              </View>
            ))}
          </>
        )}

        <Footer />
      </Page>

      {p.showStaffSection ? (
        <Page size="A4" style={s.page}>
          <View style={s.sectionTitleRow}>
            <Text style={s.sectionTitle}>Collaboratori · ore prenotate</Text>
            <View style={s.sectionLine} />
          </View>
          <Text style={{ fontSize: 8, color: "#64748B", marginBottom: 8 }}>
            Ore da appuntamenti con orario valido (senza % utilizzo: capacità turni non modellata).
          </Text>
          <View
            style={{
              flexDirection: "row",
              borderBottomWidth: 1,
              borderBottomColor: "#E2E8F0",
              paddingBottom: 4,
              marginBottom: 4,
            }}
          >
            <Text style={{ width: "50%", fontSize: 7, fontFamily: "Helvetica-Bold" }}>Collaboratore</Text>
            <Text style={{ width: "25%", fontSize: 7, fontFamily: "Helvetica-Bold", textAlign: "right" }}>
              Ore prenotate
            </Text>
            <Text style={{ width: "25%", fontSize: 7, fontFamily: "Helvetica-Bold", textAlign: "right" }}>
              Giorni attivi
            </Text>
          </View>
          {p.staffRows.map((st, i) => (
            <View style={s.listRow} key={`staff-${i}`}>
              <Text style={{ width: "50%", fontSize: 9 }}>{pdfSafeStr(st.staff_name, 36)}</Text>
              <Text style={{ width: "25%", fontSize: 9, textAlign: "right" }}>
                {st.booked_hours.toFixed(1)}
              </Text>
              <Text style={{ width: "25%", fontSize: 9, textAlign: "right" }}>{st.working_days}</Text>
            </View>
          ))}
          <Footer />
        </Page>
      ) : null}
    </Document>
  );
}
