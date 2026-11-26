# Collaudo completo pre-lancio — 1° dicembre 2026

Punto di partenza: `scripts/cleanup/verdetto-lancio-2026-12-01.md`.  
Ambiente sotto test: **sola lettura** su Preview (DB = prod) e prod.  
Scritture isolate: **non eseguite** (Docker daemon assente). Job **#18** lasciato `failed`.

## 0. Commit / ambiente / ruolo

| Voce | Valore |
|------|--------|
| Manager prod | `main` **`25768fb`** → `manager.scaramuzzo.green` |
| Manager Preview collaudata | `audit/prelaunch-2026-11-27` **`6d5ff25`** (deploy `ee2sgd0zo` / `6phplm6h6`) |
| Fix UI di questa sessione | **solo locali** su `audit/prelaunch-2026-11-27` (non ancora push/deploy) |
| Print Bridge Roma | **`1.3.3`** `roma_cassa_1` online (heartbeat fresco); MacBook stale `1.2.0` |
| App Clienti | repo `main` `ee845b1` + fix locali book padding/subtitle; PWA `/app-clienti` |
| App Team | repo `main` `c3e21c0` + fix locale errore Presenze; PWA `/team` |
| Ruolo browser | **coordinator**, sede **Roma (1)** |
| Reception | non rieseguita in browser oggi; prove API sede 26/11 ancora valide |
| Job #18 | `failed`, sale 63 — **fermo** |

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

Fix UI di questa sessione e guard `b978d4f` restano **fuori produzione** finché non si fa merge/deploy esplicito.

---

## 6. Blocchi → prossimo intervento

| Blocco | Prossimo intervento |
|--------|---------------------|
| Epson Contanti+Carta+void+callback | Finestra post-BOSS `docs/ROMA_PAYMENT_VERIFY.md`; job 18 fermo |
| Deploy fix UI + guard audit | Push branch → Preview → review → main |
| Report hard >2 s | Ridurre `auth_ms` / parallelizzare `queries_ms`; retest `?perf=1` |
| Docker isolato | Avviare Docker; rieseguire test booking/attendance/cassa void |
| App Clienti/Team device | 1 OTP + 1 prenota; 1 ingresso/uscita |
| Bridge altre sedi | Install 1.3.3 |
| Session 12 Cosenza | Chiusura ops |
| Doppio «Aggiorna» In sala | Cleanup CTA residuo sul branch |
