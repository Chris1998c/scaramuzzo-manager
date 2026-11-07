import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center px-5 bg-[var(--bg)]">
      <div className="w-full max-w-sm rounded-xl border border-white/[0.08] bg-scz-dark/90 px-6 py-8 space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Image
            src="/logo-scaramuzzo.webp"
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 object-contain"
            priority
          />
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[#f3d8b6]">
              Scaramuzzo Manager
            </h1>
            <p className="mt-1 text-sm text-white/45">Gestionale interno</p>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <Link
            href="/login"
            className="w-full rounded-lg bg-[#f3d8b6] px-4 py-2.5 text-center text-sm font-semibold text-[#1c0f0a] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6] transition"
          >
            Accedi
          </Link>
          <a
            href="https://scaramuzzo.green"
            target="_blank"
            rel="noreferrer"
            className="w-full rounded-lg border border-white/10 px-4 py-2.5 text-center text-sm text-white/70 hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6]/50 transition"
          >
            Sito ufficiale
          </a>
        </div>

        <p className="text-center text-xs text-white/35">
          © {new Date().getFullYear()} Scaramuzzo Studio SRL
        </p>
      </div>
    </main>
  );
}
