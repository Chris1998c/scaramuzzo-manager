# API mobile Team App (Manager backend)

## Env obbligatorie

- **`MOBILE_JWT_SECRET`**: obbligatorio. Senza secret, `POST /api/mobile/login` risponde **503** e non emette mai `success` senza `access_token`.

## Rate limit login

- Chiave: `IP + staff_code` (header `x-forwarded-for` / `x-real-ip`).
- Default: 5 tentativi falliti / 15 min → blocco 15 min (**429**).
- Reset al login riuscito.
- Store **in-memory** (`lib/mobile/mobileLoginRateLimit.ts`): sufficiente in dev; su Vercel multi-istanza usare **Redis/KV condiviso** con la stessa logica.

## JWT mobile

Payload: `sid`, `salon_id` (primario), `salon_ids[]` (primario + `staff_salons`), `exp`.

## Timbratura GPS

- `POST /api/mobile/attendance/clock`: colonne audit su `attendance_logs`; rifiuto se `isMocked` o `accuracy` > 100 m.

## Team App (repo separato)

Dopo deploy Manager: inviare `accuracy`, `isMocked`, opz. `device_id` / `app_version` nel body clock; gestire `salon_ids` in login response per multi-salone futuro.
