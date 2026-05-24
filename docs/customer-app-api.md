# App Clienti Scaramuzzo — API e autenticazione

Documento di riferimento per il repo **Expo** e integrazioni client.  
Base URL produzione: `https://<manager-host>/api/customer/v1`

Vedi anche: [customer-app-phase-0.md](./customer-app-phase-0.md) (fondamenta RLS e Phase 0).

---

## Principi obbligatori

1. **L'app clienti usa SOLO le API Next.js** sotto `/api/customer/v1/*`.
2. **NON usare Supabase client-side** per catalogo, availability o booking (read/write su `services`, `appointments`, `appointment_services`). RLS non espone mutazioni booking al ruolo `cliente`; i prezzi listino richiedono `service_role` lato server.
3. **`customer_id` non viene mai inviato dal client** — deriva da `customer_auth_links` via `requireCustomerContext()` server-side.
4. **Prezzo, durata, status, source** sono sempre risolti/impostati dal backend, mai fidati dal body.
5. Le prenotazioni create dall'app hanno `source = customer_app`.

---

## Autenticazione

### Flusso

1. L'utente fa login con **Supabase Auth** (email/password o provider configurato).
2. Deve completare il **collegamento profilo** (`/api/customer/claim` + OTP) → riga in `customer_auth_links`.
3. Le chiamate API verso Next devono includere la **sessione Supabase**:
   - **Web / Expo con cookie**: session cookie gestita da Supabase (same-site verso dominio Manager).
   - **Expo nativo**: Bearer `access_token` Supabase nell'header `Authorization` — Next legge la sessione via `createServerSupabase()`.

### Requisiti per ogni route v1

| Controllo | Esito se fallisce |
|-----------|-------------------|
| Utente autenticato | **401** |
| Ruolo `cliente` (`getUserAccess`) | **403** |
| Riga `customer_auth_links` | **403** |

Helper server: `app/api/customer/v1/_lib/requireCustomerContext.ts`

---

## Endpoint disponibili

Tutti richiedono auth cliente linkato salvo diversa indicazione.

### `GET /salons`

Elenco saloni prenotabili (id 1–4, escluso Magazzino Centrale).

**Response:** `{ salons: [{ id, name }] }`

---

### `GET /services?salon_id={id}`

Catalogo servizi prenotabili per salone (`visible_in_customer_app = true`).

**Response:** `{ services: [{ id, name, duration, price, ... }] }`

---

### `GET /staff?salon_id={id}&service_id={id}`

Collaboratori disponibili per salone/servizio.

**Rate limit:** 60 req / 60s (IP + user)

---

### `GET /availability?salon_id=&service_ids[]=&date=YYYY-MM-DD&staff_id?`

Slot prenotabili (probe read-only; **non autoritativo** per il write).

**Rate limit:** 30 req / 60s (IP + user)

---

### `POST /bookings`

Crea prenotazione.

**Body:**
```json
{
  "salon_id": 1,
  "service_ids": [12, 15],
  "staff_id": 3,
  "start_time": "2026-06-15T10:00:00",
  "notes": "opzionale"
}
```

**Header opzionale (consigliato in produzione):**
```
Idempotency-Key: <string unica, max 128 caratteri>
```

**Comportamento idempotency:**
- Stessa chiave + stesso payload → **201** con stesso `booking` (replay sicuro).
- Stessa chiave + payload diverso → **409**.
- Chiave legata a `auth.users.id` — nessun replay cross-user.
- Richiesta ancora in elaborazione → **409** (retry dopo qualche secondo).
- Record `processing` abbandonato > 5 min → retry consentito.

**Rate limit:** 10 POST / 60s (IP + user)

**Response 201:** `{ booking: { id, salon_id, start_time, end_time, status, source, notes, services[] } }`  
(`customer_id` **non** esposto)

---

### `GET /bookings`

Elenco propri appuntamenti.

**Query opzionali:** `status`, `from`, `to`, `salon_id`, `limit` (default 50, max 100)

**Ordine:** `start_time DESC`

**Response:** `{ bookings: [{ id, salon_id, salon_name, start_time, end_time, status, source, notes, services[] }] }`

---

### `DELETE /bookings/[bookingId]`

Annulla prenotazione (soft-delete: `status = cancelled`).

**Regole MVP:**
- Solo propri appuntamenti (`customer_id` da context).
- Solo `status = scheduled`, `sale_id` null, `start_time` futuro.
- Source ammessi: `customer_app`, `booking` (non `walk_in`).

**Rate limit:** 20 DELETE / 60s (IP + user)

**Response 200:** `{ booking: { id, status: "cancelled" } }`

---

## Codici errore principali

| HTTP | Significato tipico |
|------|-------------------|
| **400** | Query/body/header invalido |
| **401** | Non autenticato |
| **403** | Ruolo non cliente, profilo non linkato, o risorsa non autorizzata |
| **404** | Booking non trovato |
| **409** | Conflitto slot, lifecycle (non cancellabile), idempotency |
| **429** | Rate limit superato (`Retry-After` header) |
| **500** | Errore server (messaggio generico) |

---

## Rate limiting — caveat

Il rate limit App Clienti è **in-memory per istanza** (`lib/customer-app/customerApiRateLimit.ts`).

Su **Vercel multi-istanza** i contatori non sono conmotione globali: protegge da abuso leggero, non da DDoS distribuito. Per produzione ad alto traffico valutare Redis/Upstash (post-MVP).

| Route key | Limite |
|-----------|--------|
| `staff` | 60/min |
| `availability` | 30/min |
| `bookings` (POST) | 10/min |
| `bookings_delete` | 20/min |

---

## Checklist Expo (pre-go-live)

- [ ] Tutte le chiamate verso `https://<host>/api/customer/v1/*`
- [ ] Session Supabase verso Next (cookie o Bearer)
- [ ] Claim profilo completato prima del catalogo
- [ ] `Idempotency-Key` UUID v4 su ogni POST booking
- [ ] Gestione 409 overlap / 429 retry con backoff
- [ ] Nessun insert/update diretto Supabase su appointments

---

## Non implementato (fuori scope attuale)

- Reschedule / PATCH booking
- Notifiche push
- Finestra minima ore per cancel
- Rate limit distribuito (Redis)
