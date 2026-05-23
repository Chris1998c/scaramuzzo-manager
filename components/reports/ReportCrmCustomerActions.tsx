"use client";

import Link from "next/link";

type Props = {
  customerId: string;
  phone?: string | null;
  compact?: boolean;
};

function whatsAppHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}`;
}

function telHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  if (!digits) return null;
  return `tel:${digits}`;
}

export default function ReportCrmCustomerActions({ customerId, phone, compact }: Props) {
  const wa = whatsAppHref(phone);
  const tel = telHref(phone);
  const btn = compact
    ? "rounded-lg px-2.5 py-1.5 text-[11px] font-bold"
    : "rounded-lg px-3 py-1.5 text-xs font-bold";

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Link
        href={`/dashboard/clienti/${customerId}`}
        className={`${btn} border border-scz-gold/30 bg-scz-gold/10 text-scz-gold hover:bg-scz-gold/20`}
      >
        Apri profilo
      </Link>
      {wa ? (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className={`${btn} border border-emerald-500/30 bg-emerald-500/10 text-emerald-300`}
        >
          WhatsApp
        </a>
      ) : (
        <button
          type="button"
          disabled
          title="Numero non disponibile"
          className={`${btn} cursor-not-allowed border border-white/10 text-white/25`}
        >
          WhatsApp
        </button>
      )}
      {tel ? (
        <a href={tel} className={`${btn} border border-white/15 bg-black/30 text-white/80`}>
          Chiama
        </a>
      ) : (
        <button
          type="button"
          disabled
          title="Telefono non disponibile"
          className={`${btn} cursor-not-allowed border border-white/10 text-white/25`}
        >
          Chiama
        </button>
      )}
    </div>
  );
}
