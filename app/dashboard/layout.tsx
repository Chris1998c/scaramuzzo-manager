"use client";

import Sidebar from "@/components/sidebar";
import Header from "@/components/header";
import { useUI } from "@/lib/ui-store";
import { motion } from "framer-motion";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { sidebarOpen } = useUI();

  return (
    <div className="min-h-screen flex bg-scz-darker">
      {/* SIDEBAR */}
      <Sidebar />

      {/* MAIN */}
      <motion.div
        animate={{
          marginLeft:
            typeof window !== "undefined" && window.innerWidth > 768
              ? sidebarOpen
                ? "16rem"
                : "0rem"
              : "0",
        }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
        className="flex flex-col flex-1"
      >
        <Header title="Dashboard" />
        <main className="p-8">{children}</main>
      </motion.div>
    </div>
  );
}
