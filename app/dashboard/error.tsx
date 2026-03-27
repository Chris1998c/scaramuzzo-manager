"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white">
      <div className="max-w-[1100px] mx-auto space-y-4">
        <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6">
          <div className="text-xs font-black uppercase tracking-wider text-red-200/80">
            Errore
          </div>
          <h1 className="mt-2 text-2xl font-extrabold text-white">
            Impossibile caricare la pagina
          </h1>
          <p className="mt-2 text-sm text-white/70">
            Riprova. Se il problema persiste, contatta l’amministratore.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-xl bg-white/10 border border-white/10 px-4 py-2 font-bold hover:bg-white/15 transition"
            >
              Riprova
            </button>
            <a
              href="/dashboard"
              className="rounded-xl bg-black/30 border border-white/10 px-4 py-2 font-bold hover:bg-black/40 transition"
            >
              Torna alla dashboard
            </a>
          </div>
        </div>

        <details className="rounded-2xl border border-white/10 bg-black/20 p-4 text-xs text-white/60">
          <summary className="cursor-pointer font-bold text-white/70">
            Dettagli tecnici
          </summary>
          <pre className="mt-3 whitespace-pre-wrap break-words">
            {error?.message ?? "unknown"}
          </pre>
        </details>
      </div>
    </div>
  );
}

