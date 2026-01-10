import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="bg-[var(--card)] rounded-2xl p-10 w-full max-w-md text-center shadow-xl">

        {/* LOGO */}
        <div className="flex justify-center mb-6">
          <Image
            src="/logo-scaramuzzo.webp"
            alt="Scaramuzzo"
            width={96}
            height={96}
            className="opacity-95"
            priority
          />
        </div>

        <h1 className="text-3xl font-bold tracking-wide mb-2">
          Scaramuzzo Manager
        </h1>

        <p className="text-sm text-[var(--accent)] mb-8">
          Gestionale interno – accesso riservato
        </p>

        <div className="flex flex-col gap-3">
          <Link
            href="/login"
            className="w-full py-3 rounded-xl bg-[var(--accent)] text-black font-semibold hover:opacity-90 transition"
          >
            Accedi al gestionale
          </Link>

          <a
            href="https://scaramuzzo.green"
            target="_blank"
            className="w-full py-3 rounded-xl border border-white/20 text-sm hover:bg-white/5 transition"
          >
            Vai al sito ufficiale
          </a>
        </div>
      </div>
    </main>
  );
}
