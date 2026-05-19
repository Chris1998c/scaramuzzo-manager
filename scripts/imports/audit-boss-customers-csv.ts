/**
 * Dry-run audit for Boss customer CSV export (no DB import).
 * Usage: npm run audit:boss-customers
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type SessoBucket,
  classifySesso,
  getField,
  isFakeBirthDate,
  normalizeEmail,
  normalizeNominativo,
  normalizePhone,
  parseCsvSemicolon,
  parseItalianDate,
  parseValido,
  resolveBossCsvColumns,
} from "./bossCustomersCsvParse.ts";

const REPO_ROOT = process.cwd();
const CSV_PATH = join(REPO_ROOT, "data/imports/clienti-boss-raw.csv");
const REPORT_PATH = join(REPO_ROOT, "data/imports/clienti-boss-audit-report.json");

type NormalizedRow = {
  nominativo: string;
  nominativoKey: string;
  email: string | null;
  cellulare: string | null;
  telefono: string | null;
  phones: string[];
  sesso: SessoBucket;
  valido: boolean | null;
  dataNascitaRaw: string;
  birthDateValid: boolean;
  birthDateFake: boolean;
};

type DuplicateExample = {
  key: string;
  count: number;
  sampleNominativi: string[];
};

function maskNominativo(key: string): string {
  if (!key) return "(vuoto)";
  if (key.length <= 4) return `${key[0]}***`;
  return `${key.slice(0, 4)}*** (${key.length} char)`;
}

function maskPhone(phone: string): string {
  if (phone.length <= 4) return "***";
  return `***${phone.slice(-4)}`;
}

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***@***";
  return `***${email.slice(at)}`;
}

function maskDuplicateKey(key: string): string {
  if (key.includes("@")) return maskEmail(key);
  if (/^\+?\d+$/.test(key)) return maskPhone(key);
  return maskNominativo(key);
}

function previewRow(row: NormalizedRow): Record<string, unknown> {
  return {
    nominativo: maskNominativo(row.nominativoKey),
    hasEmail: Boolean(row.email),
    emailDomain: row.email?.includes("@") ? row.email.split("@")[1] : null,
    hasCellulare: Boolean(row.cellulare),
    hasTelefono: Boolean(row.telefono),
    phoneHints: row.phones.map(maskPhone),
    sesso: row.sesso,
    valido: row.valido,
    birthDateValid: row.birthDateValid,
    birthDateFake: row.birthDateFake,
  };
}

function topDuplicates(
  counts: Map<string, number>,
  nominativiByKey: Map<string, Set<string>>,
  limit: number,
): DuplicateExample[] {
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({
      key: maskDuplicateKey(key),
      count,
      sampleNominativi: [...(nominativiByKey.get(key) ?? [])]
        .slice(0, 3)
        .map((n) => maskNominativo(n)),
    }));
}

function countDuplicateRecords(counts: Map<string, number>): number {
  let total = 0;
  for (const count of counts.values()) {
    if (count > 1) total += count;
  }
  return total;
}

function countDuplicateKeys(counts: Map<string, number>): number {
  let keys = 0;
  for (const count of counts.values()) {
    if (count > 1) keys++;
  }
  return keys;
}

function runBossCustomersCsvAudit(): void {
  let raw: string;
  try {
    raw = readFileSync(CSV_PATH, "utf8");
  } catch {
    console.error(`File non trovato: ${CSV_PATH}`);
    console.error("Copia l'export Boss in data/imports/clienti-boss-raw.csv");
    process.exit(1);
  }

  const parsed = parseCsvSemicolon(raw.replace(/^\uFEFF/, ""));
  if (parsed.length === 0) {
    console.error("CSV vuoto.");
    process.exit(1);
  }

  const headers = parsed[0];
  const dataRows = parsed.slice(1).filter((r) => r.some((c) => c.trim() !== ""));

  const cols = resolveBossCsvColumns(headers);

  const normalizedRows: NormalizedRow[] = dataRows.map((row) => {
    const { display, key } = normalizeNominativo(getField(row, cols.nominativo));
    const email = normalizeEmail(getField(row, cols.email));
    const cellulare = normalizePhone(getField(row, cols.cellulare));
    const telefono = normalizePhone(getField(row, cols.telefono));
    const phones = [...new Set([cellulare, telefono].filter((p): p is string => Boolean(p)))];
    const dataNascitaRaw = getField(row, cols.dataNascita);
    const parsedBirth = parseItalianDate(dataNascitaRaw);

    return {
      nominativo: display,
      nominativoKey: key,
      email,
      cellulare,
      telefono,
      phones,
      sesso: classifySesso(getField(row, cols.sesso)),
      valido: parseValido(getField(row, cols.valido)),
      dataNascitaRaw,
      birthDateValid: parsedBirth !== null && !isFakeBirthDate(dataNascitaRaw),
      birthDateFake: isFakeBirthDate(dataNascitaRaw),
    };
  });

  let emptyNominativo = 0;
  let withPhone = 0;
  let withEmail = 0;
  let validBirth = 0;
  let fakeBirth = 0;

  const sessoDist: Record<SessoBucket, number> = { M: 0, F: 0, vuoto: 0, altro: 0 };
  const validoDist = { true: 0, false: 0, unknown: 0 };

  const phoneCounts = new Map<string, number>();
  const emailCounts = new Map<string, number>();
  const nameCounts = new Map<string, number>();
  const nominativiByPhone = new Map<string, Set<string>>();
  const nominativiByEmail = new Map<string, Set<string>>();
  const nominativiByName = new Map<string, Set<string>>();

  for (const row of normalizedRows) {
    if (!row.nominativoKey) emptyNominativo++;
    if (row.phones.length > 0) withPhone++;
    if (row.email) withEmail++;
    if (row.birthDateValid) validBirth++;
    if (row.birthDateFake) fakeBirth++;

    sessoDist[row.sesso]++;

    if (row.valido === true) validoDist.true++;
    else if (row.valido === false) validoDist.false++;
    else validoDist.unknown++;

    for (const phone of row.phones) {
      phoneCounts.set(phone, (phoneCounts.get(phone) ?? 0) + 1);
      if (!nominativiByPhone.has(phone)) nominativiByPhone.set(phone, new Set());
      nominativiByPhone.get(phone)!.add(row.nominativoKey || "(vuoto)");
    }

    if (row.email) {
      emailCounts.set(row.email, (emailCounts.get(row.email) ?? 0) + 1);
      if (!nominativiByEmail.has(row.email)) nominativiByEmail.set(row.email, new Set());
      nominativiByEmail.get(row.email)!.add(row.nominativoKey || "(vuoto)");
    }

    if (row.nominativoKey) {
      nameCounts.set(row.nominativoKey, (nameCounts.get(row.nominativoKey) ?? 0) + 1);
      if (!nominativiByName.has(row.nominativoKey)) nominativiByName.set(row.nominativoKey, new Set());
      nominativiByName.get(row.nominativoKey)!.add(row.nominativoKey);
    }
  }

  const topPhoneDupes = topDuplicates(phoneCounts, nominativiByPhone, 20);
  const topEmailDupes = topDuplicates(emailCounts, nominativiByEmail, 20);
  const topNameDupes = topDuplicates(nameCounts, nominativiByName, 20);

  const report = {
    generatedAt: new Date().toISOString(),
    sourceFile: "data/imports/clienti-boss-raw.csv",
    totals: {
      csvRowsIncludingHeader: parsed.length,
      dataRows: dataRows.length,
      normalizedRecords: normalizedRows.length,
    },
    columns: {
      detected: headers,
      indices: cols,
    },
    quality: {
      emptyNominativo,
      withPhoneOrCellulare: withPhone,
      withEmail,
      validBirthDate: validBirth,
      fakeBirthDate1900: fakeBirth,
      sessoDistribution: sessoDist,
      validoDistribution: validoDist,
    },
    duplicates: {
      phone: {
        duplicateKeys: countDuplicateKeys(phoneCounts),
        recordsInvolved: countDuplicateRecords(phoneCounts),
        top20: topPhoneDupes,
      },
      email: {
        duplicateKeys: countDuplicateKeys(emailCounts),
        recordsInvolved: countDuplicateRecords(emailCounts),
        top20: topEmailDupes,
      },
      nominativo: {
        duplicateKeys: countDuplicateKeys(nameCounts),
        recordsInvolved: countDuplicateRecords(nameCounts),
        top20: topNameDupes,
      },
    },
    preview: normalizedRows.slice(0, 5).map(previewRow),
  };

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("=== Audit CSV clienti Boss (DRY-RUN) ===\n");
  console.log(`Righe CSV (con header): ${report.totals.csvRowsIncludingHeader}`);
  console.log(`Record dati: ${report.totals.dataRows}`);
  console.log(`Colonne rilevate (${headers.length}): ${headers.join(" | ")}\n`);

  console.log("Indici colonne usate:");
  console.log(JSON.stringify(report.columns.indices, null, 2));

  console.log("\nPreview (5 righe, dati mascherati):");
  console.log(JSON.stringify(report.preview, null, 2));

  console.log("\n--- Qualità dati ---");
  console.log(`Nominativo vuoto: ${emptyNominativo}`);
  console.log(`Con telefono/cellulare: ${withPhone}`);
  console.log(`Con email: ${withEmail}`);
  console.log(`Data nascita valida (escl. fake): ${validBirth}`);
  console.log(`Data nascita fake (01/01/1900): ${fakeBirth}`);
  console.log(`Sesso: M=${sessoDist.M} F=${sessoDist.F} vuoto=${sessoDist.vuoto} altro=${sessoDist.altro}`);
  console.log(
    `Valido: true=${validoDist.true} false=${validoDist.false} sconosciuto=${validoDist.unknown}`,
  );

  console.log("\n--- Duplicati (stesso valore normalizzato su più record) ---");
  console.log(
    `Telefono: ${report.duplicates.phone.duplicateKeys} chiavi duplicate, ${report.duplicates.phone.recordsInvolved} record coinvolti`,
  );
  console.log(
    `Email: ${report.duplicates.email.duplicateKeys} chiavi duplicate, ${report.duplicates.email.recordsInvolved} record coinvolti`,
  );
  console.log(
    `Nominativo: ${report.duplicates.nominativo.duplicateKeys} chiavi duplicate, ${report.duplicates.nominativo.recordsInvolved} record coinvolti`,
  );

  console.log("\nTop telefoni duplicati (mascherati):");
  for (const d of topPhoneDupes.slice(0, 10)) {
    console.log(`  ${d.key} → ${d.count} record`);
  }
  if (topPhoneDupes.length > 10) console.log(`  … altri ${topPhoneDupes.length - 10} nel report JSON`);

  console.log("\nTop email duplicate (mascherate):");
  for (const d of topEmailDupes.slice(0, 10)) {
    console.log(`  ${d.key} → ${d.count} record`);
  }
  if (topEmailDupes.length > 10) console.log(`  … altri ${topEmailDupes.length - 10} nel report JSON`);

  console.log(`\nReport JSON: ${REPORT_PATH}`);
}

runBossCustomersCsvAudit();
