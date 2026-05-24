import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { TeamPdfPayload, TeamPdfStaffBlock } from "@/lib/reports/mapStaffReportPdf";
import {
  pdfEnterpriseStyles as s,
  pdfMoney,
  pdfRetailPct,
  pdfSafeStr,
} from "@/lib/pdf/pdfEnterpriseTheme";

type Props = TeamPdfPayload;

function PdfHeader({
  title,
  salonName,
  salonId,
  dateFrom,
  dateTo,
  generatedAt,
  vatModeLabel,
}: {
  title: string;
  salonName: string;
  salonId: number;
  dateFrom: string;
  dateTo: string;
  generatedAt: string;
  vatModeLabel: string;
}) {
  return (
    <View style={s.headerWrap}>
      <View style={s.headerBar} />
      <View style={s.headerBody}>
        <View>
          <Text style={s.brandTitle}>SCARAMUZZO MANAGER</Text>
          <Text style={s.brandSub}>{title}</Text>
          <Text style={s.brandSub}>
            {pdfSafeStr(salonName)} · Periodo {dateFrom} → {dateTo}
          </Text>
        </View>
        <View style={s.metaBlock}>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Salone ID</Text>
            <Text style={s.metaValue}>{String(salonId)}</Text>
          </View>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Generato il</Text>
            <Text style={s.metaValue}>{generatedAt}</Text>
          </View>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Importi</Text>
            <Text style={s.metaValue}>{vatModeLabel}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function PdfFooter() {
  return (
    <View style={s.foot} fixed>
      <Text style={s.footText}>Scaramuzzo Manager · Report Team · Uso interno coordinator</Text>
      <Text
        style={s.footText}
        render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}

function TeamSummaryBlock({ summary }: { summary: Props["summary"] }) {
  return (
    <>
      <View style={s.sectionTitleRow}>
        <Text style={s.sectionTitle}>Sintesi team</Text>
        <View style={s.sectionLine} />
      </View>
      <View style={s.kpiGrid}>
        <View style={s.kpiCard}>
          <Text style={s.kpiLabel}>Incasso reale</Text>
          <Text style={s.kpiValue}>{pdfMoney(summary.incasso)}</Text>
        </View>
        <View style={s.kpiCard}>
          <Text style={s.kpiLabel}>Valore listino</Text>
          <Text style={s.kpiValue}>{pdfMoney(summary.listino)}</Text>
        </View>
        <View style={s.kpiCard}>
          <Text style={s.kpiLabel}>Sconti dati</Text>
          <Text style={s.kpiValue}>{pdfMoney(summary.sconti)}</Text>
        </View>
        <View style={s.kpiCard}>
          <Text style={s.kpiLabel}>Retail team</Text>
          <Text style={s.kpiValue}>{pdfRetailPct(summary.retail_pct)}</Text>
        </View>
        <View style={s.kpiCard}>
          <Text style={s.kpiLabel}>Ticket medio</Text>
          <Text style={s.kpiValue}>{pdfMoney(summary.avg_ticket)}</Text>
        </View>
        <View style={s.kpiCard}>
          <Text style={s.kpiLabel}>Collaboratori</Text>
          <Text style={s.kpiValue}>{String(summary.staff_count)}</Text>
        </View>
      </View>
    </>
  );
}

function ItemMiniList({
  title,
  items,
}: {
  title: string;
  items: Array<{ name: string; quantity: number; gross: number }>;
}) {
  return (
    <View style={{ flex: 1, minWidth: "45%" }}>
      <Text style={s.subSectionTitle}>{title}</Text>
      {items.length === 0 ? (
        <Text style={{ fontSize: 8, color: "#64748B" }}>Nessun dato nel periodo.</Text>
      ) : (
        items.map((it) => (
          <View style={s.listRow} key={`${title}-${it.name}`}>
            <Text style={{ fontSize: 8, width: "58%" }}>{pdfSafeStr(it.name, 48)}</Text>
            <Text style={{ fontSize: 8, width: "42%", textAlign: "right" }}>
              {it.quantity} · {pdfMoney(it.gross)}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

function StaffBlock({ block }: { block: TeamPdfStaffBlock }) {
  return (
    <View style={s.staffCard} wrap={false}>
      <View style={s.staffCardHead}>
        <View>
          <Text style={s.staffName}>{block.staff_name}</Text>
          <Text style={s.staffRank}>Collaboratore #{block.rank}</Text>
        </View>
        <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: "#9D3D27" }}>
          {pdfMoney(block.incassato)}
        </Text>
      </View>
      <View style={s.staffBody}>
        <View style={s.metricsRow}>
          {[
            { l: "Listino", v: pdfMoney(block.listino) },
            { l: "Sconti", v: pdfMoney(block.sconti) },
            { l: "Sconto %", v: `${block.sconto_pct.toFixed(1)}%` },
            { l: "Ticket medio", v: pdfMoney(block.ticket_medio) },
            { l: "Retail €", v: pdfMoney(block.retail_eur) },
            { l: "Retail %", v: pdfRetailPct(block.retail_pct) },
            { l: "Clienti", v: String(block.clienti_serviti) },
            {
              l: "Scontrini scontati",
              v: `${block.discounted_receipts}/${block.total_receipts}`,
            },
          ].map((m) => (
            <View style={s.metricPill} key={m.l}>
              <Text style={s.metricLabel}>{m.l}</Text>
              <Text style={s.metricValue}>{m.v}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <ItemMiniList title="Top servizi" items={block.topServices} />
          <ItemMiniList title="Top prodotti" items={block.topProducts} />
        </View>

        {block.badges.length > 0 ? (
          <View style={s.badgeRow}>
            {block.badges.map((b) => {
              const extraStyle =
                b.id === "low_ticket" ? s.badgeWarn : b.id === "low_retail" ? s.badgeMuted : s.badge;
              return (
                <Text key={b.id} style={extraStyle}>
                  {b.label}
                </Text>
              );
            })}
          </View>
        ) : (
          <Text style={{ marginTop: 6, fontSize: 8, color: "#64748B" }}>
            Nessun alert operativo nel periodo.
          </Text>
        )}
      </View>
    </View>
  );
}

function chunkStaff(staff: TeamPdfStaffBlock[], size: number): TeamPdfStaffBlock[][] {
  const out: TeamPdfStaffBlock[][] = [];
  for (let i = 0; i < staff.length; i += size) {
    out.push(staff.slice(i, i + size));
  }
  return out;
}

export default function TeamReportPdf(props: Props) {
  const staffChunks = chunkStaff(props.staff, 2);

  return (
    <Document title={`Report Team — ${props.salonName}`}>
      <Page size="A4" style={s.page}>
        <PdfHeader
          title="Report Team · Performance collaboratori"
          salonName={props.salonName}
          salonId={props.salonId}
          dateFrom={props.dateFrom}
          dateTo={props.dateTo}
          generatedAt={props.generatedAt}
          vatModeLabel={props.vatModeLabel}
        />
        <TeamSummaryBlock summary={props.summary} />
        {props.staff.length === 0 ? (
          <Text style={{ color: "#64748B", marginTop: 12 }}>
            Nessun dato team nel periodo selezionato.
          </Text>
        ) : null}
        <PdfFooter />
      </Page>

      {staffChunks.map((chunk, pageIdx) => (
        <Page size="A4" style={s.page} key={`staff-page-${pageIdx}`}>
          {pageIdx === 0 ? (
            <View style={s.sectionTitleRow}>
              <Text style={s.sectionTitle}>Dettaglio collaboratori</Text>
              <View style={s.sectionLine} />
            </View>
          ) : null}
          {chunk.map((block) => (
            <StaffBlock block={block} key={block.staff_id} />
          ))}
          <PdfFooter />
        </Page>
      ))}
    </Document>
  );
}
