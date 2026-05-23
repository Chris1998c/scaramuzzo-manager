"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { MAGAZZINO_CENTRALE_ID, salonLabel } from "@/lib/constants";

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function NuovoProdottoPage() {
  const { role, isReady, activeSalonId, allowedSalons, receptionSalonId } = useActiveSalon();

  const isReception = role === "reception";
  const isWarehouse = role === "magazzino" || role === "coordinator";

  const stockTargetSalonId = isReception ? receptionSalonId : activeSalonId;

  const stockTargetLabel = useMemo(() => {
    if (stockTargetSalonId == null) return null;
    const name = allowedSalons.find((s) => s.id === stockTargetSalonId)?.name ?? salonLabel(stockTargetSalonId);
    const isHub = stockTargetSalonId === MAGAZZINO_CENTRALE_ID;
    return name
      ? `${name.split(" - ")[0]}${isHub ? " (hub)" : ""} · ID ${stockTargetSalonId}`
      : `Salone ${stockTargetSalonId}`;
  }, [stockTargetSalonId, allowedSalons]);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [barcode, setBarcode] = useState("");
  const [cost, setCost] = useState("");
  const [type, setType] = useState<"rivendita" | "uso-interno" | "store">(
    "rivendita"
  );
  const [initialQty, setInitialQty] = useState("0");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pendingRequestIdRef = useRef<string | null>(null);

  async function creaProdotto() {
    if (!name || !category) return;
    if (stockTargetSalonId == null) {
      toast.error(
        isReception
          ? "Salone non associato al tuo account. Contatta l'amministratore."
          : "Seleziona il salone di destinazione dall’header (Vista), poi riprova."
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
          barcode: barcode || null,
          cost: Number(cost) || 0,
          type,
          description: description || null,
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
            ? `Prodotto creato. Giacenza iniziale: ${stockTargetLabel}.`
            : "Prodotto creato.",
      );
    } catch {
      toast.error("Errore di rete durante la creazione.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isReady) {
    return (
      <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-white">
        Caricamento…
      </div>
    );
  }

  if (!isWarehouse && !isReception) {
    return (
      <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-red-500">
        Non hai i permessi.
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-white">
      <h1 className="text-3xl font-bold mb-4">Nuovo prodotto</h1>
      {stockTargetLabel ? (
        <p className="text-sm text-white/70 max-w-xl mb-6 leading-relaxed">
          La <strong className="text-[#f3d8b6]">quantità iniziale</strong> (se maggiore di 0) viene
          caricata tramite movimento di stock su{" "}
          <span className="text-white/90 font-semibold">{stockTargetLabel}</span>.
          {isWarehouse ? (
            <>
              {" "}
              Cambia la <strong className="text-white/90">Vista</strong> in alto se ti serve un’altra
              sede o il magazzino centrale.
            </>
          ) : (
            <> La giacenza iniziale è sempre sul tuo salone.</>
          )}
        </p>
      ) : (
        <p className="text-sm text-amber-200/90 max-w-xl mb-6">
          {isReception
            ? "Nessun salone operativo associato al tuo account."
            : "Seleziona un salone dall’header per definire dove registrare la giacenza iniziale."}
        </p>
      )}

      <div className="bg-[#FFF9F4] p-8 rounded-2xl text-[#341A09] space-y-6 max-w-xl">
        <input
          className="p-4 w-full rounded-xl border"
          placeholder="Nome prodotto"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <input
          className="p-4 w-full rounded-xl border"
          placeholder="Categoria"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />

        <input
          className="p-4 w-full rounded-xl border"
          placeholder="Barcode"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
        />

        <input
          type="number"
          className="p-4 w-full rounded-xl border"
          placeholder="Costo"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
        />

        <select
          className="p-4 w-full rounded-xl border bg-white"
          value={type}
          onChange={(e) => setType(e.target.value as any)}
        >
          <option value="rivendita">Rivendita</option>
          <option value="uso-interno">Uso interno</option>
          <option value="store">Store</option>
        </select>

        <div>
          <label className="block text-sm font-semibold text-[#341A09] mb-2">
            Quantità iniziale ({stockTargetLabel ?? (isReception ? "salone non associato" : "scegli salone dall’header")})
          </label>
          <input
            type="number"
            min={0}
            className="p-4 w-full rounded-xl border"
            placeholder="0 = nessuna giacenza al momento"
            value={initialQty}
            onChange={(e) => setInitialQty(e.target.value)}
          />
          <p className="mt-1.5 text-xs text-[#5c3a21]/90">
            {isReception
              ? "Viene accreditata sul tuo salone (vedi testo sopra)."
              : "Viene accreditata sul salone della Vista corrente (vedi testo sopra)."}
          </p>
        </div>

        <textarea
          className="p-4 w-full rounded-xl border min-h-[120px]"
          placeholder="Descrizione"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <button
          onClick={creaProdotto}
          className="w-full bg-[#0FA958] text-white p-4 rounded-2xl text-xl font-bold"
        >
          Crea Prodotto
        </button>
      </div>
    </div>
  );
}
