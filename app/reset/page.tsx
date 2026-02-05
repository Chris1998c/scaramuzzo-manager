// app/reset/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // quando apri il link della mail, Supabase mette i token nella sessione (magic link / recovery)
    // qui controlliamo solo che esista una sessione valida
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      setReady(true);

      if (!data.session) {
        setErr("Link non valido o scaduto. Rifai 'Password dimenticata?' dal login.");
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
      setErr(error.message);
      return;
    }

    setMsg("Password aggiornata! Ora puoi fare login.");
    setTimeout(() => {
      window.location.href = "/login";
    }, 800);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-[var(--bg)]">
      <div className="w-full max-w-md rounded-3xl bg-[rgba(36,20,14,0.7)] backdrop-blur-xl border border-white/10 p-8 space-y-6">
        <h1 className="text-2xl font-serif text-white text-center">Reimposta password</h1>

        {!ready ? (
          <p className="text-white/70 text-center">Caricamento…</p>
        ) : (
          <>
            {err && <p className="text-red-400 text-center">{err}</p>}
            {msg && <p className="text-green-300 text-center">{msg}</p>}

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-white/80">Nuova password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white outline-none"
                  placeholder="Min 6 caratteri"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-white/80">Conferma password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white outline-none"
                  placeholder="Ripeti password"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-[var(--accent)] text-[var(--bg)] font-semibold uppercase tracking-widest text-sm"
                disabled={!!err && err.includes("Link")}
              >
                Aggiorna password
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
