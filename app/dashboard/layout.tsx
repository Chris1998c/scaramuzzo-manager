"use client";

import Sidebar from "@/components/sidebar";
import Header from "@/components/header";
import { useUI } from "@/lib/ui-store";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { sidebarOpen } = useUI();
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth > 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return (
    <div className="min-h-screen flex bg-scz-darker">
      {/* SIDEBAR */}
      <Sidebar />

      {/* MAIN */}
      <motion.div
        animate={{
          marginLeft: isDesktop ? (sidebarOpen ? "16rem" : "0rem") : "0rem",
        }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
        className="flex flex-col flex-1"
      >
        <Header />
        <main className="p-8">{children}</main>
      </motion.div>
    </div>
  );
}
