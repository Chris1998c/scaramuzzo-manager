import "./globals.css";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

export const metadata = {
  title: "Scaramuzzo Manager",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <body className="min-h-screen font-sans bg-[var(--bg)] text-[var(--text)]">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
