"use client";

import { useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabaseClient";
import { authUserFacingMessage } from "@/lib/authUserFacingError";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(authUserFacingMessage(error, "login"));
      return;
    }

    window.location.href = "/dashboard";
  }

  async function handleForgotPassword() {
    setError("");

    const mail = email.trim();
    if (!mail) {
      setError("Inserisci prima la tua email, poi clicca «Password dimenticata?».");
      return;
    }

    const supabase = createClient();

    const { error } = await supabase.auth.resetPasswordForEmail(mail, {
      redirectTo: `${window.location.origin}/reset`,
    });

    if (error) {
      setError(authUserFacingMessage(error, "reset_email"));
      return;
    }

    setError("Ti ho inviato l’email per reimpostare la password.");
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-5 py-10 bg-[var(--bg)]">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Image
            src="/logo-scaramuzzo.webp"
            width={56}
            height={56}
            alt=""
            className="h-14 w-14 object-contain"
            priority
          />
          <h1 className="text-xl font-semibold tracking-tight text-[#f3d8b6]">
            Scaramuzzo Manager
          </h1>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-scz-dark/80 px-5 py-6 space-y-5">
          {error ? (
            <p className="text-sm text-center text-red-300" role="alert">
              {error}
            </p>
          ) : null}

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="text-sm text-[#f3d8b6]/90">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@esempio.it"
                className="w-full px-3 py-2.5 rounded-lg bg-black/30 border border-white/10 text-white placeholder:text-white/35 focus:border-[#f3d8b6]/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f3d8b6]/35"
              />
              <button
                type="button"
                onClick={handleForgotPassword}
                className="self-end text-xs text-white/55 hover:text-white underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6]/50 rounded"
              >
                Password dimenticata?
              </button>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="login-password" className="text-sm text-[#f3d8b6]/90">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full px-3 py-2.5 rounded-lg bg-black/30 border border-white/10 text-white placeholder:text-white/35 focus:border-[#f3d8b6]/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f3d8b6]/35"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-[#f3d8b6] text-[#1c0f0a] text-sm font-semibold hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6] transition"
            >
              Accedi
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
