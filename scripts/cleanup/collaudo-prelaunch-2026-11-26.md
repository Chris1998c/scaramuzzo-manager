# Collaudo pre-lancio — 2026-11-26 Europe/Rome

Branch Manager: `audit/prelaunch-2026-11-27` @ `1f218ee`  
Preview: https://scaramuzzo-manager-ee2sgd0zo-christians-projects-a583a48c.vercel.app  
Produzione: https://manager.scaramuzzo.green — GitHub `main` **`25768fb`**, deploy Vercel `dpl_6rDidULiCVvVwfcodHKDSbKwHccc` (log: `Branch: main, Commit: 25768fb`), Ready.

Ambiente write: Preview + stesso DB Supabase (marker `[AUDIT-PRELAUNCH-20261126]`). Nessuna chiusura turno, nessuna cancellazione hard, nessuna repair migrazioni.

---

## Produzione (correzione rapporto)

| Voce | Valore |
|------|--------|
| GitHub `main` | `25768fb` Fix Dashboard salon drift after Report and parallelize riepilogo KPI |
| Deploy prod | `scaramuzzo-manager-qlzq17fe3-…` / alias `manager.scaramuzzo.green` |
| Esito | Build riuscito; commit in log clone = `25768fb` |

---

## Accessi e sede

| Prova | Ruolo | Sede | Atteso | Ottenuto | Esito | Evidenza |
|-------|-------|------|--------|----------|-------|----------|
| Status cassa Roma | coordinator | 1 | 200, role=coordinator, salon=1 | 200, session 17 open, totals 0 | PASS | `GET /api/cassa/status?salon_id=1` su Preview (cookie auth) |
| Status cassa altra sede | coordinator | 4 | 200 consentito | 200 Cosenza, session 12 open | PASS | `GET /api/cassa/status?salon_id=4` |
| Status cassa | reception Roma | 1 | 200, role=reception, salon=1 | 200 | PASS | cookie `romascaramuzzo@…` |
| Query salon_id=2 | reception Roma | forzata 1 | ignora/forza Roma | 200 salon.id=1 | PASS | `GET /api/cassa/status?salon_id=2` |
| Create appuntamento sede 2 | reception | 2 | 403 | `salon_id non consentito` | PASS | `POST /api/agenda/appointments` |
| Nota staff binding | reception | 1 | staff.user_id collegato | **nessuna** riga `staff.user_id`; sede da `user_salons.salon_id=1` → `staffSalonId` fallback | INFO | REST `staff?user_id=eq.…` vuoto |

---

## Agenda → modifica → In sala (isolato, marker audit)

| Prova | Ruolo | Atteso | Ottenuto | Esito | Evidenza |
|-------|-------|--------|----------|-------|----------|
| Create 11:00 Massimo (staff 56) | coordinator | 2xx + id | appt **144** scheduled | PASS | DB notes marker; create HTTP body vuoto ma riga presente |
| Doppio create stesso slot | coordinator | 409 | `Collaboratore già impegnato…` | PASS | secondo `POST` |
| Modifica notes/start 11:15 | coordinator | 200 | `{"ok":true}` start 11:15 | PASS | `PATCH /api/agenda/appointments/144` |
| Sovrapposizione 11:20 stesso staff | coordinator | 409 | impegnato | PASS | `POST` overlap |
| Porta in sala 144 | coordinator | 200 in_sala | `changed:true` status in_sala | PASS | `POST /api/agenda/porta-in-sala` |
| Create + no_show 145 | coordinator | no_show | status no_show | PASS | `POST …/status` |
| Porta in sala da no_show | coordinator | 409 | `Appuntamento no-show: transizione… non consentita` | PASS | Preview API (fix `b978d4f`) |
| Soft-cancel 144 | coordinator | cancelled | cancelled | PASS | status API |
| Create + in sala + cancel | reception | ok su Roma | appt **146** → in_sala → cancelled | PASS | cookie reception |

Appuntamenti audit residuali: **145** resta `no_show` (terminale; non attivo in agenda operativa). Nessuna prenotazione `scheduled`/`in_sala` futura attiva post-collaudo.

---

## Requeue `reconcile_required` (server)

| Prova | Atteso | Ottenuto | Esito | Evidenza |
|-------|--------|----------|-------|----------|
| `POST /api/fiscal/requeue` job 18 con `error_message` reconcile | 409 | `Riconciliazione richiesta: verificare stampante/documento…` | PASS | Preview dopo probe controllato su job 18 |
| Unit | blocco API | 3 test verde | PASS | `validateFiscalJobRequeue.test.ts` |

Nota incidente: un requeue precedente su job 18 (pre-probe, `error_message` non reconcile) ha portato il Bridge a fallire **pre-SOAP** (`items_empty, total_invalid`, attempts=1). Nessun documento fiscale emesso. Messaggio job ripristinato a quel failed payload. **Non ripetere requeue su 18.**

---

## Cassa Roma — CONTANTI hardcoded

| Layer | Comportamento |
|-------|----------------|
| UI Cassa | Accetta **`cash` \| `card`** (non esiste misto) |
| DB / report / totali sessione | `payment_method` salvato correttamente (`cash`/`card`) |
| Payload job fiscale Manager | Include `payment_method` nel JSON |
| Print Bridge → FP81 | **Ignora** il campo: SOAP sempre `description="CONTANTI"` `paymentType="0"` (`server.js` ~802–808) |

**Conseguenza:** una vendita “Carta” in Manager stampa comunque **CONTANTI** sulla Epson.  
**Pilota:** cassa fiscale Roma solo con pagamento **Contanti** finché Bridge non mappa `card`→paymentType carta **e** non si verifica in finestra Epson. Flusso carta+scontrino = **fuori pilota**.

Epson scontrino→annullo→callback: **Non verificata** (finestra non concordata in questa fase) → **cassa/stampa fuori dal via libera operativo** finché non eseguita.

---

## Bridge 1.3.2 — aggiornamento e ritorno

Postazione attuale: `roma_cassa_1`, heartbeat **1.2.0**, path `C:\Scaramuzzo\PrintBridge`.

### Upgrade (worker gated)

1. Scaricare release **1.3.2** zip + sha256 dal repo `scaramuzzo-print-bridge` / artefatto CI.
2. Su PC cassa (Admin): verificare hash; estrarre in cartella affiancata.
3. `FISCAL_JOBS_WORKER_ENABLED=false` (o `deactivate` se presente) → attendere coda a 0.
4. Backup automatico via `installer\windows\update.ps1 -Offline -SourcePath <estratto>` (preserva `.env`, journal, logs).
5. `diagnose.ps1` → heartbeat Manager deve mostrare **1.3.2**.
6. Solo in finestra Epson: riattivare worker → 1 sale_receipt cash → void → callback OK.

### Rollback

1. Worker OFF.
2. Ripristinare directory/binari dal backup creato da `update.ps1` (`Backup-InstallState`) **oppure** rieseguire `update.ps1 -Offline` puntando allo zip **1.2.0**.
3. Verificare `.env` (token invariato); `status.ps1`; heartbeat torna 1.2.0.
4. Non requeue job ambigui; riconciliare da journal se necessario.

---

## Partenza pulita

### Prenotazioni future (ricontrollo)

Al termine collaudo: **0** appuntamenti attivi (`scheduled`/`in_sala`/`in_progress`) con `start_time >= 2026-11-26`.  
**Richiesto:** ripetere la query **subito prima dell’apertura** del 27/11.

### Piano turno Roma session **17** (nessuna chiusura in questa fase)

| Campo | Valore |
|-------|--------|
| id | 17 |
| salon_id | 1 Roma |
| status | **open** (dal 2026-11-09) |
| opened_by | coordinator |
| opening_cash | **0** |
| printer_enabled | **false** |
| Vendite collegate (`cash_session_id=17`) | **0** |
| Totali API oggi/sessione | gross/cash/card/count = **0** |

**Saldo riconciliato atteso oggi:** contanti di sistema = opening 0 + vendite cash 0 − reso 0 = **0**; carta sessione = **0**. Nessun movimento vendita su questo turno.

**Piano operativo (da eseguire solo dopo tua conferma, non ora):**

1. Backup / snapshot DB.
2. Coordinatore: chiudere session 17 come turno stale di collaudo (admin close) **oppure** lasciarla e aprirne una nuova solo se il prodotto lo consente in parallelo — oggi `printer_enabled=false` quindi non adatta a pilota fiscale.
3. Per pilota stampa: aprire **nuovo** turno Roma con `printer_enabled=true` dopo Bridge 1.3.2 + test Epson.
4. Non toccare sales/job 52/54/57/58/63 senza journal Epson.

---

## Perimetro pilota aggiornato

| Flusso | Stato |
|--------|-------|
| Manager Agenda / In sala Roma (coordinator + reception) | **In pilota** (prove PASS su Preview) |
| Permessi sede reception | **In pilota** |
| Blocco no-show → in sala + requeue reconcile | **In pilota** (fix su Preview) |
| Cassa + stampa Epson | **Fuori pilota** finché: Bridge 1.3.2, test scontrino/annullo/callback, solo Contanti |
| Carta fiscale | **Fuori pilota** (CONTANTI hardcoded) |
| Altre sedi cassa | **Fuori pilota** (no Bridge) |
