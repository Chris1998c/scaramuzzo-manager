"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import {
  readStoredActiveSalonId,
  resolveDashboardLinkNavigationSalonId,
  withDashboardSalonHref,
} from "@/lib/dashboard/dashboardSalonQuerySync";

export type DashboardSecondaryLinkItem = {
  title: string;
  href: string;
};

/**
 * Link secondari Dashboard reattivi ad ActiveSalon.
 * Il clic legge la sede appena scelta (storage sync) anche se l’URL/RSC
 * della home non ha ancora rifetchato — evita Report sulla sede precedente.
 */
export default function DashboardSecondaryLinks({
  items,
}: {
  items: DashboardSecondaryLinkItem[];
}) {
  const router = useRouter();
  const { activeSalonId, canChooseSalon, isReady } = useActiveSalon();

  if (items.length === 0) return null;

  const seedSalon =
    canChooseSalon && isReady && activeSalonId != null && activeSalonId > 0
      ? activeSalonId
      : null;

  return (
    <nav
      className="flex flex-wrap items-center gap-x-1 gap-y-1 pt-1 px-0.5"
      aria-label="Altre sezioni"
    >
      {items.map((item, idx) => {
        const href = withDashboardSalonHref(item.href, seedSalon);
        const needsSalonSeed =
          item.href === "/dashboard/report" ||
          item.href === "/dashboard/impostazioni" ||
          item.href === "/dashboard/presenze";

        return (
          <span key={item.href} className="inline-flex items-center">
            {idx > 0 ? (
              <span className="mx-2 text-white/20" aria-hidden>
                ·
              </span>
            ) : null}
            <Link
              href={href}
              className="text-sm text-white/50 hover:text-[#f3d8b6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6]/50 rounded px-0.5 transition"
              onClick={(e) => {
                if (!needsSalonSeed || !canChooseSalon) return;
                const hrefSalonMatch = href.match(/[?&]salon_id=(\d+)/);
                const hrefSalonId = hrefSalonMatch ? Number(hrefSalonMatch[1]) : null;
                const salonId = resolveDashboardLinkNavigationSalonId({
                  storedActiveSalonId: readStoredActiveSalonId(),
                  contextActiveSalonId: activeSalonId,
                  hrefSalonId,
                });
                if (salonId == null) return;
                // Naviga sempre con l’ultima sede scelta (anche se href SSR/context è indietro).
                e.preventDefault();
                router.push(`${item.href}?salon_id=${salonId}`);
              }}
            >
              {item.title}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}
