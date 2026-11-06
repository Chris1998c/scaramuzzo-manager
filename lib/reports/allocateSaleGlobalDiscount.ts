/**
 * Ripartizione sconto globale vendita sulle righe (metodo dei maggiori resti / Hamilton).
 *
 * - base riga = netto dopo sconto di riga (`price*qty - lineDiscount`), in centesimi;
 * - pool = max(0, Σbasi − saleTotal) oppure `explicitGlobal` (clamp ≥ 0, cap Σbasi);
 * - quote floor proporzionali + centesimi residui alle frazioni più alte;
 * - spareggio stabile: remainder DESC, poi `lineId` ASC (sale_item_id / indice);
 * - base 0 → quota 0; ogni quota ∈ [0, base];
 * - se saleTotal > Σbasi (maggiorazione / dato incoerente) → pool 0 + anomalia, senza inventare sconti.
 *
 * Allineata 1:1 alla SQL in `20261106180000_report_rows_allocate_global_discount.sql`.
 */

export function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function toCents(n: number): number {
  return Math.round(roundMoney2(toFinite(n)) * 100);
}

export function fromCents(cents: number): number {
  return roundMoney2(cents / 100);
}

export type SaleLineDiscountInput = {
  price: number;
  quantity: number;
  /** Sconto di riga già persistito su sale_items.discount (€). */
  lineDiscount: number;
  /**
   * Chiave stabile per spareggio (sale_item_id in report; indice 0..n-1 in cassa).
   * Default: indice nella lista.
   */
  lineId?: number;
};

export type SaleDiscountAnomaly =
  | "sale_total_exceeds_line_bases"
  | "explicit_global_exceeds_line_bases"
  | "negative_sale_total_clamped";

export type AllocatedSaleLineDiscount = {
  lineId: number;
  baseNet: number;
  globalShare: number;
  itemDiscount: number;
  lineTotalGross: number;
};

export type AllocateSaleGlobalDiscountResult = {
  lines: AllocatedSaleLineDiscount[];
  globalPool: number;
  basesSum: number;
  anomalies: SaleDiscountAnomaly[];
};

function toFinite(n: unknown, fallback = 0): number {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

/** Netto riga dopo sconto di riga, prima dello sconto globale. */
export function lineBaseNetAfterLineDiscount(line: SaleLineDiscountInput): number {
  const price = toFinite(line.price);
  const qty = toFinite(line.quantity);
  const lineDisc = Math.max(0, toFinite(line.lineDiscount));
  return roundMoney2(Math.max(0, price * qty - lineDisc));
}

export function resolveGlobalDiscountPool(args: {
  basesSum: number;
  saleTotal: number;
  explicitGlobal?: number;
}): { pool: number; anomalies: SaleDiscountAnomaly[] } {
  const anomalies: SaleDiscountAnomaly[] = [];
  const bases = roundMoney2(Math.max(0, toFinite(args.basesSum)));
  let total = toFinite(args.saleTotal);
  if (total < 0) {
    anomalies.push("negative_sale_total_clamped");
    total = 0;
  }
  total = roundMoney2(total);

  if (total > bases) {
    anomalies.push("sale_total_exceeds_line_bases");
  }

  let pool: number;
  if (args.explicitGlobal != null && Number.isFinite(args.explicitGlobal)) {
    pool = roundMoney2(Math.max(0, toFinite(args.explicitGlobal)));
    if (pool > bases) {
      anomalies.push("explicit_global_exceeds_line_bases");
      pool = bases;
    }
  } else {
    pool = roundMoney2(Math.max(0, bases - total));
  }

  return { pool, anomalies };
}

/**
 * Quote in € con Hamilton su centesimi.
 * `lineIds[i]` allinea lo spareggio a SQL (`ORDER BY rem DESC, sale_item_id ASC`).
 */
export function allocateGlobalDiscountShares(
  baseNets: number[],
  globalPool: number,
  lineIds?: number[],
): number[] {
  const n = baseNets.length;
  if (!n) return [];

  const ids = lineIds?.length === n ? lineIds.map((id) => Number(id)) : baseNets.map((_, i) => i);
  const baseCents = baseNets.map((b) => Math.max(0, toCents(b)));
  const basesSumCents = baseCents.reduce((a, b) => a + b, 0);
  let poolCents = Math.max(0, toCents(globalPool));
  if (poolCents > basesSumCents) poolCents = basesSumCents;

  if (poolCents <= 0 || basesSumCents <= 0) {
    return baseCents.map(() => 0);
  }

  const floorCents = baseCents.map((bc) => {
    if (bc <= 0) return 0;
    return Math.min(bc, Math.floor((poolCents * bc) / basesSumCents));
  });

  let assigned = floorCents.reduce((a, b) => a + b, 0);
  let leftover = poolCents - assigned;

  const rem = baseCents.map((bc, i) => {
    if (bc <= 0) return 0;
    return (poolCents * bc) % basesSumCents;
  });

  const eligible = floorCents
    .map((fc, i) => ({
      i,
      id: ids[i],
      rem: rem[i],
      capacity: baseCents[i] - fc,
    }))
    .filter((e) => e.capacity > 0)
    .sort((a, b) => {
      if (b.rem !== a.rem) return b.rem - a.rem;
      if (a.id !== b.id) return a.id - b.id;
      return a.i - b.i;
    });

  const shares = floorCents.slice();
  for (const e of eligible) {
    if (leftover <= 0) break;
    shares[e.i] += 1;
    leftover -= 1;
  }

  return shares.map(fromCents);
}

/**
 * Attribuisce sconto globale alle righe. Non forza drift su righe gratuite.
 */
export function allocateSaleGlobalDiscount(args: {
  lines: SaleLineDiscountInput[];
  saleTotal: number;
  explicitGlobal?: number;
}): AllocateSaleGlobalDiscountResult {
  const { lines, saleTotal, explicitGlobal } = args;
  if (!lines.length) {
    return { lines: [], globalPool: 0, basesSum: 0, anomalies: [] };
  }

  const resolvedIds = lines.map((line, i) =>
    line.lineId != null && Number.isFinite(Number(line.lineId))
      ? Number(line.lineId)
      : i,
  );
  const bases = lines.map(lineBaseNetAfterLineDiscount);
  const basesSum = roundMoney2(bases.reduce((a, b) => a + b, 0));
  const { pool, anomalies } = resolveGlobalDiscountPool({
    basesSum,
    saleTotal,
    explicitGlobal,
  });
  const shares = allocateGlobalDiscountShares(bases, pool, resolvedIds);

  const allocatedLines: AllocatedSaleLineDiscount[] = lines.map((line, i) => {
    const price = toFinite(line.price);
    const qty = toFinite(line.quantity);
    const full = roundMoney2(price * qty);
    const baseNet = bases[i] ?? 0;
    const globalShare = shares[i] ?? 0;
    const lineTotalGross = roundMoney2(baseNet - globalShare);
    const itemDiscount = roundMoney2(Math.max(0, full - lineTotalGross));
    return {
      lineId: resolvedIds[i],
      baseNet,
      globalShare,
      itemDiscount,
      lineTotalGross,
    };
  });

  return {
    lines: allocatedLines,
    globalPool: pool,
    basesSum,
    anomalies,
  };
}
