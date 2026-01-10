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
  // campi extra ammessi (es. discount_total, salon_id, ecc.)
  [key: string]: any;
};

type Props = {
  salonName: string;
  dateFrom: string;
  dateTo: string;
  totals: Totals;
  rows: Row[];
};

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#111",
  },
  header: { marginBottom: 20 },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 10,
    marginTop: 4,
    color: "#555",
  },
  totalsBox: {
    marginVertical: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: "#000",
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    paddingBottom: 6,
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
  },
  colDate: { width: "20%" },
  colDesc: { width: "40%" },
  colStaff: { width: "20%" },
  colAmount: { width: "20%", textAlign: "right" },
  footer: {
    marginTop: 24,
    fontSize: 9,
    color: "#777",
    textAlign: "center",
  },
});

function money(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toFixed(2) + " EUR";
}

export default function SalonTurnoverPdf({
  salonName,
  dateFrom,
  dateTo,
  totals,
  rows,
}: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>SCARAMUZZO MANAGER</Text>
          <Text style={styles.subtitle}>
            {salonName} - Fatturato Salone
          </Text>
          <Text style={styles.subtitle}>
            Periodo: {dateFrom} - {dateTo}
          </Text>
        </View>

        <View style={styles.totalsBox}>
          <View style={styles.totalsRow}>
            <Text>Netto</Text>
            <Text>{money(totals.net_total)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text>IVA</Text>
            <Text>{money(totals.vat_total)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text>Lordo</Text>
            <Text>{money(totals.gross_total)}</Text>
          </View>
        </View>

        <View style={styles.tableHeader}>
          <Text style={styles.colDate}>Data</Text>
          <Text style={styles.colDesc}>Descrizione</Text>
          <Text style={styles.colStaff}>Staff</Text>
          <Text style={styles.colAmount}>Netto</Text>
        </View>

        {rows.length === 0 ? (
          <Text>Nessuna vendita nel periodo selezionato.</Text>
        ) : (
          rows.map((r, i) => (
            <View key={i} style={styles.row}>
              <Text style={styles.colDate}>{r.date}</Text>
              <Text style={styles.colDesc}>{r.description}</Text>
              <Text style={styles.colStaff}>{r.staff_name ?? "-"}</Text>
              <Text style={styles.colAmount}>{money(r.net_total)}</Text>
            </View>
          ))
        )}

        <Text style={styles.footer}>
          Documento generato automaticamente - Scaramuzzo Manager
        </Text>
      </Page>
    </Document>
  );
}
