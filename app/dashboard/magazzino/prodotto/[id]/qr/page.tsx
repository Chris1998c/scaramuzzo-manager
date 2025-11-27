"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

export default function QRProdotto({ params }: { params: { id: string } }) {
  const [qr, setQr] = useState<string>("");

  useEffect(() => {
    async function generateQR() {
      try {
        const dataUrl = await QRCode.toDataURL(
          `${window.location.origin}/dashboard/magazzino/prodotto/${params.id}`,
          {
            width: 500,
            margin: 1,
            color: {
              dark: "#341A09",   // colore del tuo brand
              light: "#FFF9F4",
            },
          }
        );
        setQr(dataUrl);
      } catch (err) {
        console.error("Errore generazione QR:", err);
      }
    }

    generateQR();
  }, [params.id]);

  return (
    <div className="px-6 py-10 bg-[#1A0F0A] min-h-screen text-white">
      <h1 className="text-3xl font-bold mb-6 text-white">QR del Prodotto</h1>

      {qr ? (
        <div className="flex flex-col items-center">
          <img
            src={qr}
            alt="QR Code"
            className="w-56 h-56 bg-white rounded-xl shadow-xl p-4"
          />

          <a
            href={qr}
            download={`prodotto_${params.id}.png`}
            className="mt-6 bg-[#B88A54] px-6 py-3 rounded-xl text-white text-lg shadow hover:scale-105 transition"
          >
            Scarica QR
          </a>
        </div>
      ) : (
        <p>Generazione QR…</p>
      )}
    </div>
  );
}
