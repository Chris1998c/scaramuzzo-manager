"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type ApiJson = { success?: boolean; error?: string; code?: string };

type PostResult = ApiJson & { _status: number };

async function postJson(url: string, body: object): Promise<PostResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => ({}))) as ApiJson;
  return { ...data, _status: res.status };
}

export default function ClaimClienteView() {
  const [customerCode, setCustomerCode] = useState("");
  const [otp, setOtp] = useState("");
  const [phase, setPhase] = useState<"code" | "otp" | "done">("code");
  const [busy, setBusy] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setInlineError(null);
    const code = customerCode.trim();
    if (!code) {
      setInlineError("Inserisci il codice cliente che ti ha comunicato il salone.");
      return;
    }

    setBusy(true);
    try {
      const data = await postJson("/api/customer/claim/request-otp", {
        customer_code: code,
      });

      if (data.success === true) {
        toast.success("Se il codice è valido, riceverai il codice su WhatsApp.");
        setPhase("otp");
        setOtp("");
      } else {
        const msg =
          typeof data.error === "string"
            ? data.error
            : "Richiesta non riuscita.";
        setInlineError(msg);
        toast.error(msg);
      }
    } catch {
      const msg = "Errore di rete. Riprova.";
      setInlineError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setInlineError(null);
    const code = customerCode.trim();
    const pin = otp.trim().replace(/\D/g, "");
    if (!code) {
      setInlineError("Codice cliente mancante.");
      return;
    }
    if (!/^\d{4,8}$/.test(pin)) {
      setInlineError("Inserisci il codice numerico ricevuto su WhatsApp.");
      return;
    }

    setBusy(true);
    try {
      const data = await postJson("/api/customer/claim/verify-otp", {
        customer_code: code,
        otp: pin,
      });

      if (data.success === true) {
        setPhase("done");
        toast.success("Profilo collegato correttamente.");
      } else {
        const msg =
          typeof data.error === "string"
            ? data.error
            : "Verifica non riuscita.";
        setInlineError(msg);
        toast.error(msg);
      }
    } catch {
      const msg = "Errore di rete. Riprova.";
      setInlineError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[1.75rem] border border-[#5c3a21]/60 bg-[#24140e]/90 p-8 md:p-10 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-sm">
      <div className="space-y-2 mb-8">
        <h1 className="text-2xl md:text-3xl font-black text-[#f3d8b6] tracking-tight">
          Collega il tuo profilo
        </h1>
        <p className="text-sm text-[#c9b299] leading-relaxed">
          Conferma di essere il titolare dell&apos;anagrafica del salone. Ti invieremo un codice
          monouso via WhatsApp al numero registrato in salone (non serve inserirlo qui).
        </p>
      </div>

      {inlineError ? (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200"
        >
          {inlineError}
        </div>
      ) : null}

      {phase === "done" ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-emerald-500/35 bg-emerald-950/30 px-4 py-4 text-sm text-emerald-100/95">
            Il tuo account è ora collegato al profilo cliente. Da qui puoi usare le funzioni
            riservate quando disponibili.
          </div>
          <Link
            href="/dashboard"
            className="flex w-full items-center justify-center rounded-xl bg-[#f3d8b6] py-3.5 text-sm font-bold text-[#1c0f0a] hover:brightness-110 transition"
          >
            Vai alla home
          </Link>
        </div>
      ) : phase === "code" ? (
        <form onSubmit={handleRequestOtp} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="customer_code" className="text-xs font-bold uppercase tracking-wider text-[#f3d8b6]/80">
              Codice cliente
            </label>
            <input
              id="customer_code"
              className="input"
              autoComplete="off"
              placeholder="es. CLI-00042"
              value={customerCode}
              onChange={(e) => setCustomerCode(e.target.value)}
              disabled={busy}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#f3d8b6] py-3.5 text-sm font-bold text-[#1c0f0a] hover:brightness-110 transition disabled:opacity-60"
          >
            {busy ? <Loader2 className="animate-spin" size={18} /> : null}
            {busy ? "Invio in corso…" : "Invia codice WhatsApp"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="space-y-6">
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-[#c9b299]">
            Codice cliente:{" "}
            <span className="font-mono text-[#f3d8b6]">{customerCode.trim() || "—"}</span>
          </div>
          <div className="space-y-2">
            <label htmlFor="otp" className="text-xs font-bold uppercase tracking-wider text-[#f3d8b6]/80">
              Codice WhatsApp
            </label>
            <input
              id="otp"
              className="input font-mono text-lg tracking-[0.2em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="• • • • • •"
              maxLength={8}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              disabled={busy}
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setPhase("code");
                setInlineError(null);
                setOtp("");
              }}
              className="flex-1 rounded-xl border border-[#5c3a21]/80 py-3.5 text-sm font-semibold text-[#f3d8b6] hover:bg-white/5 transition disabled:opacity-50"
            >
              Indietro
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-[2] flex items-center justify-center gap-2 rounded-xl bg-[#0FA958] py-3.5 text-sm font-bold text-white hover:brightness-110 transition disabled:opacity-60"
            >
              {busy ? <Loader2 className="animate-spin" size={18} /> : null}
              {busy ? "Verifica…" : "Verifica e collega"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
