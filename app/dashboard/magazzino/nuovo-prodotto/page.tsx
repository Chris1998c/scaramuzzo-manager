"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PackagePlus } from "lucide-react";
import { useMagazzinoSalonContext } from "@/hooks/useMagazzinoSalonContext";
import { MAGAZZINO_CENTRALE_ID, salonLabel } from "@/lib/constants";
import { magazzinoLightInputClass } from "@/lib/magazzino/magazzinoUi";
import {
  MagazzinoBackLink,
  MagazzinoHero,
  MagazzinoLoading,
  MagazzinoPageShell,
  MagazzinoSalonContextBar,
} from "@/components/magazzino/ui/magazzinoUi";

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function NuovoProdottoPage() {
  const ctx = useMagazzinoSalonContext();

  const stockTargetSalonId = ctx.isReception ? ctx.receptionSalonId : ctx.activeSalonId;

  const stockTargetLabel = useMemo(() => {
    if (stockTargetSalonId == null) return null;
    const name =
      ctx.allowedSalons.find((s) => s.id === stockTargetSalonId)?.name ??
      salonLabel(stockTargetSalonId);
    const isHub = stockTargetSalonId === MAGAZZINO_CENTRALE_ID;
    return name
      ? `${name.split(" - ")[0]}${isHub ? " (hub)" : ""} · ID ${stockTargetSalonId}`
      : `Salone ${stockTargetSalonId}`;
  }, [stockTargetSalonId, ctx.allowedSalons]);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [barcode, setBarcode] = useState("");
  const [cost, setCost] = useState("");
  const [type, setType] = useState<"rivendita" | "uso-interno" | "store">("rivendita");
  const [initialQty, setInitialQty] = useState("0");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pendingRequestIdRef = useRef<string | null>(null);

  async function creaProdotto() {
    if (!name.trim() || !category.trim()) {
      toast.error("Nome e categoria sono obbligatori.");
      return;
    }
    if (stockTargetSalonId == null) {
      toast.error(
        ctx.isReception
          ? "Salone non associato al tuo account."
          : "Seleziona il salone dall'header, poi riprova.",
      );
      return;
    }
    if (submitting) return;

    const requestId = pendingRequestIdRef.current ?? createRequestId();
    pendingRequestIdRef.current = requestId;
    const qty = Number(initialQty) || 0;

    setSubmitting(true);
    try {
      const res = await fetch("/api/magazzino/nuovo-prodotto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category: category.trim(),
          barcode: barcode.trim() || null,
          cost: Number(cost) || 0,
          type,
          description: description.trim() || null,
          initialQty: qty,
          initialStockSalonId: stockTargetSalonId,
          request_id: requestId,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Errore creazione prodotto");
        return;
      }

      pendingRequestIdRef.current = null;
      setName("");
      setCategory("");
      setBarcode("");
      setCost("");
      setType("rivendita");
      setInitialQty("0");
      setDescription("");

      toast.success(
        json.idempotent
          ? "Prodotto già creato (richiesta ripetuta)."
          : qty > 0 && stockTargetLabel
            ? `Prodotto creato con ${qty} pz su ${stockTargetLabel}.`
            : "Prodotto creato.",
        { duration: 6000 },
      );
    } catch {
      toast.error("Errore di rete durante la creazione.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!ctx.isReady) return <MagazzinoLoading />;

  if (!ctx.isWarehouse && !ctx.isReception) {
    return (
      <MagazzinoPageShell compact>
        <p className="text-red-400">Non hai i permessi per creare prodotti.</p>
      </MagazzinoPageShell>
    );
  }

  return (
    <MagazzinoPageShell>
      <MagazzinoHero
        title="Nuovo prodotto"
        icon={PackagePlus}
        compact
        actions={<MagazzinoBackLink href="/dashboard/magazzino" />}
        subtitle="Crea un articolo nel catalogo. La giacenza iniziale è opzionale."
      />

      <MagazzinoSalonContextBar
        contextLabel={stockTargetLabel ?? ctx.contextLabel}
        contextKind={ctx.contextKind}
        hint={
          stockTargetLabel
            ? "Giacenza iniziale accreditata su questa sede"
            : "Seleziona salone dall'header per la giacenza iniziale"
        }
      />

      <div className="rounded-2xl border border-[#5c3a21]/50 bg-[#24140e]/50 p-4 md:p-6 max-w-2xl">
        <div className="rounded-xl bg-[#FFF9F4] text-[#341A09] p-5 md:p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#5c3a21]/80 mb-1.5">
              Nome *
            </label>
            <input
              className={magazzinoLightInputClass}
              placeholder="Es. Shampoo ristrutturante 250ml"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#5c3a21]/80 mb-1.5">
                Categoria *
              </label>
              <input
                className={magazzinoLightInputClass}
                placeholder="Es. Cura capelli"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#5c3a21]/80 mb-1.5">
                Barcode / EAN
              </label>
              <input
                className={`${magazzinoLightInputClass} font-mono`}
                placeholder="Scansiona o digita"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#5c3a21]/80 mb-1.5">
                Costo (€)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                className={magazzinoLightInputClass}
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#5c3a21]/80 mb-1.5">
                Tipo
              </label>
              <select
                className={`${magazzinoLightInputClass} bg-white`}
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
              >
                <option value="rivendita">Rivendita</option>
                <option value="uso-interno">Uso interno</option>
                <option value="store">Store</option>
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-[#B88A54]/30 bg-[#FFF9F4] p-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#5c3a21]/80 mb-1.5">
              Giacenza iniziale
            </label>
            <input
              type="number"
              min={0}
              className={magazzinoLightInputClass}
              placeholder="0 = solo anagrafica"
              value={initialQty}
              onChange={(e) => setInitialQty(e.target.value)}
            />
            <p className="mt-2 text-xs text-[#5c3a21]/80 leading-relaxed">
              {stockTargetLabel
                ? `Accreditata su ${stockTargetLabel} tramite movimento di carico.`
                : "Associa un salone per registrare la giacenza iniziale."}
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#5c3a21]/80 mb-1.5">
              Descrizione
            </label>
            <textarea
              className={`${magazzinoLightInputClass} min-h-[100px] resize-y`}
              placeholder="Note interne (opzionale)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={creaProdotto}
            className="w-full rounded-xl bg-[#0FA958] text-white py-3.5 font-bold text-base hover:opacity-95 transition disabled:opacity-50"
          >
            {submitting ? "Creazione…" : "Crea prodotto"}
          </button>
        </div>
      </div>
    </MagazzinoPageShell>
  );
}
