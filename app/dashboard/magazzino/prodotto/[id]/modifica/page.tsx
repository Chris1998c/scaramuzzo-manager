"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";

export default function ModificaProdottoPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const productId = Number(idParam);
  const { role, isReady } = useActiveSalon();

  return (
    <div className="min-h-screen px-6 py-10 bg-[#1A0F0A] text-white">
      <div className="max-w-2xl space-y-4">
        <h1 className="text-3xl font-extrabold text-[#f3d8b6] tracking-tight">
          Modifica prodotto
        </h1>

        {!isReady ? (
          <div className="text-white/70">Caricamento…</div>
        ) : role !== "magazzino" && role !== "coordinator" ? (
          <div className="text-red-300">Non hai i permessi.</div>
        ) : (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200/90">
            Questa schermata è stata <b>disabilitata</b> perché eseguiva modifiche dirette da client
            (update/delete) e non è allineata alla policy enterprise “solo API + getUserAccess”.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/dashboard/magazzino/prodotto/${productId}`}
            className="rounded-xl bg-black/30 border border-white/10 px-4 py-2 font-bold hover:bg-black/40 transition"
          >
            Torna al prodotto
          </Link>
          <Link
            href="/dashboard/magazzino/inventario"
            className="rounded-xl bg-black/30 border border-white/10 px-4 py-2 font-bold hover:bg-black/40 transition"
          >
            Vai a inventario
          </Link>
        </div>
      </div>
    </div>
  );
}
