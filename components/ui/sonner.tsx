"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster(props: React.ComponentProps<typeof SonnerToaster>) {
  return (
    <SonnerToaster
      position="top-right"
      richColors={false}
      closeButton
      expand
      duration={3500}
      toastOptions={{
        classNames: {
          toast:
            "rounded-xl border border-white/10 bg-scz-dark text-white shadow-[0_4px_24px_-4px_rgba(0,0,0,0.45)]",
          title: "text-sm font-bold text-[#f3d8b6]",
          description: "text-xs text-white/65",
          actionButton:
            "rounded-lg bg-[#f3d8b6]/15 border border-[#f3d8b6]/25 text-[#f3d8b6] text-xs font-bold",
          cancelButton:
            "rounded-lg bg-black/30 border border-white/10 text-white/70 text-xs",
          closeButton:
            "border-white/10 bg-black/30 text-white/60 hover:text-white/90",
        },
      }}
      {...props}
    />
  );
}
