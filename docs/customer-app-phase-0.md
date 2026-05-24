# App Clienti Scaramuzzo — Phase 0 (backend)

Documento interno per le API future sotto `/api/customer/v1/*`.  
**Phase 0 non implementa route HTTP** — solo migration RLS, flag catalogo, helper `requireCustomerContext`.

## Principi

- **RLS-first**: il cliente autenticato e linkato legge solo i propri dati (`is_customer_app_user`).
- **`getUserAccess`**: source of truth per ruolo; le API cliente richiedono `role === 'cliente'`.
- **`requireCustomerContext`**: obbligatorio su ogni route v1; `customer_id` **solo** da `customer_auth_links`, mai dal client.
- **Mutazioni booking**: Phase 1+ via API server con `service_role` e validazione agenda — non PostgREST diretto.
- **No trust client-side**: prezzo, durata, `customer_id`, `salon_id` non autoritativi dal body senza verifica server.

## Customer context

File: `app/api/customer/v1/_lib/requireCustomerContext.ts`

```ts
const ctx = await requireCustomerContext();
// ctx.authUserId — auth.users.id
// ctx.customerId  — public.customers.id (da link)
// ctx.access      — getUserAccess()
```

Errori:

| Status | Condizione |
|--------|------------|
| 401 | Non autenticato |
| 403 | Ruolo ≠ `cliente` |
| 403 | Nessuna riga in `customer_auth_links` |

## Database (Phase 0 migration)

- `appointments.source`: valori ammessi `booking`, `walk_in`, **`customer_app`**
- `services.visible_in_customer_app`: boolean, default `false`; seed iniziale = `visible_in_agenda`
- Policy RLS (solo SELECT):
  - `appointments_select_own` → `is_customer_app_user(customer_id)`
  - `appointment_services_select_own` → join su appointment del cliente linkato

Nessun GRANT INSERT/UPDATE/DELETE su `appointments` / `appointment_services` per il flusso cliente (invariato rispetto hardening P0).

## Route pianificate (Phase 1+)

Base URL proposta: **`/api/customer/v1`**

Tutte: `requireCustomerContext()`, session Supabase (cookie o Bearer futuro), **no** `supabaseAdmin` esposto al client.

### `GET /api/customer/v1/salons`

**Scopo:** elenco saloni prenotabili (escludere Magazzino Centrale / non retail).

| | |
|--|--|
| Input | — |
| Output | `{ salons: [{ id, name }] }` |
| Tabelle | `salons` (+ eventuale config booking per salone) |
| Sicurezza | Lista pubblica per utenti autenticati cliente; nessun dato fiscale/stock |

### `GET /api/customer/v1/services?salon_id={id}`

**Scopo:** catalogo prenotabile per salone.

| | |
|--|--|
| Input | `salon_id` (query, obbligatorio) |
| Output | `{ services: [{ id, name, duration_minutes, price_indicator?, category? }] }` |
| Tabelle | `services`, `service_prices` |
| Sicurezza | Filtro `active = true` AND `visible_in_customer_app = true`; prezzi risolti server-side da `service_prices` per `salon_id` |

### `GET /api/customer/v1/availability`

**Scopo:** slot prenotabili.

| | |
|--|--|
| Input | `salon_id`, `date` (YYYY-MM-DD), `service_ids[]`, opz. `staff_id` |
| Output | `{ slots: [{ start_time, end_time, staff_id? }] }` |
| Logica | Riutilizzo `lib/agenda/assertStaffSchedule`, `assertStaffSlotFree` (probe read-only) |
| Sicurezza | Rate limit; nessun leak agenda altri clienti |

### `POST /api/customer/v1/bookings`

**Scopo:** creare prenotazione.

| | |
|--|--|
| Input | `salon_id`, `service_ids[]`, `start_time`, opz. `staff_id`, opz. `notes` |
| Output | `{ booking_id, status }` |
| Tabelle | `appointments`, `appointment_services` |
| Sicurezza | `customer_id = ctx.customerId`; `source = 'customer_app'`; prezzo/durata da `resolveAgendaServiceLines`; overlap + schedule; **non** accettare `customer_id` nel body |

### Estensioni Phase 2

- `GET /bookings` — storico propri appuntamenti (RLS `appointments_select_own` o API filtrata)
- `PATCH /bookings/:id` — modifica entro policy
- `DELETE /bookings/:id` — cancellazione (status `cancelled`)
- `GET /profile`, `PATCH /profile`

## Integrazione Manager

- Agenda: badge se `source = 'customer_app'`
- Report: KPI prenotazioni online per salone
- Reminder WhatsApp: flusso esistente (`appointment_whatsapp_reminders`) — nessuna modifica Phase 0

## Fuori scope (non toccare)

- Fiscal bridge, `close_sale_atomic`, `finalize_fiscal_job_atomic`, stock/transfer
- Route `/api/agenda/*` esistenti
- Team App `/api/mobile/*`

## QA Phase 0

- `npm run lint`
- `npm test`
- `npm run build`

Migration: `supabase/migrations/20260624120000_customer_app_phase_0.sql`
