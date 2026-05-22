import "./globals.css";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata = {
  title: "Scaramuzzo Manager",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it" className={cn("font-sans", geist.variable)}>
      <body className="min-h-screen font-sans bg-[var(--bg)] text-[var(--text)]">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
