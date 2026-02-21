"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";

type TurnoverTotals = {
  salon_id: number;
  date_from: string;
  date_to: string;
  receipts_count: number;
  gross_total: number;
  net_total: number;
  vat_total: number;
  discount_total: number;
  gross_cash: number;
  gross_card: number;
  gross_services: number;
  gross_products: number;
};

type ReportRow = {
  sale_item_id: number;
  sale_id: number;
  salon_id: number;
  sale_day: string; // date
  payment_method: string; // cash|card
  staff_id: number | null;
  staff_name: string | null;
  product_id: number | null;
  product_name: string | null;
  service_id: number | null;
  service_name: string | null;
  item_type: string; // service|product
  quantity: number | null;
  price: number;
  item_discount: number | null;
  vat_rate: number | null;
  line_total_gross: number;
  line_net: number;
  line_vat: number;
};

type StaffOption = { id: number; name: string };

type TabKey =
  | "turnover"
  | "daily"
  | "payments"
  | "top"
  | "staff";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfMonthISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function money(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0,00 €";
  return v.toFixed(2).replace(".", ",") + " €";
}

function pct(part: number, total: number) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return "0%";
  return Math.round((part / total) * 100) + "%";
}

export default function ReportPage() {
  const supabase = useMemo(() => createClient(), []);
  const { activeSalonId, isReady } = useActiveSalon();
  const salonId = activeSalonId ?? 0;

  const [tab, setTab] = useState<TabKey>("turnover");

  const [dateFrom, setDateFrom] = useState(startOfMonthISO());
  const [dateTo, setDateTo] = useState(todayISO());

  const [staffId, setStaffId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [itemType, setItemType] = useState<string>("");

  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [totals, setTotals] = useState<TurnoverTotals | null>(null);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [rowsAll, setRowsAll] = useState<ReportRow[]>([]);

  const canRun =
    isReady &&
    Number.isFinite(salonId) &&
    salonId > 0 &&
    !!dateFrom &&
    !!dateTo;

  // Staff filter (non blocca pagina se RLS/seed ancora povero)
  useEffect(() => {
    if (!isReady || salonId <= 0) return;

    (async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id,name")
        .eq("salon_id", salonId)
        .order("name", { ascending: true });

      if (error) return;
      const opts = (data ?? [])
        .filter((s: any) => s?.id != null)
        .map((s: any) => ({
          id: Number(s.id),
          name: String(s.name ?? `Staff ${s.id}`),
        }));
      setStaffOptions(opts);
    })();
  }, [supabase, isReady, salonId]);

  async function runReport() {
    if (!canRun) return;

    setLoading(true);
    setErr(null);

    const pStaffId = staffId ? Number(staffId) : null;

    try {
      // Totali (RPC)
      const { data: tData, error: tErr } = await supabase.rpc("report_turnover", {
        p_salon_id: salonId,
        p_from: dateFrom,
        p_to: dateTo,
        p_staff_id: pStaffId,
        p_payment_method: paymentMethod || null,
        p_item_type: itemType || null,
      });

      if (tErr) throw new Error(tErr.message);

      const t0 = Array.isArray(tData) && tData.length > 0 ? tData[0] : null;
      setTotals(
        t0 ?? {
          salon_id: salonId,
          date_from: dateFrom,
          date_to: dateTo,
          receipts_count: 0,
          gross_total: 0,
          net_total: 0,
          vat_total: 0,
          discount_total: 0,
          gross_cash: 0,
          gross_card: 0,
          gross_services: 0,
          gross_products: 0,
        }
      );

      // Righe (RPC) — prendiamo “tante” per i report interni (andamento/top/staff)
      const { data: rData, error: rErr } = await supabase.rpc("report_rows", {
        p_salon_id: salonId,
        p_from: dateFrom,
        p_to: dateTo,
        p_staff_id: pStaffId,
        p_payment_method: paymentMethod || null,
        p_item_type: itemType || null,
      });

      if (rErr) throw new Error(rErr.message);

      const list = (rData ?? []) as any[];
      const normalized = list as ReportRow[];

      // ✅ per UI: preview tabella dettagli “umana”
      setRows(normalized.slice(0, 400));
      // ✅ per calcoli: teniamo più righe (se un giorno saranno migliaia, tanto scarichi CSV/PDF)
      setRowsAll(normalized.slice(0, 5000));
    } catch (e: any) {
      setErr(e?.message ?? "Errore report");
      setTotals(null);
      setRows([]);
      setRowsAll([]);
    } finally {
      setLoading(false);
    }
  }

  // auto refresh su range/salone
  useEffect(() => {
    if (!canRun) return;
    runReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonId, dateFrom, dateTo]);

  function buildQuery() {
    const p = new URLSearchParams();
    p.set("salon_id", String(salonId));
    p.set("date_from", dateFrom);
    p.set("date_to", dateTo);
    if (staffId) p.set("staff_id", staffId);
    if (paymentMethod) p.set("payment_method", paymentMethod);
    if (itemType) p.set("item_type", itemType);
    return p.toString();
  }

  function downloadPdf() {
    if (!canRun) return;
    window.open(`/api/reports/salon-turnover/pdf?${buildQuery()}`, "_blank", "noopener,noreferrer");
  }

  function downloadCsv() {
    if (!canRun) return;
    window.open(`/api/reports/salon-turnover/csv?${buildQuery()}`, "_blank", "noopener,noreferrer");
  }

  // ====== REPORT DERIVATI (client, veloci, zero SQL extra) ======
  const daily = useMemo(() => {
    const map = new Map<
      string,
      {
        day: string;
        receipts: Set<number>;
        gross: number;
        net: number;
        vat: number;
        disc: number;
        cash: number;
        card: number;
      }
    >();

    for (const r of rowsAll) {
      const day = String(r.sale_day ?? "");
      if (!day) continue;

      if (!map.has(day)) {
        map.set(day, {
          day,
          receipts: new Set<number>(),
          gross: 0,
          net: 0,
          vat: 0,
          disc: 0,
          cash: 0,
          card: 0,
        });
      }

      const x = map.get(day)!;
      x.receipts.add(Number(r.sale_id));
      x.gross += Number(r.line_total_gross ?? 0);
      x.net += Number(r.line_net ?? 0);
      x.vat += Number(r.line_vat ?? 0);
      x.disc += Number(r.item_discount ?? 0);

      if (r.payment_method === "cash") x.cash += Number(r.line_total_gross ?? 0);
      if (r.payment_method === "card") x.card += Number(r.line_total_gross ?? 0);
    }

    return Array.from(map.values())
      .sort((a, b) => (a.day < b.day ? -1 : 1))
      .map((x) => ({
        day: x.day,
        receipts_count: x.receipts.size,
        gross_total: x.gross,
        net_total: x.net,
        vat_total: x.vat,
        discount_total: x.disc,
        gross_cash: x.cash,
        gross_card: x.card,
      }));
  }, [rowsAll]);

  const topItems = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        item_type: string;
        name: string;
        qty: number;
        gross: number;
        net: number;
      }
    >();

    for (const r of rowsAll) {
      const name =
        r.item_type === "product"
          ? String(r.product_name ?? "Prodotto")
          : String(r.service_name ?? "Servizio");

      const key = `${r.item_type}::${name}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          item_type: String(r.item_type ?? ""),
          name,
          qty: 0,
          gross: 0,
          net: 0,
        });
      }

      const x = map.get(key)!;
      x.qty += Number(r.quantity ?? 1);
      x.gross += Number(r.line_total_gross ?? 0);
      x.net += Number(r.line_net ?? 0);
    }

    return Array.from(map.values()).sort((a, b) => b.gross - a.gross).slice(0, 15);
  }, [rowsAll]);

  const staffPerf = useMemo(() => {
    const map = new Map<
      string,
      {
        staff_id: number;
        staff_name: string;
        receipts: Set<number>;
        gross: number;
        net: number;
        services: number;
        products: number;
      }
    >();

    for (const r of rowsAll) {
      const sid = Number(r.staff_id ?? 0);
      const sname = String(r.staff_name ?? (sid ? `Staff ${sid}` : "—"));

      const key = `${sid}::${sname}`;
      if (!map.has(key)) {
        map.set(key, {
          staff_id: sid,
          staff_name: sname,
          receipts: new Set<number>(),
          gross: 0,
          net: 0,
          services: 0,
          products: 0,
        });
      }

      const x = map.get(key)!;
      x.receipts.add(Number(r.sale_id));
      x.gross += Number(r.line_total_gross ?? 0);
      x.net += Number(r.line_net ?? 0);
      if (r.item_type === "service") x.services += Number(r.line_total_gross ?? 0);
      if (r.item_type === "product") x.products += Number(r.line_total_gross ?? 0);
    }

    return Array.from(map.values())
      .filter((x) => x.staff_id !== 0) // togli righe senza staff
      .sort((a, b) => b.gross - a.gross)
      .slice(0, 20)
      .map((x) => ({
        staff_id: x.staff_id,
        staff_name: x.staff_name,
        receipts_count: x.receipts.size,
        gross_total: x.gross,
        net_total: x.net,
        gross_services: x.services,
        gross_products: x.products,
      }));
  }, [rowsAll]);

  const paySplit = useMemo(() => {
    const gross = Number(totals?.gross_total ?? 0);
    const cash = Number(totals?.gross_cash ?? 0);
    const card = Number(totals?.gross_card ?? 0);
    return { gross, cash, card };
  }, [totals]);

  // ====== UI helpers (premium) ======
  const shell = "bg-scz-dark border border-white/10 rounded-2xl shadow-premium";
  const label = "text-[10px] font-black tracking-[0.25em] uppercase text-white/35";
  const title = "text-xl font-extrabold tracking-tight text-scz-gold";
  const sub = "text-sm text-white/55";
  const btn =
    "px-3 py-2 rounded-xl border border-white/10 bg-black/25 hover:bg-black/35 text-white/80 font-bold disabled:opacity-50";
  const chipBase =
    "px-3 py-2 rounded-xl border text-sm font-black tracking-wide transition";
  const chipActive =
    "bg-scz-medium/55 border-white/10 text-white";
  const chipIdle =
    "bg-black/20 border-transparent text-white/55 hover:bg-scz-medium/25 hover:border-white/10";

  return (
    <div className="p-6 space-y-6">
      {/* HEADER */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className={label}>REPORTING</div>
          <h1 className={title}>Report</h1>
          <p className={sub}>
            Una pagina sola, 5 report utili. PDF + Excel come Boss, ma Scaramuzzo enterprise.
          </p>
        </div>

        <div className="flex gap-2">
          <button onClick={downloadPdf} disabled={!canRun} className={btn}>
            Scarica PDF
          </button>
          <button onClick={downloadCsv} disabled={!canRun} className={btn}>
            Scarica Excel
          </button>
        </div>
      </div>

      {/* TABS (stile premium) */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setTab("turnover")}
          className={[chipBase, tab === "turnover" ? chipActive : chipIdle].join(" ")}
        >
          Fatturato
        </button>
        <button
          onClick={() => setTab("daily")}
          className={[chipBase, tab === "daily" ? chipActive : chipIdle].join(" ")}
        >
          Andamento
        </button>
        <button
          onClick={() => setTab("payments")}
          className={[chipBase, tab === "payments" ? chipActive : chipIdle].join(" ")}
        >
          Corrispettivi
        </button>
        <button
          onClick={() => setTab("top")}
          className={[chipBase, tab === "top" ? chipActive : chipIdle].join(" ")}
        >
          Top
        </button>
        <button
          onClick={() => setTab("staff")}
          className={[chipBase, tab === "staff" ? chipActive : chipIdle].join(" ")}
        >
          Staff
        </button>
      </div>

      {/* FILTRI (sempre uguali, per tutti i report) */}
      <div className={[shell, "p-4"].join(" ")}>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/45 font-bold">Dal</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-white/10 rounded-xl px-3 py-2 bg-black/20 text-white/90"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/45 font-bold">Al</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-white/10 rounded-xl px-3 py-2 bg-black/20 text-white/90"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/45 font-bold">Staff</label>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="border border-white/10 rounded-xl px-3 py-2 bg-black/20 text-white/90"
            >
              <option value="">Tutti</option>
              {staffOptions.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/45 font-bold">Pagamento</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="border border-white/10 rounded-xl px-3 py-2 bg-black/20 text-white/90"
            >
              <option value="">Tutti</option>
              <option value="cash">Contanti</option>
              <option value="card">Carta</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/45 font-bold">Tipo</label>
            <select
              value={itemType}
              onChange={(e) => setItemType(e.target.value)}
              className="border border-white/10 rounded-xl px-3 py-2 bg-black/20 text-white/90"
            >
              <option value="">Tutto</option>
              <option value="service">Servizi</option>
              <option value="product">Prodotti</option>
            </select>
          </div>

          <div className="md:col-span-5 flex justify-end">
            <button
              onClick={runReport}
              disabled={!canRun || loading}
              className="px-4 py-2 rounded-xl bg-scz-gold text-black font-black tracking-wide disabled:opacity-50"
            >
              {loading ? "Carico..." : "Aggiorna"}
            </button>
          </div>
        </div>

        {err && (
          <div className="mt-3 border border-red-500/30 bg-red-500/10 text-red-200 rounded-xl p-3 text-sm">
            {err}
          </div>
        )}
      </div>

      {/* KPI (sempre visibili) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className={[shell, "p-4"].join(" ")}>
          <div className="text-xs text-white/45 font-bold">Lordo</div>
          <div className="text-2xl font-extrabold text-white">{money(totals?.gross_total ?? 0)}</div>
          <div className="text-xs text-white/45 mt-1">
            Contanti {money(totals?.gross_cash ?? 0)} · Carta {money(totals?.gross_card ?? 0)}
          </div>
        </div>

        <div className={[shell, "p-4"].join(" ")}>
          <div className="text-xs text-white/45 font-bold">Netto</div>
          <div className="text-2xl font-extrabold text-white">{money(totals?.net_total ?? 0)}</div>
          <div className="text-xs text-white/45 mt-1">IVA {money(totals?.vat_total ?? 0)}</div>
        </div>

        <div className={[shell, "p-4"].join(" ")}>
          <div className="text-xs text-white/45 font-bold">Sconti</div>
          <div className="text-2xl font-extrabold text-white">{money(totals?.discount_total ?? 0)}</div>
          <div className="text-xs text-white/45 mt-1">Righe (preview) {rows.length}</div>
        </div>

        <div className={[shell, "p-4"].join(" ")}>
          <div className="text-xs text-white/45 font-bold">Scontrini</div>
          <div className="text-2xl font-extrabold text-white">{Number(totals?.receipts_count ?? 0)}</div>
          <div className="text-xs text-white/45 mt-1">
            Servizi {money(totals?.gross_services ?? 0)} · Prodotti {money(totals?.gross_products ?? 0)}
          </div>
        </div>
      </div>

      {/* CONTENUTO TAB */}
      {tab === "turnover" && (
        <div className={[shell, "overflow-hidden"].join(" ")}>
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="font-extrabold text-white">Dettaglio righe (preview)</div>
            <div className="text-xs text-white/45">
              {rows.length === 0 ? "Nessuna riga" : `Mostro ${rows.length} righe (download = tutte)`}
            </div>
          </div>

          <div className="overflow-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-black/20">
                <tr className="text-left text-white/70">
                  <th className="px-3 py-2 border-b border-white/10">Data</th>
                  <th className="px-3 py-2 border-b border-white/10">Tipo</th>
                  <th className="px-3 py-2 border-b border-white/10">Descrizione</th>
                  <th className="px-3 py-2 border-b border-white/10">Staff</th>
                  <th className="px-3 py-2 border-b border-white/10">Q.tà</th>
                  <th className="px-3 py-2 border-b border-white/10 text-right">Netto</th>
                  <th className="px-3 py-2 border-b border-white/10 text-right">IVA</th>
                  <th className="px-3 py-2 border-b border-white/10 text-right">Lordo</th>
                  <th className="px-3 py-2 border-b border-white/10">Pag.</th>
                </tr>
              </thead>
              <tbody className="text-white/85">
                {rows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4" colSpan={9}>
                      Nessuna vendita nel periodo selezionato.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const desc = r.item_type === "product" ? r.product_name : r.service_name;
                    return (
                      <tr key={`${r.sale_id}-${r.sale_item_id}`} className="hover:bg-white/5">
                        <td className="px-3 py-2 border-b border-white/5">{r.sale_day}</td>
                        <td className="px-3 py-2 border-b border-white/5">{r.item_type}</td>
                        <td className="px-3 py-2 border-b border-white/5">{desc ?? "Voce"}</td>
                        <td className="px-3 py-2 border-b border-white/5">{r.staff_name ?? "-"}</td>
                        <td className="px-3 py-2 border-b border-white/5">{r.quantity ?? 1}</td>
                        <td className="px-3 py-2 border-b border-white/5 text-right">{money(r.line_net)}</td>
                        <td className="px-3 py-2 border-b border-white/5 text-right">{money(r.line_vat)}</td>
                        <td className="px-3 py-2 border-b border-white/5 text-right">{money(r.line_total_gross)}</td>
                        <td className="px-3 py-2 border-b border-white/5">{r.payment_method}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 text-xs text-white/40">
            Nota: il gestionale è in costruzione → se non ci sono vendite vedrai tutto a 0 (normale).
          </div>
        </div>
      )}

      {tab === "daily" && (
        <div className={[shell, "overflow-hidden"].join(" ")}>
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="font-extrabold text-white">Andamento giornaliero</div>
            <div className="text-xs text-white/45">
              {daily.length === 0 ? "Nessun giorno" : `${daily.length} giorni`}
            </div>
          </div>

          <div className="overflow-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-black/20">
                <tr className="text-left text-white/70">
                  <th className="px-3 py-2 border-b border-white/10">Giorno</th>
                  <th className="px-3 py-2 border-b border-white/10">Scontrini</th>
                  <th className="px-3 py-2 border-b border-white/10 text-right">Netto</th>
                  <th className="px-3 py-2 border-b border-white/10 text-right">IVA</th>
                  <th className="px-3 py-2 border-b border-white/10 text-right">Lordo</th>
                  <th className="px-3 py-2 border-b border-white/10 text-right">Contanti</th>
                  <th className="px-3 py-2 border-b border-white/10 text-right">Carta</th>
                </tr>
              </thead>
              <tbody className="text-white/85">
                {daily.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4" colSpan={7}>
                      Nessuna vendita nel periodo selezionato.
                    </td>
                  </tr>
                ) : (
                  daily.map((d) => (
                    <tr key={d.day} className="hover:bg-white/5">
                      <td className="px-3 py-2 border-b border-white/5">{d.day}</td>
                      <td className="px-3 py-2 border-b border-white/5">{d.receipts_count}</td>
                      <td className="px-3 py-2 border-b border-white/5 text-right">{money(d.net_total)}</td>
                      <td className="px-3 py-2 border-b border-white/5 text-right">{money(d.vat_total)}</td>
                      <td className="px-3 py-2 border-b border-white/5 text-right">{money(d.gross_total)}</td>
                      <td className="px-3 py-2 border-b border-white/5 text-right">{money(d.gross_cash)}</td>
                      <td className="px-3 py-2 border-b border-white/5 text-right">{money(d.gross_card)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "payments" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className={[shell, "p-4"].join(" ")}>
            <div className="text-xs text-white/45 font-bold">Contanti</div>
            <div className="text-2xl font-extrabold text-white">{money(paySplit.cash)}</div>
            <div className="text-xs text-white/45 mt-1">
              {pct(paySplit.cash, paySplit.gross)} del lordo
            </div>
          </div>

          <div className={[shell, "p-4"].join(" ")}>
            <div className="text-xs text-white/45 font-bold">Carta</div>
            <div className="text-2xl font-extrabold text-white">{money(paySplit.card)}</div>
            <div className="text-xs text-white/45 mt-1">
              {pct(paySplit.card, paySplit.gross)} del lordo
            </div>
          </div>

          <div className={[shell, "p-4 md:col-span-2"].join(" ")}>
            <div className="text-xs text-white/45 font-bold mb-2">Nota</div>
            <div className="text-sm text-white/70">
              Questo report è già “Boss-level”: i totali arrivano dalla stessa fonte dei PDF/Excel,
              quindi sono coerenti al 100%.
            </div>
          </div>
        </div>
      )}

      {tab === "top" && (
        <div className={[shell, "overflow-hidden"].join(" ")}>
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="font-extrabold text-white">Top servizi / prodotti (per incasso)</div>
            <div className="text-xs text-white/45">{topItems.length ? `Top ${topItems.length}` : "Vuoto"}</div>
          </div>

          <div className="overflow-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-black/20">
                <tr className="text-left text-white/70">
                  <th className="px-3 py-2 border-b border-white/10">Tipo</th>
                  <th className="px-3 py-2 border-b border-white/10">Nome</th>
                  <th className="px-3 py-2 border-b border-white/10">Q.tà</th>
                  <th className="px-3 py-2 border-b border-white/10 text-right">Netto</th>
                  <th className="px-3 py-2 border-b border-white/10 text-right">Lordo</th>
                </tr>
              </thead>
              <tbody className="text-white/85">
                {topItems.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4" colSpan={5}>
                      Nessuna vendita nel periodo selezionato.
                    </td>
                  </tr>
                ) : (
                  topItems.map((x) => (
                    <tr key={x.key} className="hover:bg-white/5">
                      <td className="px-3 py-2 border-b border-white/5">{x.item_type}</td>
                      <td className="px-3 py-2 border-b border-white/5">{x.name}</td>
                      <td className="px-3 py-2 border-b border-white/5">{x.qty}</td>
                      <td className="px-3 py-2 border-b border-white/5 text-right">{money(x.net)}</td>
                      <td className="px-3 py-2 border-b border-white/5 text-right">{money(x.gross)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "staff" && (
        <div className={[shell, "overflow-hidden"].join(" ")}>
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="font-extrabold text-white">Performance staff (per incasso)</div>
            <div className="text-xs text-white/45">{staffPerf.length ? `${staffPerf.length} staff` : "Vuoto"}</div>
          </div>

          <div className="overflow-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-black/20">
                <tr className="text-left text-white/70">
                  <th className="px-3 py-2 border-b border-white/10">Staff</th>
                  <th className="px-3 py-2 border-b border-white/10">Scontrini</th>
                  <th className="px-3 py-2 border-b border-white/10 text-right">Netto</th>
                  <th className="px-3 py-2 border-b border-white/10 text-right">Lordo</th>
                  <th className="px-3 py-2 border-b border-white/10 text-right">Servizi</th>
                  <th className="px-3 py-2 border-b border-white/10 text-right">Prodotti</th>
                </tr>
              </thead>
              <tbody className="text-white/85">
                {staffPerf.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4" colSpan={6}>
                      Nessuna vendita nel periodo selezionato (o righe senza staff).
                    </td>
                  </tr>
                ) : (
                  staffPerf.map((s) => (
                    <tr key={`${s.staff_id}-${s.staff_name}`} className="hover:bg-white/5">
                      <td className="px-3 py-2 border-b border-white/5">{s.staff_name}</td>
                      <td className="px-3 py-2 border-b border-white/5">{s.receipts_count}</td>
                      <td className="px-3 py-2 border-b border-white/5 text-right">{money(s.net_total)}</td>
                      <td className="px-3 py-2 border-b border-white/5 text-right">{money(s.gross_total)}</td>
                      <td className="px-3 py-2 border-b border-white/5 text-right">{money(s.gross_services)}</td>
                      <td className="px-3 py-2 border-b border-white/5 text-right">{money(s.gross_products)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 text-xs text-white/40">
            Quando il gestionale sarà pieno di dati, questo diventa il report più potente per gestire produzione e premi.
          </div>
        </div>
      )}
    </div>
  );
}