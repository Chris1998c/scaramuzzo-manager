# Bridge security roadmap — Manager + Print Bridge

## Fase attuale (v1.1)

| Componente | Stato |
|------------|--------|
| Print Bridge PC cassa | Può usare `SUPABASE_SERVICE_ROLE_KEY` (temporaneo) |
| Autenticazione verso Manager | `POST /api/bridge/heartbeat` con **Bearer bridge token** (hash in DB) |
| Dashboard | `/dashboard/fiscale/bridge` — stato da heartbeat |
| Token management | Coordinator: crea installation, mint token, revoke |

**Miglioramento immediato:** sul PC cassa configurare `BRIDGE_HEARTBEAT_URL` + token mintato dal Manager (non service role per heartbeat).

Il service role resta solo per `claim` / `finalize` fino alla fase finale.

---

## Fase finale (target)

Il bridge **non** chiama più Supabase direttamente.

```
PC cassa (bridge token)
    → Manager API (session-less, Bearer bridge token)
        → supabaseAdmin (solo server Manager)
            → claim_fiscal_print_jobs / finalize_fiscal_job_atomic / …
```

### Endpoint Manager da implementare

| Bridge oggi (Supabase RPC) | Manager API futura |
|----------------------------|-------------------|
| `claim_fiscal_print_jobs` | `POST /api/bridge/fiscal-jobs/claim` |
| `finalize_fiscal_job_atomic` | `POST /api/bridge/fiscal-jobs/:id/finalize` |
| `requeue_fiscal_print_job` (non critici) | `POST /api/bridge/fiscal-jobs/:id/requeue` |
| select queue stats | incluso in heartbeat o `GET /api/bridge/fiscal-jobs/stats` |

**Invarianti da preservare:**

- `p_bridge_id` + `p_salon_id` obbligatori
- Nessun retry automatico post-`soap_sent`
- Finalize idempotente (`already_finalized`)
- Worker seriale `p_limit=1` lato bridge (unchanged)

---

## Opzioni (allineato a `scaramuzzo-print-bridge/docs/SECURITY_MODEL.md`)

1. **Manager proxy (consigliato a lungo termine)** — service role solo su Manager.
2. **Supabase Edge Function** — bridge token → Edge → RPC (service role in Edge).
3. **Service role su PC** — solo transitorio; da rimuovere.

---

## Checklist rimozione service role dal bridge

- [ ] Manager espone claim/finalize/requeue con bridge token
- [ ] Bridge: rimuovere `@supabase/supabase-js` worker path
- [ ] Bridge: `BRIDGE_MANAGER_API_URL` + stesso token heartbeat
- [ ] Rotazione token per salone documentata
- [ ] Pilota 4 saloni con solo token su PC
- [ ] Audit: nessun `.env` con service role su cassa

---

## SaaS foundation (preparato)

- `bridge_installations.tenant_id` nullable
- `resolveTenantIdForBridge()` → `null` oggi
- Heartbeat response `flags.tenant_ready: true` per estensioni future

Nessun billing / multi-company UI in questa fase.
