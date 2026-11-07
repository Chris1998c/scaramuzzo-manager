import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

export default function ClienteAreaLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-scz-darker text-[var(--text)]">
      <header className="border-b border-white/[0.06] bg-scz-dark/90">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
            <Image
              src="/logo-scaramuzzo.webp"
              width={36}
              height={36}
              alt=""
              className="h-9 w-9 object-contain shrink-0"
            />
            <span className="font-semibold text-[#f3d8b6] truncate text-sm">
              Scaramuzzo Manager
            </span>
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-white/55 hover:text-[#f3d8b6] whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6]/50 rounded"
          >
            Torna al menu
          </Link>
        </div>
      </header>
      <div className="max-w-lg mx-auto px-4 py-6">{children}</div>
    </div>
  );
}
