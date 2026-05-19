/**
 * Dry-run audit for Boss customer CSV export (no DB import).
 * Usage: npm run audit:boss-customers
 */

const { readFileSync, writeFileSync, mkdirSync } = require("node:fs") as typeof import("node:fs");
const { dirname, join } = require("node:path") as typeof import("node:path");

const REPO_ROOT = process.cwd();
const CSV_PATH = join(REPO_ROOT, "data/imports/clienti-boss-raw.csv");
const REPORT_PATH = join(REPO_ROOT, "data/imports/clienti-boss-audit-report.json");

const FAKE_BIRTH_PATTERNS = new Set(["01/01/1900", "1/1/1900"]);

type SessoBucket = "M" | "F" | "vuoto" | "altro";

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

function parseCsvSemicolon(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ";") {
      row.push(field);
      field = "";
      continue;
    }

    if (ch === "\n" || (ch === "\r" && next === "\n")) {
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") {
        rows.push(row);
      }
      row = [];
      if (ch === "\r") i++;
      continue;
    }

    if (ch === "\r") {
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") {
        rows.push(row);
      }
      row = [];
      continue;
    }

    field += ch;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function normalizeHeaderName(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function findColumnIndex(headers: string[], ...names: string[]): number {
  const normalized = headers.map(normalizeHeaderName);
  for (const name of names) {
    const target = normalizeHeaderName(name);
    const idx = normalized.indexOf(target);
    if (idx >= 0) return idx;
  }
  return -1;
}

function getField(row: string[], index: number): string {
  if (index < 0 || index >= row.length) return "";
  return row[index]?.trim() ?? "";
}

function normalizeNominativo(raw: string): { display: string; key: string } {
  const display = raw.trim().replace(/\s+/g, " ");
  const key = display.toUpperCase();
  return { display, key };
}

function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!email) return null;
  if (!email.includes("@")) return null;
  return email;
}

function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hadPlus39 = /\+39\b/i.test(trimmed) || /^0039/.test(trimmed.replace(/\s/g, ""));
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (hadPlus39) {
    const local = digits.startsWith("39") ? digits.slice(2) : digits;
    return local ? `+39${local}` : null;
  }

  return digits;
}

function parseItalianDate(raw: string): Date | null {
  const t = raw.trim();
  if (!t) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!m) return null;

  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}

function isFakeBirthDate(raw: string): boolean {
  const compact = raw.trim().replace(/\s+/g, "");
  if (FAKE_BIRTH_PATTERNS.has(compact)) return true;
  const normalized = compact.replace(/^0(\d)\//, "$1/").replace(/\/0(\d)\//, "/$1/");
  return FAKE_BIRTH_PATTERNS.has(normalized);
}

function parseValido(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (v === "true" || v === "1" || v === "si" || v === "sì" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return null;
}

function classifySesso(raw: string): SessoBucket {
  const s = raw.trim().toUpperCase();
  if (!s) return "vuoto";
  if (s === "M" || s === "MASCHIO") return "M";
  if (s === "F" || s === "FEMMINA") return "F";
  return "altro";
}

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

  const colNominativo = findColumnIndex(headers, "nominativo");
  const colCellulare = findColumnIndex(headers, "cellulare");
  const colTelefono = findColumnIndex(headers, "telefono");
  const colEmail = findColumnIndex(headers, "email");
  const colSesso = findColumnIndex(headers, "sesso");
  const colValido = findColumnIndex(headers, "valido");
  const colDataNascita = findColumnIndex(headers, "data di nascita", "data nascita");

  const normalizedRows: NormalizedRow[] = dataRows.map((row) => {
    const { display, key } = normalizeNominativo(getField(row, colNominativo));
    const email = normalizeEmail(getField(row, colEmail));
    const cellulare = normalizePhone(getField(row, colCellulare));
    const telefono = normalizePhone(getField(row, colTelefono));
    const phones = [...new Set([cellulare, telefono].filter((p): p is string => Boolean(p)))];
    const dataNascitaRaw = getField(row, colDataNascita);
    const parsedBirth = parseItalianDate(dataNascitaRaw);

    return {
      nominativo: display,
      nominativoKey: key,
      email,
      cellulare,
      telefono,
      phones,
      sesso: classifySesso(getField(row, colSesso)),
      valido: parseValido(getField(row, colValido)),
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
      indices: {
        nominativo: colNominativo,
        cellulare: colCellulare,
        telefono: colTelefono,
        email: colEmail,
        sesso: colSesso,
        valido: colValido,
        dataNascita: colDataNascita,
      },
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
