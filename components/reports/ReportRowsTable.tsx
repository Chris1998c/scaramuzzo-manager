// components/reports/ReportRowsTable.tsx

type Row = {
  sale_item_id?: number | string | null;
  id?: number | string | null;
  sale_id: number | string | null;
  sale_day: string | null;
  payment_method: string | null;
  staff_name: string | null;
  product_name: string | null;
  service_name: string | null;
  item_type: string | null;
  quantity: number | null;
  price: number;
  item_discount: number | null;
  line_total_gross: number;
};

function money(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0,00 €";
  return v.toFixed(2).replace(".", ",") + " €";
}

function paymentLabel(pm: string | null) {
  const p = (pm ?? "").toLowerCase().trim();
  if (!p) return { label: "—", cash: false, card: false };
  if (p === "cash") return { label: "Contanti", cash: true, card: false };
  if (p === "card") return { label: "Carta", cash: false, card: true };
  return { label: p.charAt(0).toUpperCase() + p.slice(1), cash: false, card: false };
}

const thBase =
  "px-4 py-3 text-[10px] font-black uppercase tracking-wider border-b border-white/10";
const thPrimary = "text-white/90";
const thSecondary = "text-white/50";

const tdBase = "px-4 py-3 border-b border-white/5";
const tdPrimary = "text-white font-medium";
const tdHero = "font-extrabold text-scz-gold";
const tdSecondary = "text-white/60";

export default function ReportRowsTable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-scz-dark">
      <div className="border-b border-white/10 bg-black/20 px-6 py-5">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
          Dettaglio righe
        </div>
        <div className="mt-1 text-sm text-white/50">
          Prime 400 righe del periodo · filtri applicati
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1000px] w-full text-sm">
          <thead>
            <tr className="bg-black/30">
              <th className={`${thBase} ${thPrimary} min-w-[180px] text-left`}>
                Descrizione
              </th>
              <th className={`${thBase} ${thPrimary} text-right min-w-[90px]`}>
                Lordo
              </th>
              <th className={`${thBase} ${thPrimary} text-left min-w-[100px]`}>
                Pagamento
              </th>
              <th className={`${thBase} ${thPrimary} min-w-[120px] text-left`}>
                Staff
              </th>
              <th className={`${thBase} ${thSecondary} text-left`}>
                Data
              </th>
              <th className={`${thBase} ${thSecondary} text-left`}>
                Scontrino
              </th>
              <th className={`${thBase} ${thSecondary} text-left`}>
                Tipo
              </th>
              <th className={`${thBase} ${thSecondary} text-right`}>
                Q.tà
              </th>
              <th className={`${thBase} ${thSecondary} text-right`}>
                Prezzo
              </th>
              <th className={`${thBase} ${thSecondary} text-right`}>
                Sconto
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="px-4 py-12 text-center text-white/40"
                >
                  Nessun dato per il periodo selezionato.
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => {
                const key =
                  r.sale_item_id ??
                  r.id ??
                  `${r.sale_id}-${r.item_type}-${idx}`;
                const desc =
                  r.item_type === "product"
                    ? r.product_name ?? "Prodotto"
                    : r.service_name ?? "Servizio";
                const pm = paymentLabel(r.payment_method);
                const isProduct = r.item_type === "product";

                return (
                  <tr
                    key={String(key)}
                    className={
                      idx % 2 === 0
                        ? "bg-black/10 hover:bg-black/15"
                        : "bg-transparent hover:bg-black/10"
                    }
                  >
                    <td className={`${tdBase} ${tdPrimary}`}>
                      <span className="font-extrabold text-white">
                        {desc}
                      </span>
                    </td>
                    <td className={`${tdBase} ${tdHero} text-right`}>
                      {money(r.line_total_gross)}
                    </td>
                    <td className={tdBase}>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${
                          pm.cash
                            ? "bg-amber-500/20 text-amber-300"
                            : pm.card
                              ? "bg-sky-500/20 text-sky-300"
                              : "bg-white/10 text-white/70"
                        }`}
                      >
                        {pm.label}
                      </span>
                    </td>
                    <td className={`${tdBase} ${tdPrimary}`}>
                      {r.staff_name ?? "—"}
                    </td>

                    <td className={`${tdBase} ${tdSecondary}`}>
                      {r.sale_day}
                    </td>
                    <td className={`${tdBase} ${tdSecondary}`}>
                      #{r.sale_id}
                    </td>
                    <td className={tdBase}>
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${
                          isProduct
                            ? "bg-white/10 text-white/70"
                            : "bg-scz-gold/15 text-scz-gold"
                        }`}
                      >
                        {isProduct ? "Prodotto" : "Servizio"}
                      </span>
                    </td>
                    <td className={`${tdBase} ${tdSecondary} text-right`}>
                      {r.quantity ?? 1}
                    </td>
                    <td className={`${tdBase} ${tdSecondary} text-right`}>
                      {money(r.price)}
                    </td>
                    <td className={`${tdBase} ${tdSecondary} text-right`}>
                      {money(r.item_discount ?? 0)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-white/10 bg-black/20 px-6 py-3">
        <p className="text-xs text-white/40">
          Lordo = prezzo × quantità − sconto riga
        </p>
      </div>
    </div>
  );
}
