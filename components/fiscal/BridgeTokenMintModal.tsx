"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, X } from "lucide-react";

type Props = {
  open: boolean;
  token: string;
  bridgeId: string;
  onClose: () => void;
};

export default function BridgeTokenMintModal({ open, token, bridgeId, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const copyToken = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, [token]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bridge-token-modal-title"
    >
      <div
        className="w-full max-w-lg rounded-3xl border border-[#f3d8b6]/25 bg-gradient-to-b from-[#2a2218] to-scz-dark shadow-[0_24px_80px_rgba(0,0,0,0.55)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-white/10 bg-black/25">
          <div className="flex items-start gap-3 min-w-0">
            <div className="rounded-2xl border border-[#f3d8b6]/30 bg-[#f3d8b6]/10 p-2.5 shrink-0">
              <KeyRound className="text-[#f3d8b6]" size={24} />
            </div>
            <div className="min-w-0">
              <h2
                id="bridge-token-modal-title"
                className="text-xl font-extrabold text-[#f3d8b6] tracking-tight"
              >
                Nuovo token bridge
              </h2>
              <p className="text-sm text-[#c9b299] mt-1">
                Collegamento: <span className="font-mono text-[#f3d8b6]">{bridgeId}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 p-2 text-white/60 hover:text-white hover:bg-white/5"
            aria-label="Chiudi"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="text-sm font-bold text-amber-100">
              Copialo ora: non sarà più visibile
            </p>
            <p className="text-xs text-amber-200/80 mt-1 leading-relaxed">
              Il token viene mostrato una sola volta. Incollalo nel file di configurazione del Print
              Bridge sul PC cassa prima di chiudere questa finestra.
            </p>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-white/45 mb-2">
              Token completo
            </p>
            <div className="rounded-2xl border border-[#f3d8b6]/20 bg-black/50 p-4">
              <code className="block text-sm md:text-base font-mono text-[#f3d8b6] break-all leading-relaxed select-all">
                {token}
              </code>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void copyToken()}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[#f3d8b6] px-5 py-3.5 text-sm font-extrabold text-black hover:opacity-90 transition"
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
            {copied ? "Token copiato negli appunti" : "Copia token"}
          </button>
        </div>

        <div className="px-6 py-4 border-t border-white/10 bg-black/20 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-[#c9b299] hover:text-[#f3d8b6] hover:bg-white/5"
          >
            Ho copiato il token — chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
