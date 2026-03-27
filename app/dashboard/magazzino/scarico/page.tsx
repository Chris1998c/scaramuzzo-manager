"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  PackageMinus,
  ShieldAlert,
  AlertTriangle,
  Search,
} from "lucide-react";
import { createClient } from "@/lib/supabaseClient";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { MAGAZZINO_CENTRALE_ID } from "@/lib/constants";

type Role = "coordinator" | "magazzino" | "reception" | "cliente" | string;

interface Product {
  product_id: number;
  name: string;
  category: string | null;
  barcode: string | null;
  quantity: number;
}

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

function salonLabel(id: number) {
  if (id === MAGAZZINO_CENTRALE_ID) return "Magazzino Centrale";
  return `Salone ${id}`;
}

/** ✅ Wrapper required by Next.js when using useSearchParams() */
export default function ScaricoPage() {
  return (
    <Suspense fallback={<ScaricoSkeleton />}>
      <ScaricoInner />
    </Suspense>
  );
}

function ScaricoInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const { role: providerRole, isReady, activeSalonId, receptionSalonId } = useActiveSalon(); // cambia dall'header senza refresh

  const productId = toNumberOrNull(searchParams.get("product"));

  const [role, setRole] = useState<Role>("reception");
  const [userSalonId, setUserSalonId] = useState<number | null>(null);

  // ✅ contesto su cui scarichiamo:
  // - magazzino/coordinator -> activeSalonId (può essere 1..4 o 5 centrale)
  // - reception -> userSalonId
  const [ctxSalonId, setCtxSalonId] = useState<number | null>(null);

  const [product, setProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState<number>(1);
  const [search, setSearch] = useState("");
  const [list, setList] = useState<Product[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 1) Inizializzazione ctx: reception usa receptionSalonId (staff.salon_id), non user_metadata
  useEffect(() => {
    let cancelled = false;

    async function initCtx() {
      if (!isReady) return;

      try {
        setLoading(true);
        setErrorMsg(null);

        const r: Role = String(providerRole ?? "reception");
        setRole(r);

        const isWarehouse = r === "magazzino" || r === "coordinator";

        if (isWarehouse) {
          const v =
            typeof activeSalonId === "number" && Number.isFinite(activeSalonId)
              ? activeSalonId
              : MAGAZZINO_CENTRALE_ID;
          if (cancelled) return;
          setCtxSalonId(v);
          setUserSalonId(null);
        } else if (r === "reception") {
          if (receptionSalonId == null) {
            setCtxSalonId(null);
            setUserSalonId(null);
            setErrorMsg("Salone non associato al tuo account. Contatta l'amministratore.");
            return;
          }
          if (cancelled) return;
          setCtxSalonId(receptionSalonId);
          setUserSalonId(receptionSalonId);
        } else {
          const { data, error } = await supabase.auth.getUser();
          if (error) throw error;
          const user = data.user;
          if (!user) {
            setErrorMsg("Utente non autenticato.");
            return;
          }
          const sid = toNumberOrNull(user.user_metadata?.salon_id ?? null);
          if (cancelled) return;
          setUserSalonId(sid);
          setCtxSalonId(sid);
        }
      } catch (err) {
        console.error("Scarico init error:", err);
        if (!cancelled) setErrorMsg("Errore nel caricamento.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    initCtx();
    return () => {
      cancelled = true;
    };
  }, [isReady, productId, providerRole, activeSalonId, receptionSalonId, supabase]);

  // 2) Se cambia activeSalonId, aggiorna ctx SOLO per magazzino/coordinator
  useEffect(() => {
    if (!productId || productId <= 0) return;
    const isWarehouse = role === "magazzino" || role === "coordinator";
    if (!isWarehouse) return;

    const v =
      typeof activeSalonId === "number" && Number.isFinite(activeSalonId)
        ? activeSalonId
        : MAGAZZINO_CENTRALE_ID;

    if (ctxSalonId !== v) setCtxSalonId(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSalonId, role, productId]);

  // 3) Fetch product quando cambia ctxSalonId o productId
  useEffect(() => {
    let cancelled = false;

    async function fetchProduct() {
      if (!productId || productId <= 0) {
        if (!cancelled) setProduct(null);
        return;
      }
      if (ctxSalonId == null) return;

      try {
        setErrorMsg(null);
        setProduct(null);

        const { data: prod, error: prodErr } = await supabase
          .from("products_with_stock")
          .select("product_id, name, category, barcode, quantity")
          .eq("salon_id", ctxSalonId) // ✅ qui sta il fix
          .eq("product_id", productId)
          .maybeSingle();

        if (cancelled) return;

        if (prodErr) {
          console.error(prodErr);
          setErrorMsg("Errore nel recupero del prodotto.");
          return;
        }

        const p = (prod as Product) ?? null;
        setProduct(p);

        if (p?.quantity && p.quantity > 0) {
          setQty((q) => clampQty(q, 1, p.quantity));
        } else {
          setQty(1);
        }
      } catch (e) {
        console.error("Scarico fetch product error:", e);
        if (!cancelled) setErrorMsg("Errore nel recupero del prodotto.");
      }
    }

    fetchProduct();
    return () => {
      cancelled = true;
    };
  }, [supabase, productId, ctxSalonId]);

  // 4) Picker prodotti quando manca ?product=
  useEffect(() => {
    let cancelled = false;

    async function fetchList() {
      if (productId && productId > 0) return;
      if (ctxSalonId == null) {
        if (!cancelled) setList([]);
        return;
      }

      try {
        setLoadingList(true);
        let q = supabase
          .from("products_with_stock")
          .select("product_id, name, category, barcode, quantity")
          .eq("salon_id", ctxSalonId)
          .gt("quantity", 0)
          .order("name", { ascending: true });

        const s = search.trim();
        if (s) q = q.ilike("name", `%${s}%`);

        const { data, error } = await q;
        if (error) throw error;

        if (!cancelled) setList((data as Product[]) ?? []);
      } catch (e) {
        console.error("Scarico fetch list error:", e);
        if (!cancelled) setList([]);
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    }

    fetchList();
    return () => {
      cancelled = true;
    };
  }, [supabase, productId, ctxSalonId, search]);

  const maxQty = product?.quantity ?? 0;
  const disabled =
    !product ||
    ctxSalonId === null ||
    submitting ||
    qty <= 0 ||
    qty > maxQty ||
    maxQty <= 0;

  const handleScarico = async () => {
    if (ctxSalonId === null || !product) return;

    const q = clampQty(Number(qty), 1, product.quantity);
    if (q > product.quantity) return;

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const requestId = createRequestId();
      const res = await fetch("/api/magazzino/scarico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salonId: ctxSalonId, // ✅ scarica dal contesto (header per warehouse)
          productId: product.product_id,
          qty: q,
          reason: "scarico_app",
          request_id: requestId,
        }),
      });

      let json: any = null;
      try {
        json = await res.json();
      } catch {}

      if (!res.ok || json?.error) {
        setErrorMsg(json?.error ?? "Errore durante lo scarico.");
        return;
      }

      router.back();
    } catch (e) {
      console.error(e);
      setErrorMsg("Errore di rete durante lo scarico.");
    } finally {
      setSubmitting(false);
    }
  };

  const titleSalon =
    role === "magazzino" || role === "coordinator"
      ? salonLabel(ctxSalonId ?? MAGAZZINO_CENTRALE_ID)
      : ctxSalonId != null
      ? salonLabel(ctxSalonId)
      : "Salone";

  const showPicker = !productId || productId <= 0;

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
            <PackageMinus className="text-[#f3d8b6]" size={26} strokeWidth={1.7} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="text-sm text-[#c9b299]">Magazzino</div>
                <h1 className="text-2xl md:text-3xl font-extrabold text-[#f3d8b6] tracking-tight">
                  Scarico — {titleSalon}
                </h1>
                <p className="text-[#c9b299] mt-2 max-w-2xl">
                  {role === "magazzino" || role === "coordinator"
                    ? "Scarica quantità dalla giacenza del salone attualmente in vista (header)."
                    : "Scarica quantità dalla giacenza del tuo salone."}
                </p>
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
        ) : showPicker ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-[#FFF9F4] border border-black/5 p-5 text-[#341A09]">
              <div className="font-extrabold text-lg">Seleziona un prodotto</div>
              <div className="text-sm opacity-70 mt-1">
                Scegli un prodotto dalla giacenza del salone attivo per procedere con lo scarico.
              </div>
              <div className="mt-4 relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 opacity-60"
                  size={18}
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cerca prodotto..."
                  className="w-full pl-10 pr-4 py-3 rounded-xl border bg-white"
                />
              </div>
            </div>

            <div className="rounded-2xl bg-black/20 border border-[#5c3a21]/60 overflow-hidden">
              {loadingList ? (
                <div className="p-6 text-[#c9b299]">Caricamento prodotti…</div>
              ) : list.length === 0 ? (
                <div className="p-6 text-[#c9b299]">Nessun prodotto disponibile in questo salone.</div>
              ) : (
                <div className="divide-y divide-[#5c3a21]/40">
                  {list.map((p) => (
                    <button
                      key={p.product_id}
                      onClick={() => router.replace(`/dashboard/magazzino/scarico?product=${p.product_id}`)}
                      className="w-full text-left px-5 py-4 hover:bg-black/20 transition flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="text-[#f3d8b6] font-extrabold truncate">{p.name}</div>
                        <div className="text-[#c9b299] text-sm opacity-90">
                          {p.category ?? "—"} • {p.barcode ?? "—"}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[#f3d8b6] font-extrabold">{p.quantity}</div>
                        <div className="text-[#c9b299] text-xs">Disponibili</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : !product ? (
          <div className="rounded-2xl bg-black/20 border border-[#5c3a21]/60 p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-xl p-2 bg-black/20 border border-[#5c3a21]/60">
                <AlertTriangle className="text-[#f3d8b6]" size={18} />
              </div>
              <div className="min-w-0">
                <div className="text-[#f3d8b6] font-extrabold">Prodotto non trovato</div>
                <div className="text-[#c9b299] mt-1 text-sm">
                  Prodotto non presente o senza giacenza nel contesto selezionato.
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* LEFT */}
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
                <div className="flex items-center justify-between gap-3">
                  <span>Disponibili</span>
                  <span className="text-[#f3d8b6] font-extrabold">
                    {product.quantity}
                  </span>
                </div>
              </div>

              {product.quantity <= 0 && (
                <div className="mt-4 rounded-xl bg-black/15 border border-[#5c3a21]/50 p-3 text-sm text-[#c9b299]">
                  Nessuna giacenza disponibile per questo prodotto.
                </div>
              )}
            </div>

            {/* RIGHT */}
            <div className="lg:col-span-2 rounded-2xl bg-[#FFF9F4] border border-black/5 p-6 text-[#341A09]">
              <div>
                <label className="font-extrabold block mb-2">Quantità da scaricare</label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, product.quantity)}
                  value={qty}
                  onChange={(e) =>
                    setQty(clampQty(Number(e.target.value), 1, product.quantity))
                  }
                  className="w-full p-3 rounded-xl border bg-white"
                />
                <p className="mt-2 text-sm opacity-70">
                  Disponibili: {product.quantity}
                </p>
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
                  onClick={handleScarico}
                  disabled={disabled}
                  className="px-6 py-3 rounded-xl bg-red-600 text-white font-extrabold
                    shadow-[0_10px_35px_rgba(220,38,38,0.25)]
                    disabled:opacity-40 disabled:shadow-none"
                >
                  {submitting ? "Scaricamento…" : "Conferma Scarico"}
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

function ScaricoSkeleton() {
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
