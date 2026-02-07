import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden">

      {/* BACKGROUND DECOR */}
      <div className="absolute inset-0">
        <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-[#f3d8b6]/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-[#9b6b43]/10 blur-3xl" />
      </div>

      {/* CARD */}
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-[var(--card)]/80 backdrop-blur-xl p-10 shadow-2xl">

        {/* LOGO */}
        <div className="flex justify-center mb-6">
          <div className="relative h-24 w-24 rounded-2xl bg-black/20 flex items-center justify-center">
            <Image
              src="/logo-scaramuzzo.webp"
              alt="Scaramuzzo"
              width={80}
              height={80}
              className="opacity-95"
              priority
            />
          </div>
        </div>

        {/* TITLE */}
        <h1 className="text-3xl font-semibold tracking-wide text-center">
          Scaramuzzo Manager
        </h1>

        <p className="mt-2 text-center text-sm text-[var(--accent)]/80">
          Gestionale interno · uso riservato
        </p>

        {/* DIVIDER */}
        <div className="my-8 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        {/* ACTIONS */}
        <div className="flex flex-col gap-3">
          <Link
            href="/login"
            className="group relative w-full overflow-hidden rounded-xl bg-[var(--accent)] px-6 py-3 text-center font-semibold text-black transition"
          >
            <span className="relative z-10">Accedi al gestionale</span>
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition bg-white/20" />
          </Link>

          <a
            href="https://scaramuzzo.green"
            target="_blank"
            className="w-full rounded-xl border border-white/15 px-6 py-3 text-center text-sm text-white/80 hover:bg-white/5 transition"
          >
            Vai al sito ufficiale
          </a>
        </div>

        {/* FOOTER */}
        <div className="mt-8 text-center text-xs text-white/40">
          © {new Date().getFullYear()} Scaramuzzo Studio SRL
        </div>
      </div>
    </main>
  );
}
