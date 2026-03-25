import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

export default function ClienteAreaLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-scz-darker text-[var(--text)]">
      <header className="border-b border-[#5c3a21]/50 bg-[#24140e]/80 backdrop-blur-md">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link href="/dashboard" className="flex items-center gap-3 min-w-0">
            <Image
              src="/logo-scaramuzzo.webp"
              width={40}
              height={40}
              alt="Scaramuzzo"
              className="rounded-xl border border-white/10 shrink-0"
            />
            <div className="min-w-0">
              <div className="text-[10px] font-black tracking-[0.2em] text-white/40 uppercase">
                Area cliente
              </div>
              <div className="font-bold text-[#f3d8b6] truncate text-sm">
                Scaramuzzo Manager
              </div>
            </div>
          </Link>
          <Link
            href="/dashboard"
            className="text-xs font-semibold text-[#f3d8b6]/90 hover:text-[#f3d8b6] whitespace-nowrap"
          >
            Torna al menu
          </Link>
        </div>
      </header>
      <div className="max-w-lg mx-auto px-4 py-10">{children}</div>
    </div>
  );
}
