"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  PackagePlus,
  ShieldAlert,
  AlertTriangle,
  Search,
} from "lucide-react";
import { createClient } from "@/lib/supabaseClient";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { MAGAZZINO_CENTRALE_ID } from "@/lib/constants";

interface ProductRow {
  product_id?: number;
  id?: number;
  name: string;
  category: string | null;
  barcode: string | null;
  quantity?: number; // solo per flusso da centrale
}

// Saloni destinazione carico (solo 1..4, centrale è sorgente)
const SALONI: { id: number; name: string }[] = [
  { id: 1, name: "Corigliano" },
  { id: 2, name: "Cosenza" },
  { id: 3, name: "Castrovillari" },
  { id: 4, name: "Roma" },
];

function toNumberOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function clampQty(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** ✅ Wrapper required by Next.js when using useSearchParams() */
export default function CaricoPage() {
  return (
    <Suspense fallback={<CaricoSkeleton />}>
      <CaricoInner />
    </Suspense>
  );
}

function CaricoInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();

  const { role, activeSalonId, allowedSalons, allowedSalonIds, isReady, receptionSalonId } =
    useActiveSalon();

  const productIdFromUrl = toNumberOrNull(searchParams.get("product"));

  const [product, setProduct] = useState<ProductRow | null>(null);
  const [qty, setQty] = useState<number>(1);

  // destinazione: se activeSalonId è un salone valido (1..4) lo uso, altrimenti 1
  const [toSalonId, setToSalonId] = useState<number>(() => {
    const v =
      typeof activeSalonId === "number" ? activeSalonId : Number.NaN;
    return SALONI.some((s) => s.id === v) ? v : 1;
  });

  // lista prodotti (quando mancano query param)
  const [list, setList] = useState<ProductRow[]>([]);
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /** Destinazioni carico (1–4) consentite per l’utente — allineato a POST /api/magazzino/carico. */
  const warehouseDestSalons = useMemo(() => {
    const filtered = SALONI.filter((s) => allowedSalonIds.includes(s.id));
    return filtered.length ? filtered : SALONI;
  }, [allowedSalonIds]);

  const isWarehouseUi = role === "magazzino" || role === "coordinator";
  const vistaIsHub = isWarehouseUi && activeSalonId === MAGAZZINO_CENTRALE_ID;
  const vistaSalonOperativo =
    isWarehouseUi &&
    typeof activeSalonId === "number" &&
    SALONI.some((s) => s.id === activeSalonId) &&
    allowedSalonIds.includes(activeSalonId);
  const vistaLabel =
    activeSalonId == null
      ? "—"
      : allowedSalons.find((s) => s.id === activeSalonId)?.name?.split(" - ")[0] ??
        (activeSalonId === MAGAZZINO_CENTRALE_ID ? "Magazzino Centrale" : `Salone ${activeSalonId}`);

  /** Vista su salone reale → destinazione allineata; Vista hub → nessun allineamento silenzioso (solo copy + select). */
  useEffect(() => {
    if (!isReady || !isWarehouseUi) return;
    if (
      typeof activeSalonId === "number" &&
      SALONI.some((s) => s.id === activeSalonId) &&
      allowedSalonIds.includes(activeSalonId)
    ) {
      setToSalonId(activeSalonId);
    }
  }, [activeSalonId, allowedSalonIds, isReady, isWarehouseUi]);

  /** toSalonId sempre tra le destinazioni consentite (es. permessi stretti). */
  useEffect(() => {
    if (!isReady || !isWarehouseUi) return;
    if (!warehouseDestSalons.length) return;
    if (!warehouseDestSalons.some((s) => s.id === toSalonId)) {
      setToSalonId(warehouseDestSalons[0].id);
    }
  }, [isReady, isWarehouseUi, warehouseDestSalons, toSalonId]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setLoading(true);
        setErrorMsg(null);

        if (!isReady) return;

        const isReception = role === "reception";
        const isWarehouse = role === "magazzino" || role === "coordinator";
        if (!isReception && !isWarehouse) {
          setErrorMsg("Permessi insufficienti per eseguire un carico.");
          return;
        }

        if (isReception) {
          // Reception: carico in ingresso — lista da catalogo prodotti
          await loadListReception();
          if (productIdFromUrl && productIdFromUrl > 0) {
            const { data: prod } = await supabase
              .from("products")
              .select("id, name, category, barcode")
              .eq("id", productIdFromUrl)
              .eq("active", true)
              .maybeSingle();
            if (cancelled) return;
            if (prod) setProduct({ ...(prod as ProductRow), product_id: (prod as { id: number }).id });
          }
          return;
        }

        // Magazzino/coordinator: se ho product in URL, carico da centrale
        if (productIdFromUrl && productIdFromUrl > 0) {
          const { data: prod, error: prodErr } = await supabase
            .from("products_with_stock")
            .select("product_id, name, category, barcode, quantity")
            .eq("salon_id", MAGAZZINO_CENTRALE_ID)
            .eq("product_id", productIdFromUrl)
            .maybeSingle();

          if (cancelled) return;

          if (prodErr) {
            console.error(prodErr);
            setErrorMsg("Errore nel recupero del prodotto dal magazzino centrale.");
            return;
          }

          const p = (prod as ProductRow) ?? null;
          setProduct(p);

          if (p?.quantity && p.quantity > 0) {
            const maxQ: number = p.quantity;
            setQty((q) => clampQty(q, 1, maxQ));
          }

          return;
        }

        await loadList();
      } catch (err) {
        console.error("Carico init error:", err);
        if (!cancelled) setErrorMsg("Errore nel caricamento della pagina carico.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    async function loadListReception() {
      setLoadingList(true);
      try {
        let q = supabase
          .from("products")
          .select("id, name, category, barcode")
          .eq("active", true)
          .order("name", { ascending: true });

        const s = search.trim();
        if (s) q = q.ilike("name", `%${s}%`);

        const { data, error } = await q;
        if (error) throw error;

        const rows = ((data ?? []) as { id: number; name: string; category: string | null; barcode: string | null }[]).map((r) => ({
          product_id: r.id,
          name: r.name,
          category: r.category,
          barcode: r.barcode,
        }));
        setList(rows as ProductRow[]);
      } catch (e) {
        console.error(e);
        setList([]);
      } finally {
        setLoadingList(false);
      }
    }

    async function loadList() {
      setLoadingList(true);
      try {
        let q = supabase
          .from("products_with_stock")
          .select("product_id, name, category, barcode, quantity")
          .eq("salon_id", MAGAZZINO_CENTRALE_ID)
          .order("name", { ascending: true });

        const s = search.trim();
        if (s) q = q.ilike("name", `%${s}%`);

        const { data, error } = await q;
        if (error) throw error;

        setList((data as ProductRow[]) || []);
      } catch (e) {
        console.error(e);
        setList([]);
      } finally {
        setLoadingList(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productIdFromUrl, supabase, isReady, role]);

  // refresh lista quando cambi search (solo se NON hai prodotto selezionato)
  useEffect(() => {
    if (product) return;
    if (!isReady) return;

    const t = setTimeout(async () => {
      if (role === "reception") {
        setLoadingList(true);
        try {
          let q = supabase.from("products").select("id, name, category, barcode").eq("active", true).order("name", { ascending: true });
          const s = search.trim();
          if (s) q = q.ilike("name", `%${s}%`);
          const { data, error } = await q;
          if (error) throw error;
          const rows = ((data ?? []) as { id: number; name: string; category: string | null; barcode: string | null }[]).map((r) => ({
            product_id: r.id,
            name: r.name,
            category: r.category,
            barcode: r.barcode,
          }));
          setList(rows as ProductRow[]);
        } catch (e) {
          console.error(e);
          setList([]);
        } finally {
          setLoadingList(false);
        }
        return;
      }
      if (role !== "magazzino" && role !== "coordinator") return;

      setLoadingList(true);
      try {
        let q = supabase
          .from("products_with_stock")
          .select("product_id, name, category, barcode, quantity")
          .eq("salon_id", MAGAZZINO_CENTRALE_ID)
          .order("name", { ascending: true });
        const s = search.trim();
        if (s) q = q.ilike("name", `%${s}%`);
        const { data, error } = await q;
        if (error) throw error;
        setList((data as ProductRow[]) || []);
      } catch (e) {
        console.error(e);
        setList([]);
      } finally {
        setLoadingList(false);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [search, product, role, isReady, supabase]);

  const isReception = role === "reception";
  const maxQty = isReception ? undefined : (product?.quantity ?? 0);
  const disabled = isReception
    ? !product || submitting || qty <= 0
    : !product || submitting || qty <= 0 || (maxQty !== undefined && (qty > maxQty || maxQty <= 0));

  const handleSelectProduct = (p: ProductRow) => {
    setErrorMsg(null);
    setProduct(p);
    const pid = p.product_id ?? (p as { id?: number }).id;
    setQty(isReception ? 1 : clampQty(1, 1, Math.max(1, p.quantity ?? 0)));

    const url = `/dashboard/magazzino/carico?product=${pid}`;
    router.replace(url);
  };

  const handleCarico = async () => {
    if (!product) return;

    const productId = product.product_id ?? (product as { id?: number }).id;
    if (!Number.isFinite(productId)) return;

    if (isReception) {
      if (!receptionSalonId || receptionSalonId < 1 || receptionSalonId >= MAGAZZINO_CENTRALE_ID) {
        setErrorMsg("Nessun salone associato al tuo account.");
        return;
      }
    } else {
      if (!warehouseDestSalons.some((s) => s.id === toSalonId)) {
        setErrorMsg("Seleziona un salone di destinazione consentito.");
        return;
      }
    }

    const q = isReception
      ? Math.max(1, Math.floor(Number(qty)) || 1)
      : clampQty(Number(qty), 1, product.quantity ?? 0);
    if (!isReception && product.quantity != null && q > product.quantity) return;

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const requestId = createRequestId();
      const res = await fetch("/api/magazzino/carico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salonId: isReception ? receptionSalonId : toSalonId,
          productId,
          qty: q,
          reason: isReception ? "carico_ingresso_reception" : "carico_app",
          request_id: requestId,
        }),
      });

      let json: any = null;
      try {
        json = await res.json();
      } catch {}

      if (!res.ok || json?.error) {
        setErrorMsg(json?.error ?? "Errore durante il carico.");
        return;
      }

      // ✅ dopo carico: reset UI e reload prodotto dal centrale
      setProduct(null);
      router.replace("/dashboard/magazzino/carico");
      // se vuoi tornare indietro: router.back();
    } catch (e) {
      console.error(e);
      setErrorMsg("Errore di rete durante il carico.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] w-full space-y-6">
      {/* HERO */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-[#5c3a21]/50 bg-[#24140e]/60 p-5 md:p-7 backdrop-blur-md shadow-[0_0_60px_rgba(0,0,0,0.25)]"
      >
        <div className="flex items-start gap-4">
          <div className="shrink-0 rounded-2xl p-3 bg-black/20 border border-[#5c3a21]/60">
            <PackagePlus className="text-[#f3d8b6]" size={26} strokeWidth={1.7} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="text-sm text-[#c9b299]">Magazzino</div>
                <h1 className="text-2xl md:text-3xl font-extrabold text-[#f3d8b6] tracking-tight">
                  {isReception ? "Carico in ingresso" : "Carico dal Magazzino Centrale"}
                </h1>
                <p className="text-[#c9b299] mt-2 max-w-2xl">
                  {isReception
                    ? "Registra merce arrivata al tuo salone. La destinazione è il tuo salone."
                    : "Prelievo dalla giacenza del Magazzino Centrale (ID 5). Il salone che riceve la merce è sempre quello che scegli nel campo «Destinazione del carico»."}
                </p>
                {!isReception && isWarehouseUi && (
                  <div
                    className={`mt-4 max-w-2xl rounded-xl border px-4 py-3 text-sm leading-relaxed ${
                      vistaIsHub
                        ? "border-amber-400/35 bg-amber-500/10 text-amber-100/95"
                        : "border-white/10 bg-black/25 text-[#c9b299]"
                    }`}
                  >
                    {vistaIsHub ? (
                      <>
                        <span className="font-extrabold text-[#f3d8b6]">Vista: {vistaLabel} (hub).</span>{" "}
                        Qui stai lavorando sull’origine della merce.{" "}
                        <strong className="text-white/90">Non</strong> coincide con il salone di arrivo: quello è
                        sempre il valore nel menu &quot;Destinazione del carico&quot; sotto.
                      </>
                    ) : vistaSalonOperativo ? (
                      <>
                        <span className="font-extrabold text-[#f3d8b6]">Vista: {vistaLabel}.</span> La destinazione
                        del carico è stata allineata a questo salone; cambiala dal menu se serve inviare altrove.
                      </>
                    ) : (
                      <>
                        <span className="font-extrabold text-[#f3d8b6]">Vista: {vistaLabel}.</span> Scegli con cura la
                        destinazione del carico nel menu dedicato (salone che riceve la merce dal centrale).
                      </>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={() => router.back()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3
                  bg-black/20 border border-[#5c3a21]/60 text-[#f3d8b6]
                  hover:border-[var(--accent)] transition"
              >
                <ArrowLeft size={18} />
                Indietro
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* CONTENT */}
      <div className="rounded-3xl border border-[#5c3a21]/50 bg-[#24140e]/40 p-4 md:p-6 backdrop-blur-md">
        {loading ? (
          <div className="rounded-2xl bg-black/15 border border-[#5c3a21]/50 p-6 text-[#c9b299]">
            Caricamento…
          </div>
        ) : errorMsg ? (
          <div className="rounded-2xl bg-black/20 border border-[#5c3a21]/60 p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-xl p-2 bg-black/20 border border-[#5c3a21]/60">
                <ShieldAlert className="text-[#f3d8b6]" size={18} />
              </div>
              <div className="min-w-0">
                <div className="text-[#f3d8b6] font-extrabold">Errore</div>
                <div className="text-[#c9b299] mt-1 text-sm">{errorMsg}</div>
              </div>
            </div>
          </div>
        ) : !isReception && role !== "magazzino" && role !== "coordinator" ? (
          <div className="rounded-2xl bg-black/20 border border-[#5c3a21]/60 p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-xl p-2 bg-black/20 border border-[#5c3a21]/60">
                <ShieldAlert className="text-[#f3d8b6]" size={18} />
              </div>
              <div className="min-w-0">
                <div className="text-[#f3d8b6] font-extrabold">Permessi insufficienti</div>
                <div className="text-[#c9b299] mt-1 text-sm">
                  Solo magazzino/coordinator possono eseguire carichi da centrale.
                </div>
              </div>
            </div>
          </div>
        ) : isReception && (!receptionSalonId || receptionSalonId < 1 || receptionSalonId >= MAGAZZINO_CENTRALE_ID) ? (
          <div className="rounded-2xl bg-black/20 border border-[#5c3a21]/60 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-[#f3d8b6] shrink-0 mt-0.5" size={20} />
              <div className="min-w-0">
                <div className="text-[#f3d8b6] font-extrabold">Salone non associato</div>
                <div className="text-[#c9b299] mt-1 text-sm">
                  Contatta l&apos;amministratore per associare il tuo account a un salone.
                </div>
              </div>
            </div>
          </div>
        ) : !product ? (
          // PICKER PRODOTTI
          <div className="space-y-4">
            <div className="rounded-2xl bg-[#FFF9F4] border border-black/5 p-5 text-[#341A09]">
              <div className="font-extrabold text-lg">Seleziona un prodotto</div>
              <div className="text-sm opacity-70 mt-1">
                {isReception
                  ? "Cerca e clicca un prodotto per registrare il carico in ingresso al tuo salone."
                  : "Lista dal magazzino centrale (ID 5). Cerca e clicca un prodotto per procedere."}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <div className="relative w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-60" size={18} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cerca prodotto..."
                    className="w-full pl-10 pr-4 py-3 rounded-xl border bg-white"
                  />
                </div>

                {!isReception && (
                  <div className="min-w-[220px]">
                    <label className="block text-xs font-bold mb-1 opacity-70">
                      Destinazione del carico (salone che riceve)
                    </label>
                    <select
                      value={toSalonId}
                      onChange={(e) => setToSalonId(Number(e.target.value))}
                      className="w-full p-3 rounded-xl border bg-white"
                    >
                      {warehouseDestSalons.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {isReception && receptionSalonId != null && (
                  <div className="min-w-[220px] rounded-xl border bg-white/80 px-4 py-3">
                    <span className="text-xs font-bold opacity-70">Destinazione</span>
                    <div className="text-[#341A09] font-semibold">
                      {allowedSalons.find((s) => s.id === receptionSalonId)?.name ?? `Salone ${receptionSalonId}`}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-black/20 border border-[#5c3a21]/60 overflow-hidden">
              {loadingList ? (
                <div className="p-6 text-[#c9b299]">Caricamento prodotti…</div>
              ) : list.length === 0 ? (
                <div className="p-6 text-[#c9b299]">Nessun prodotto trovato.</div>
              ) : (
                <div className="divide-y divide-[#5c3a21]/40">
                  {list.map((p) => (
                    <button
                      key={p.product_id}
                      onClick={() => handleSelectProduct(p)}
                      className="w-full text-left px-5 py-4 hover:bg-black/20 transition flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="text-[#f3d8b6] font-extrabold truncate">
                          {p.name}
                        </div>
                        <div className="text-[#c9b299] text-sm opacity-90">
                          {p.category ?? "—"} • {p.barcode ?? "—"}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {!isReception && p.quantity != null ? (
                          <>
                            <div className="text-[#f3d8b6] font-extrabold">{p.quantity}</div>
                            <div className="text-[#c9b299] text-xs">Disponibili</div>
                          </>
                        ) : isReception ? (
                          <div className="text-[#c9b299] text-xs">Carico in ingresso</div>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          // ✅ FORM CARICO (prodotto selezionato)
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* LEFT: product info */}
            <div className="lg:col-span-1 rounded-2xl bg-black/20 border border-[#5c3a21]/60 p-5">
              <div className="text-[#f3d8b6] font-extrabold text-lg leading-tight">
                {product.name}
              </div>

              <div className="mt-3 space-y-2 text-sm text-[#c9b299]">
                <div className="flex items-center justify-between gap-3">
                  <span>Categoria</span>
                  <span className="text-[#f3d8b6] font-semibold">
                    {product.category ?? "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Barcode</span>
                  <span className="text-[#f3d8b6] font-semibold">
                    {product.barcode ?? "—"}
                  </span>
                </div>
                {!isReception && (
                  <div className="flex items-center justify-between gap-3">
                    <span>Disponibili (centrale)</span>
                    <span className="text-[#f3d8b6] font-extrabold">{product.quantity}</span>
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  setProduct(null);
                  router.replace("/dashboard/magazzino/carico");
                }}
                className="mt-5 w-full rounded-xl px-4 py-3 bg-black/20 border border-[#5c3a21]/60 text-[#f3d8b6] hover:bg-black/30 transition"
              >
                Cambia prodotto
              </button>

              {!isReception && product.quantity != null && product.quantity <= 0 && (
                <div className="mt-4 rounded-xl bg-black/15 border border-[#5c3a21]/50 p-3 text-sm text-[#c9b299]">
                  Nessuna giacenza disponibile nel magazzino centrale.
                </div>
              )}
            </div>

            {/* RIGHT: form */}
            <div className="lg:col-span-2 rounded-2xl bg-[#FFF9F4] border border-black/5 p-6 text-[#341A09]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isReception ? (
                  <div>
                    <label className="font-extrabold block mb-2">Destinazione</label>
                    <div className="p-3 rounded-xl border bg-white/80 font-semibold">
                      {allowedSalons.find((s) => s.id === receptionSalonId)?.name ?? `Salone ${receptionSalonId}`}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="font-extrabold block mb-2">
                      Destinazione del carico (salone che riceve)
                    </label>
                    <select
                      value={toSalonId}
                      onChange={(e) => setToSalonId(Number(e.target.value))}
                      className="w-full p-3 rounded-xl border bg-white"
                    >
                      {warehouseDestSalons.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    {vistaIsHub && (
                      <p className="mt-2 text-xs opacity-75">
                        Con Vista sul centrale, il salone di arrivo è <strong>solo</strong> quello selezionato qui.
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label className="font-extrabold block mb-2">Quantità da caricare</label>
                  <input
                    type="number"
                    min={1}
                    max={isReception ? 99999 : Math.max(1, product.quantity ?? 0)}
                    value={qty}
                    onChange={(e) =>
                      setQty(
                        isReception
                          ? Math.max(1, Math.floor(Number(e.target.value)) || 1)
                          : clampQty(Number(e.target.value), 1, product.quantity ?? 0)
                      )
                    }
                    className="w-full p-3 rounded-xl border bg-white"
                  />
                  {!isReception && product.quantity != null && (
                    <p className="mt-2 text-sm opacity-70">Max: {product.quantity}</p>
                  )}
                </div>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <button
                  onClick={() => router.back()}
                  className="px-6 py-3 rounded-xl bg-black/10 border border-black/10 text-[#341A09]
                    hover:bg-black/15 transition"
                >
                  Annulla
                </button>

                <button
                  onClick={handleCarico}
                  disabled={disabled}
                  className="px-6 py-3 rounded-xl bg-[#0FA958] text-white font-extrabold
                    shadow-[0_10px_35px_rgba(15,169,88,0.25)]
                    disabled:opacity-40 disabled:shadow-none"
                >
                  {submitting ? "Caricamento…" : "Conferma Carico"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="h-2" />
    </div>
  );
}

function CaricoSkeleton() {
  return (
    <div className="w-full space-y-6">
      <div className="rounded-3xl border border-[#5c3a21]/50 bg-[#24140e]/60 p-5 md:p-7">
        <div className="h-6 w-48 bg-black/20 rounded-xl" />
        <div className="mt-3 h-4 w-80 bg-black/20 rounded-xl" />
        <div className="mt-5 h-10 w-full bg-black/15 rounded-2xl" />
      </div>
      <div className="rounded-3xl border border-[#5c3a21]/50 bg-[#24140e]/40 p-4 md:p-6">
        <div className="h-[520px] w-full bg-black/15 rounded-2xl border border-[#5c3a21]/40" />
      </div>
    </div>
  );
}
