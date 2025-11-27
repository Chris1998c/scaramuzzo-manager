"use client";

import { Html5QrcodeScanner } from "html5-qrcode";
import { useEffect } from "react";

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  onScan: (code: string) => void;
}

export default function ScannerModal({ open, setOpen, onScan }: Props) {
  useEffect(() => {
    if (!open) return;

    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      { fps: 10, qrbox: 250 },
      false
    );

    scanner.render(
      (decoded) => {
        onScan(decoded);
        setOpen(false);
      },
      (error) => console.log("Scanner error:", error)
    );

    return () => {
      scanner.clear();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white text-[#341A09] p-6 rounded-2xl shadow-2xl w-[90%] max-w-md">
        <h2 className="text-xl font-semibold mb-4 text-center">Scanner QR</h2>

        <div id="qr-reader" className="w-full"></div>

        <button
          className="mt-6 w-full bg-red-600 text-white p-3 rounded-xl"
          onClick={() => setOpen(false)}
        >
          Chiudi
        </button>
      </div>
    </div>
  );
}
