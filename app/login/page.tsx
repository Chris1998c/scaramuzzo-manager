"use client";

import { useState } from "react";
import { motion } from "framer-motion";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

const res = await fetch("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});


    if (!res.ok) {
      const { error } = await res.json();
      setError(error);
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-6 bg-[var(--bg)] overflow-hidden">

      {/* Radial Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.10),transparent_70%)] opacity-30" />

      {/* TITLE */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-16"
      >
        <h1 className="text-5xl font-serif tracking-wide text-[var(--text)] drop-shadow">
          Scaramuzzo Manager
        </h1>
      </motion.div>

      {/* LOGO */}
      <motion.img
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        src="/logo-scaramuzzo.webp"
        className="w-28 mb-10 opacity-95 drop-shadow-[0_0_25px_rgba(0,0,0,0.4)]"
      />

      {/* CARD */}
      <motion.div
        initial={{ opacity: 0, y: 35 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.1 }}
        className="
          w-full max-w-xl px-10 py-12
          rounded-3xl bg-[rgba(36,20,14,0.7)]
          backdrop-blur-xl border border-[var(--border)]/50
          shadow-card space-y-10
        "
      >
        {error && <p className="text-red-400 text-center">{error}</p>}

        <form onSubmit={handleLogin} className="flex flex-col space-y-8">
          
          {/* EMAIL */}
          <div className="flex flex-col space-y-2">
            <label className="text-[var(--accent)] text-sm">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Inserisci la tua email"
              className="
                w-full px-4 py-4 rounded-xl
                bg-white/10 border border-white/20
                text-white placeholder:text-white/40
                focus:border-white/40 outline-none
              "
            />
          </div>

          {/* PASSWORD */}
          <div className="flex flex-col space-y-2">
            <label className="text-[var(--accent)] text-sm">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Inserisci la password"
              className="
                w-full px-4 py-4 rounded-xl
                bg-white/10 border border-white/20
                text-white placeholder:text-white/40
                focus:border-white/40 outline-none
              "
            />
          </div>

          <button
            type="submit"
            className="
              w-full py-4 rounded-xl
              bg-[var(--accent)] text-[var(--bg)]
              font-semibold tracking-widest uppercase text-sm
              shadow-soft hover:brightness-110 transition
            "
          >
            Accedi
          </button>
        </form>
      </motion.div>
    </div>
  );
}
