"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabaseClient";
import { authUserFacingMessage } from "@/lib/authUserFacingError";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      setReady(true);

      if (!data.session) {
        setErr("Link non valido o scaduto. Rifai «Password dimenticata?» dal login.");
      }
    })();
  }, []);

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);

    if (password.trim().length < 6) {
      setErr("Password troppo corta (minimo 6 caratteri).");
      return;
    }
    if (password !== confirm) {
      setErr("Le password non coincidono.");
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErr(authUserFacingMessage(error, "update_password"));
      return;
    }

    setMsg("Password aggiornata. Ora puoi accedere.");
    setTimeout(() => {
      window.location.href = "/login";
    }, 800);
  }

  const field =
    "w-full px-3 py-2.5 rounded-lg bg-black/30 border border-white/10 text-white placeholder:text-white/35 focus:border-[#f3d8b6]/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f3d8b6]/35";

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-10 bg-[var(--bg)]">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Image
            src="/logo-scaramuzzo.webp"
            width={48}
            height={48}
            alt=""
            className="h-12 w-12 object-contain"
            priority
          />
          <h1 className="text-xl font-semibold text-[#f3d8b6]">Reimposta password</h1>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-scz-dark/80 px-5 py-6 space-y-4">
          {!ready ? (
            <p className="text-white/60 text-center text-sm">Caricamento…</p>
          ) : (
            <>
              {err ? (
                <p className="text-red-300 text-center text-sm" role="alert">
                  {err}
                </p>
              ) : null}
              {msg ? (
                <p className="text-emerald-300 text-center text-sm" role="status">
                  {msg}
                </p>
              ) : null}

              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="reset-pass" className="text-sm text-[#f3d8b6]/90">
                    Nuova password
                  </label>
                  <input
                    id="reset-pass"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={field}
                    placeholder="Minimo 6 caratteri"
                    autoComplete="new-password"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="reset-confirm" className="text-sm text-[#f3d8b6]/90">
                    Conferma password
                  </label>
                  <input
                    id="reset-confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className={field}
                    placeholder="Ripeti password"
                    autoComplete="new-password"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-lg bg-[#f3d8b6] text-[#1c0f0a] text-sm font-semibold hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d8b6] disabled:opacity-50 transition"
                  disabled={!!err && err.includes("Link")}
                >
                  Aggiorna password
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
