# Collaudo completo pre-lancio — 1° dicembre 2026

Punto di partenza: `scripts/cleanup/verdetto-lancio-2026-12-01.md`.  
Ambiente sotto test: **sola lettura** su Preview (DB = prod) e prod.  
Scritture: solo test automatici su **Postgres Docker isolato**. Job **#18** lasciato `failed`.

## 0. Commit / ambiente / ruolo

| Voce | Valore |
|------|--------|
| Manager prod | `main` **`25768fb`** → `manager.scaramuzzo.green` |
| **Preview candidato lancio** | `audit/prelaunch-2026-11-27` **`54d98a7`** → `https://scaramuzzo-manager-i6ckdqe7v-christians-projects-a583a48c.vercel.app` (alias git-audi…), Ready, log clone Commit `54d98a7` |
| Preview precedente | `6d5ff25` (`ee2sgd0zo` / `6phplm6h6`) |
| Print Bridge Roma | **`1.3.3`** `roma_cassa_1` |
| App Clienti / Team | fix **non** in questa Preview Manager (PWA bake invariato); source locali non pushati |
| Ruolo browser | **coordinator**, sede **Roma (1)** |
| Job #18 | `failed` — **fermo** |

### Fix contenuti in `54d98a7` (Preview)

- Agenda: overlay loading scoped (`absolute`), title refresh → «Aggiorna»
- EditAppointmentModal: rimozione `#id`, CTA `text-xs`
- Cassa: «Caricamento cassa…», errore con Torna in sala/Riprova, senza emoji, senza colonna Operatore
- In sala: skeleton boot, badge «In sala» rimosso, label modal contrasto ↑
- Report: filtri `sczField` + Suspense «Caricamento…»
- Impostazioni: CTA `sczBtnSuccess`; copy fallback operativa
- Docs: verdetto + collaudo 1/12
- (già sul branch, pre-esistenti) `b978d4f` guard requeue/no-show; migrazioni allineate

---

## 1. Come si vede (grafica / usabilità)

### Osservato su Preview autenticata (desktop + mobile 390×844)

| Schermata | Cosa si vede | Difetti trovati |
|-----------|--------------|-----------------|
| Dashboard | KPI vuoti oggi, CTA Agenda/In sala/Magazzino, switcher sede | Area KPI poco leggibile a zero; ok navigazione |
| Agenda | Griglia giorno, colonne staff, CTA In sala | Doppio selettore sede; titolo refresh EN «Refresh»; overlay loading full-viewport (prima del fix) |
| In sala | Cassa chiusa, lista vuota chiara | Due «Aggiorna»; badge «In sala» ridondante; flash `null` al boot (prima del fix) |
| Report | Riepilogo utilizzabile, export PDF/CSV | Copy tecnica ridondante su periodo; filtri date poco contrastati (prima del fix) |
| Impostazioni | Sezioni catalogo | CTA verde `#0FA958` fuori token gold/emerald (prima del fix) |
| Cassa | (codice; nessun appt in sala) | Loading jargon, errore senza CTA, emoji carrello, colonna Operatore sempre «—» |
| App Clienti | Login «Benvenuto / Accedi» su prod | Footer sticky copriva contenuto (fix locale); OTP **non** collaudato |
| App Team | Login «Accesso sicuro» | Errore Presenze generico (fix locale); timbratura **non** collaudata |

### Fix applicati (branch audit / repo locali) — prima → dopo

| Area | Prima | Dopo |
|------|-------|------|
| Agenda overlay | `fixed inset-0` su tutta l’app | `absolute` sul wrapper griglia |
| Agenda refresh | `title="Refresh"` | `title="Aggiorna"` |
| Edit appt | `#id` tecnico + CTA `10–11px` | id rimosso; CTA `text-xs` |
| Cassa loading | «Inizializzazione check-out...» | «Caricamento cassa…» |
| Cassa errore | solo testo rosso | + «Torna in sala» / «Riprova» (`sczBtn*`) |
| Cassa vuoto | emoji 🛒 + col Operatore | senza emoji; colonna Operatore rimossa |
| In sala boot | `return null` | skeleton «Caricamento…» |
| In sala card | badge «In sala» | rimosso |
| In sala modal | label `text-white/30` | `text-white/60` |
| Report filtri | input senza `text-white` | `sczField` + `color-scheme:dark` |
| Report Suspense | `fallback={null}` | «Caricamento…» |
| Impostazioni CTA | `#0FA958` custom | `sczBtnSuccess` |
| Impostazioni fallback | «impalcatura» | copy operativa |
| Client booking | `paddingBottom: 24` | `120`; subtitle «N servizi» |
| Team Presenze | «Riprova più tardi» fisso | mostra `error` reale |

Retest UI post-fix: **codice + tsc**; Preview non ridispiegata → screenshot «dopo» solo dopo deploy Preview.

---

## 2. Come si usa (funzionalità)

| Flusso | Tipo prova | Esito | Note |
|--------|------------|-------|------|
| Cambio sede coordinator | Browser | PASS | Switcher 5 sedi; Roma attiva |
| Cassa status Roma + Cosenza | Browser fetch auth | PASS | `200` sede 1 e 4 |
| Agenda → griglia utilizzabile | Browser | PASS | vuota oggi, navigabile |
| In sala empty + cassa chiusa | Browser | PASS | copy guida walk-in |
| Report riepilogo + export UI | Browser | PASS | PDF/CSV presenti; CRM azioni visibili |
| Impostazioni shell | Soft-nav | PASS | pagina utilizzabile |
| App Clienti login shell | Browser prod | PASS | OTP/prenota: **telefono** |
| App Team login shell | Browser prod | PASS | Presenze: **telefono** |
| Agenda→In sala→Cassa write | Isolato | **non eseguito** | Docker off; Preview=prod DB |
| Vendite/annulli/Epson | Epson Roma | **mancante** | post-BOSS |
| Giacenze/transfer write | Isolato | **non eseguito** | Docker off |
| Storico BOSS | Audit precedente + codice | PASS consultazione | dic-2025 già riconciliato |
| Reception force-sede | API 26/11 | PASS (non ripetuta) | |
| Job #18 | DB | fermo `failed` | nessuna requeue |

Test automatici Manager: **710 pass / 17 fail** — fail tutti per Docker assente (test isolati Postgres).  
`tsc`/`lint` Manager: OK. `npm run build`: OK.  
Bridge `node --check server.js`: OK. Client/Team `expo lint`: OK.

---

## 3. Quanto ci mette (performance)

Condizioni: Preview autenticata, **coordinator**, **Roma**, riepilogo Report oggi. Cache disabilitata su hard nav dove indicato.

### Click → pagina utilizzabile (soft nav client)

| Pagina | Freddo (1° click sessione) | Caldo |
|--------|----------------------------|-------|
| Agenda | **1476 ms** | ~950–1000 ms |
| In sala | **1051 ms** | ~1030 ms |
| Dashboard | **981 ms** | ~960 ms |
| Clienti | ~994 ms | ~952 ms |
| Report | ~1004 ms | ~999 ms |
| Impostazioni | ~1000 ms | ~1076 ms |

### Report — obiettivo 2 s

| Misura | Freddo | Caldo | vs 2 s |
|--------|--------|-------|--------|
| Server `page_total_ms` (`?perf=1`) | **1890** | **1723** | OK server |
| `auth_ms` | 674 | 693 | — |
| `queries_ms` | 1216 | 1030 | **maggior costo** |
| `direction_total_ms` | 977 | 792 | — |
| Browser DCL documento | **2682** | **2251** | **oltre 2 s TTFU hard** |
| HTML fetch `/dashboard/report` | 2728 / 2835 | — | conferma SSR+network |

**Dove si perde tempo:** auth cookie (~0.7 s) + query riepilogo/CRM (~1.0–1.2 s) sul server; overhead documento browser porta il hard load oltre 2 s anche quando `page_total_ms` < 2 s. Soft navigation resta ~1 s.

API `GET /api/cassa/status`: ~1330–1680 ms (sede 1/4).

Correzioni perf **non** applicate in questa sessione (solo misure). Prima/dopo perf N/A.

---

## 4. Tabella voti

| Area | Voto /10 | Prova | Difetto | Correzione | Retest |
|------|----------|-------|---------|------------|--------|
| Agenda UI | **7.5** | Browser desktop+mobile | overlay full-screen, Refresh EN, doppio sede | overlay scoped + Aggiorna | codice OK; Preview TBD |
| In sala UI | **7** | Browser | boot null, badge ridondante, doppio Aggiorna | skeleton + badge + contrast | codice OK; doppio Aggiorna ancora aperto |
| Cassa UI | **6.5** | Code review + fix | jargon/emoji/operatore | loading/error/empty/colonna | codice OK; UI live TBD |
| Report UI | **7.5** | Browser | filtri scuri, Suspense null, copy tecnica | sczField + fallback | codice OK; copy tecnica residua |
| Impostazioni UI | **7** | Soft-nav + code | CTA fuori token | sczBtnSuccess | codice OK |
| Report perf | **6.5** | `?perf=1` + DCL | hard load >2 s; queries~1.2 s | nessuna in sessione | da ottimizzare auth/queries |
| Nav soft perf | **8** | click timing | — | — | ~1 s OK |
| Accessi/sede | **8.5** | Browser + fetch | — | — | PASS coordinator |
| Agenda funzionale | **8** | Browser + audit 26/11 | write oggi no | — | soft OK |
| Cassa/Epson | — | — | prove fisiche mancanti | Bridge 1.3.3 già installato | **non votato** |
| Magazzino write | — | — | Docker off | — | **non votato** |
| App Clienti OTP | — | Login shell only | — | padding fix locale | **non votato** (manca telefono) |
| App Team Presenze | — | Login shell only | errore generico | mostra `error` | **non votato** (manca telefono) |
| Bridge Roma | **8** | heartbeat DB | Epson cash/card open | mapping 1.3.3 in campo | stampa fisica TBD |

---

## 5. GO / NO-GO per sede e modulo

Legenda: **Prod** = già in `25768fb`/campo · **Branch** = solo audit/local · **Sul posto** = prova fisica ancora dovuta

| Sede / modulo | Verdetto | Prod | Branch | Sul posto |
|---------------|----------|------|--------|-----------|
| Roma · Agenda / In sala | **GO soft / PILOTA** | nav-perf sì; guard no-show **no** | guard `b978d4f` + UI fix | smoke mattina 1/12 |
| Roma · Report / BOSS | **GO consultazione** | sì | filtri UI | — |
| Roma · Magazzino | **GO lettura** | sì | — | transfer write |
| Roma · Cassa / stampa | **NO-GO fiscale** | Bridge **1.3.3** sì | UI cassa | Contanti+Carta+void+callback Epson |
| Roma · App Clienti | **PILOTA UI** | PWA sì | book padding | OTP + 1 prenotazione |
| Roma · App Team / Presenze | **NO-GO operativo** | PWA sì | error UX | 1 timbratura geofence |
| Altre sedi · Agenda/Report | **GO consultazione** | sì | — | — |
| Altre sedi · Cassa | **NO-GO** | no Bridge | zip 1.3.3 | install + Epson |
| Cosenza session 12 | **blocco ops** | open stale | — | admin close |

### Verdetto complessivo 1° dicembre

**PILOTA LIMITATO Roma soft** (Agenda / In sala / Report / Clienti lettura).  
**NO-GO** cassa fiscale completa e multi-sede finché Epson Contanti+Carta non è collaudata.  
**NO-GO** Presenze finché non c’è una timbratura device.

Fix UI + guard `b978d4f` sono sulla **Preview `54d98a7`**, ancora **fuori produzione** finché non si fa merge esplicito su `main`.

---

## 6. Blocchi → prossimo intervento

| Blocco | Prossimo intervento |
|--------|---------------------|
| Epson Contanti+Carta+void+callback | Finestra post-BOSS `docs/ROMA_PAYMENT_VERIFY.md`; job 18 fermo |
| Promote Preview → prod | Review `54d98a7` + merge `audit/prelaunch…` → `main` |
| Report apertura URL >2 s | Ridurre `auth_ms` / `queries_ms`; retest `?perf=1` |
| App Clienti/Team device + bake PWA | Push fix source; rebuild `public/app-clienti` e `public/team` |
| Bridge altre sedi | Install 1.3.3 |
| Session 12 Cosenza | Chiusura ops |
| Doppio «Aggiorna» In sala | Cleanup CTA residuo |

---

## 7. Retest Preview `54d98a7` (2026-11-26 pomeriggio)

Ruolo: **coordinator** · Sede: **Roma** · URL: `…-i6ckdqe7v-…` · DB: prod (sola lettura UI)

### 7.1 Difetti grafici su schermate distribuite

| Difetto | Desktop | Mobile 390×844 | Esito |
|---------|---------|----------------|-------|
| Agenda «Refresh» EN | titolo pulsante «Aggiorna» | «Aggiorna» | **RISOLTO** |
| Overlay Agenda `fixed` full-app | nessun `.fixed.inset-0` overlay; classi `absolute inset-0` presenti | — | **RISOLTO** (struttura) |
| In sala boot `null` | mostra «Caricamento…» poi empty | — | **RISOLTO** |
| Badge «In sala» su card | lista vuota (N/A card) | — | N/A oggi; codice deployato |
| Cassa errore senza CTA | `/cassa/999999` → «Torna in sala» + «Riprova»; no jargon check-out | — | **RISOLTO** |
| Report filtri contrasto | Vendite: `text-white` / `sczField`, color `rgb(255,255,255)` | — | **RISOLTO** |
| Impostazioni CTA `#0FA958` | «Nuovo servizio» = `sczBtnSuccess` emerald | — | **RISOLTO** |
| Doppio selettore sede Agenda | ancora presente | ancora presente | **APERTO** |
| Doppio «Aggiorna» In sala | Aggiorna + Aggiorna stato | — | **APERTO** |

### 7.2 Report Roma — usable vs target 2 s

Condizioni: coordinator, Roma, riepilogo oggi.

| Modalità | Misura | vs 2 s |
|----------|--------|--------|
| **Navigazione interna** In sala → Report | usable **701 ms** | **OK** |
| **Navigazione interna** Dashboard → Report | usable **3612 ms** | **oltre** (RSC refetch pesante) |
| **Apertura da URL** `?salon_id=1&perf=1` freddo | DCL **2475 ms**; `page_total_ms=2000` (`auth=1010`, `queries=990`) | **al limite / oltre** sul browser |
| **Apertura da URL** caldo | DCL **3067 ms**; `page_total_ms=2559` (`auth=1224`, `queries=1334`) | **oltre** |

Target 2 s: **raggiunto in soft-nav leggera**; **non raggiunto** su hard URL e su soft-nav che rifetcha il server component completo. Collo di bottiglia: `auth_ms` + `queries_ms`.

### 7.3 Test Docker isolati (i 17 prima falliti)

Prima run parallela: 14 pass / 3 fail per race container in shutdown.  
Rerun seriale (`--maxWorkers=1`) dei 3: **pass**.  
**Esito complessivo: 17/17 PASS** su Postgres isolato.

| File | Esito |
|------|-------|
| `lib/agenda/appointmentAuditRpcMigrationOrder.test.ts` | PASS |
| `lib/agenda/appointmentCancelAuditRpc.test.ts` | PASS |
| `lib/agenda/patchAppointmentServiceLinesAtomic.test.ts` | PASS |
| `lib/cassa/closeCashSessionLedgerPostedOnly.test.ts` | PASS |
| `lib/cassa/closeSaleAppointmentIdempotency.test.ts` | PASS |
| `lib/cassa/p0CashSalesBypassMigration.test.ts` | PASS |
| `lib/customer-app/customerBookingAuthzIsolated.test.ts` | PASS |
| `lib/customer-app/customerBookingConcurrentIsolated.test.ts` | PASS |
| `lib/customers/schedeTecnicheIsolatedSave.test.ts` | PASS |
| `lib/datetime/romeBusinessDateIsolated.test.ts` | PASS |
| `lib/fiscal/cancelVoidReceiptSafety.test.ts` | PASS (dopo rerun seriale) |
| `lib/fiscal/resolveUncertainFiscalVoid.test.ts` | PASS |
| `lib/fiscal/uncertainFiscalVoidRace.test.ts` | PASS |
| `lib/magazzino/stockE2eConsistency.test.ts` | PASS (dopo rerun seriale) |
| `lib/magazzino/transferMultiLineAtomic.test.ts` | PASS |
| `lib/mobile/mobileAttendanceClockInsert.test.ts` | PASS (dopo rerun seriale) |
| `lib/reports/reportCassaVoidLedgerIsolated.test.ts` | PASS |

Nessuna scrittura su DB di produzione in questo passaggio.

### 7.4 Blocchi residui (post-Preview)

1. Epson Roma Contanti+Carta+void+callback  
2. Report hard/URL spesso >2 s  
3. Promote `54d98a7` → prod  
4. OTP Clienti / Presenze Team sul posto (+ bake PWA per fix source)  
5. Bridge altre sedi · session 12 · doppio Aggiorna / doppio sede UI
