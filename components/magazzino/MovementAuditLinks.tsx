"use client";

import Link from "next/link";
import { parseMovementReasonLinks } from "@/lib/magazzino/movementLinks";

export function MovementAuditLinks({
  movementType,
  productId,
  reason,
}: {
  movementType: string;
  productId: number;
  reason?: string | null;
}) {
  const { saleId, transferId } = parseMovementReasonLinks(reason);

  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <Link
        href={`/dashboard/magazzino/prodotto/${productId}`}
        className="text-[#f3d8b6]/90 hover:text-[#f3d8b6] underline underline-offset-2"
      >
        Prodotto
      </Link>
      {saleId != null && (
        <span className="text-white/40">·</span>
      )}
      {saleId != null && (
        <span className="text-white/50" title="Vendita collegata">
          Vendita #{saleId}
        </span>
      )}
      {transferId != null && (
        <>
          <span className="text-white/40">·</span>
          <Link
            href={`/dashboard/magazzino/trasferimenti/${transferId}`}
            className="text-[#f3d8b6]/90 hover:text-[#f3d8b6] underline underline-offset-2"
          >
            Trasferimento #{transferId}
          </Link>
        </>
      )}
      {movementType === "trasferimento" && transferId == null && reason ? (
        <span className="text-white/40 truncate max-w-[140px]" title={reason}>
          {reason}
        </span>
      ) : null}
    </div>
  );
}
