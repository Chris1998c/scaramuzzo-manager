export default function DashboardNotFound() {
  return (
    <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white">
      <div className="max-w-[1100px] mx-auto">
        <div className="rounded-3xl border border-white/10 bg-scz-dark p-8">
          <div className="text-xs font-black uppercase tracking-wider text-white/50">
            404
          </div>
          <h1 className="mt-2 text-2xl font-extrabold text-[#f3d8b6]">
            Pagina non trovata
          </h1>
          <p className="mt-2 text-sm text-white/70">
            Il percorso richiesto non esiste o non è più disponibile.
          </p>
          <div className="mt-5">
            <a
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-xl bg-black/30 border border-white/10 px-4 py-2 font-bold hover:bg-black/40 transition"
            >
              Torna alla dashboard
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

