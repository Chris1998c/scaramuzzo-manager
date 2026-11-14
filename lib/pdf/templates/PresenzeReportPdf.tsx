import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { AttendanceDailySummaryRow } from "@/lib/attendance/attendanceDailySummary";
import {
  hoursFromMinutes,
  totalsByStaff,
} from "@/lib/attendance/attendanceDailySummary";
import { salonLabel } from "@/lib/constants";
import { formatRomeDateTime } from "@/lib/datetime/formatRomeInstant";
import {
  pdfEnterpriseStyles as s,
  pdfSafeStr,
  PDF_OK,
  PDF_WARN,
} from "@/lib/pdf/pdfEnterpriseTheme";

export type PresenzePdfPayload = {
  salonLabelText: string;
  dateFrom: string;
  dateTo: string;
  generatedAt: string;
  rows: AttendanceDailySummaryRow[];
};

function fmtDt(value: string | null): string {
  if (!value) return "—";
  const f = formatRomeDateTime(value);
  return f === "—" ? "—" : f;
}

function PdfHeader({
  salonLabelText,
  dateFrom,
  dateTo,
  generatedAt,
}: Omit<PresenzePdfPayload, "rows">) {
  return (
    <View style={s.headerWrap}>
      <View style={s.headerBar} />
      <View style={s.headerBody}>
        <View>
          <Text style={s.brandTitle}>SCARAMUZZO MANAGER</Text>
          <Text style={s.brandSub}>Presenze collaboratori</Text>
          <Text style={s.brandSub}>
            {pdfSafeStr(salonLabelText)} · Periodo {dateFrom} → {dateTo}
          </Text>
        </View>
        <View style={s.metaBlock}>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Generato il</Text>
            <Text style={s.metaValue}>{generatedAt}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function PdfFooter() {
  return (
    <View style={s.foot} fixed>
      <Text style={s.footText}>
        Scaramuzzo Manager · Presenze · Incomplete non conteggiate come turni chiusi
      </Text>
      <Text
        style={s.footText}
        render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}

const th = {
  fontSize: 7,
  fontFamily: "Helvetica-Bold" as const,
};
const td = { fontSize: 8 };

export function PresenzeReportPdf({
  salonLabelText,
  dateFrom,
  dateTo,
  generatedAt,
  rows,
}: PresenzePdfPayload) {
  const totals = totalsByStaff(rows);

  return (
    <Document>
      <Page size="A4" style={s.page} orientation="landscape">
        <PdfHeader
          salonLabelText={salonLabelText}
          dateFrom={dateFrom}
          dateTo={dateTo}
          generatedAt={generatedAt}
        />

        <View style={s.sectionTitleRow}>
          <Text style={s.sectionTitle}>Dettaglio giorno</Text>
          <View style={s.sectionLine} />
        </View>

        <View
          style={{
            flexDirection: "row",
            borderBottomWidth: 1,
            borderBottomColor: "#E2E8F0",
            paddingBottom: 4,
            marginBottom: 4,
          }}
        >
          <Text style={{ ...th, width: "11%" }}>Giorno</Text>
          <Text style={{ ...th, width: "16%" }}>Collaboratore</Text>
          <Text style={{ ...th, width: "12%" }}>Salone</Text>
          <Text style={{ ...th, width: "16%" }}>Entrata</Text>
          <Text style={{ ...th, width: "16%" }}>Uscita</Text>
          <Text style={{ ...th, width: "8%", textAlign: "right" }}>Min</Text>
          <Text style={{ ...th, width: "8%", textAlign: "right" }}>Ore</Text>
          <Text style={{ ...th, width: "13%" }}>Stato</Text>
        </View>

        {rows.length === 0 ? (
          <Text style={{ marginTop: 8, color: "#64748B" }}>Nessuna presenza nel periodo.</Text>
        ) : (
          rows.map((row) => (
            <View
              key={`${row.staff_id}-${row.salon_id}-${row.day}`}
              style={s.listRow}
              wrap={false}
            >
              <Text style={{ ...td, width: "11%" }}>{row.day}</Text>
              <Text style={{ ...td, width: "16%" }}>{pdfSafeStr(row.staff_name)}</Text>
              <Text style={{ ...td, width: "12%" }}>
                {pdfSafeStr(salonLabel(row.salon_id))}
              </Text>
              <Text style={{ ...td, width: "16%", fontSize: 7, color: "#64748B" }}>
                {fmtDt(row.first_clock_in_at)}
              </Text>
              <Text style={{ ...td, width: "16%", fontSize: 7, color: "#64748B" }}>
                {fmtDt(row.last_clock_out_at)}
              </Text>
              <Text style={{ ...td, width: "8%", textAlign: "right" }}>
                {String(row.worked_minutes)}
              </Text>
              <Text style={{ ...td, width: "8%", textAlign: "right" }}>
                {hoursFromMinutes(row.worked_minutes)}
              </Text>
              <Text
                style={{
                  ...td,
                  width: "13%",
                  color: row.is_incomplete ? PDF_WARN : PDF_OK,
                  fontFamily: "Helvetica-Bold",
                }}
              >
                {row.is_incomplete ? "INCOMPLETA" : "OK"}
              </Text>
            </View>
          ))
        )}

        <View style={[s.sectionTitleRow, { marginTop: 16 }]}>
          <Text style={s.sectionTitle}>Totali per collaboratore</Text>
          <View style={s.sectionLine} />
        </View>
        <Text style={{ fontSize: 8, color: "#64748B", marginBottom: 6 }}>
          Le giornate incomplete sono segnalate e non conteggiate come turni chiusi.
        </Text>

        {totals.map((t) => (
          <View key={t.staff_id} style={s.listRow} wrap={false}>
            <Text style={{ ...td, width: "28%" }}>{pdfSafeStr(t.staff_name)}</Text>
            <Text style={{ ...td, width: "18%" }}>Chiusi: {t.closed_days}</Text>
            <Text style={{ ...td, width: "22%", color: PDF_WARN }}>
              Incomplete: {t.incomplete_days}
            </Text>
            <Text style={{ ...td, width: "16%", textAlign: "right" }}>
              {t.worked_minutes} min
            </Text>
            <Text style={{ ...td, width: "16%", textAlign: "right" }}>
              {hoursFromMinutes(t.worked_minutes)} h
            </Text>
          </View>
        ))}

        <PdfFooter />
      </Page>
    </Document>
  );
}
