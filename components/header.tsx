"use client";

import { Menu, LogOut } from "lucide-react";
import { useUI } from "@/lib/ui-store";
import { useRouter } from "next/navigation";

export default function Header({ title }: { title: string }) {
  const { toggleSidebar } = useUI();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", {
      method: "POST",
    });

    router.push("/login");
  }

  return (
    <header className="w-full h-20 bg-scz-dark border-b border-scz-medium/40 
      px-8 flex items-center justify-between shadow-premium">

      {/* TITLE */}
      <h2 className="text-2xl font-semibold text-white tracking-tight">
        {title}
      </h2>

      <div className="flex items-center gap-3">
        
        {/* LOGOUT BUTTON */}
        <button
          onClick={handleLogout}
          className="p-3 rounded-xl bg-scz-medium/40 hover:bg-scz-medium/60 transition"
        >
          <LogOut size={22} className="text-white" />
        </button>

        {/* SIDEBAR TOGGLE */}
        <button
          onClick={toggleSidebar}
          className="p-3 rounded-xl bg-scz-medium/40 hover:bg-scz-medium/60 transition"
        >
          <Menu size={22} className="text-white" />
        </button>
      </div>
    </header>
  );
}
