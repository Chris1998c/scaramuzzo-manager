# Verdetto di lancio — 1° dicembre 2026 (Europe/Rome)

Aggiornamento sola lettura rispetto all’audit/collaudo del 26/11. Nessuna scrittura in produzione in questo passaggio.

**Collaudo completo (UI + flussi + performance + voti):** `scripts/cleanup/collaudo-completo-2026-12-01.md`  
Verdetto invariato nel merito: **PILOTA LIMITATO Roma soft · NO-GO cassa fiscale / multi-sede / Presenze device**.

## Inventario reale

| Sistema | Produzione / postazione | Preview / candidato | Note |
|---------|-------------------------|---------------------|------|
| Manager | `main` **`25768fb`** → `manager.scaramuzzo.green` (`dpl_6rDidULi…`, log clone Commit 25768fb) | `audit/prelaunch-2026-11-27` **`6d5ff25`** → Preview Ready `…6phplm6h6…` / alias git-audi | Preview ≠ prod |
| Print Bridge | Roma heartbeat **`1.3.3`** (`roma_cassa_1`, online, worker ON, FPMate OK, coda 0) | Repo `fix/fiscal-payment-method-mapping` `db7968e` / zip 1.3.3 | Dev MacBook stale 1.2.0 |
| App Clienti | PWA `/app-clienti` su Manager; repo `main` `ee845b1` | — | OTP/push device non rieseguiti oggi |
| App Team | PWA `/team` su Manager; repo `main` `c3e21c0` | — | Presenze: 0 log in DB |
| Supabase | `jrqhfnvtdaiutquksgxd` | stesso DB di Preview | Write su Preview = write in prod |
| Baseline operativa | `2026-11-16T15:01:28` UTC | — | Pre-baseline fuori KPI |

### Migrazioni

- Sincronizzate: **119**
- Local-only non applicate: `20261117180000`, `20261117190000` (LAV002 historical — tabella `legacy_staff_turnover` già popolata, 14 righe)
- Remote-only: nessuna

### Fix audit ancora solo in Preview (non in prod)

| Commit | Contenuto |
|--------|-----------|
| `b978d4f` | Blocco requeue `reconcile_required` + blocco porta-in-sala da no-show |
| `a322d2f` | Allineamento migrazioni push |
| `1f218ee` / `6d5ff25` | Inventario + registro collaudo |

`25768fb` in prod include già nav-perf (Dashboard/Report salon sync).

---

## Per sede — pronto / bloccato / sul posto

### Roma (salon 1)

| Area | Stato | Dettaglio |
|------|-------|-----------|
| Accessi / cambio sede | **Pronto (codice + prove 26/11)** | Coordinator multi-sede; reception forzata Roma. Fix no-show/requeue ancora Preview |
| Agenda / In sala | **Pronto con riserva** | Prove PASS su Preview 26/11; prod senza fix no-show/requeue API |
| Report / BOSS | **Pronto consultazione** | Dic-2025 riconciliato (17977/30791/11103/29540); LAV002 in tabella |
| Magazzino | **Pronto consultazione** | Stock presente; write e2e non rieseguito oggi |
| Cassa + Bridge | **Parzialmente pronto / blocco Epson** | Bridge **1.3.3** confermato Manager; **mancano** prove scontrino Contanti+Carta+void+callback |
| App Clienti / Team | **Da verificare sul posto** | PWA deployate; OTP/geofence device non rifatti |
| Turni | Session **17 chiusa** (26/11); aprire **nuovo** turno `printer_enabled=true` per pilota | Session 12 Cosenza non riguarda Roma |

### Corigliano / Castrovillari / Cosenza

| Area | Stato |
|------|-------|
| Agenda / clienti / report storico | Consultazione possibile (stesso Manager) |
| Cassa / stampa | **Bloccato** — nessuna installazione Bridge in DB |
| Presenze | **Bloccato / non verificato** — 0 timbrature; geofence device assente |
| Sul posto | Install Bridge 1.3.3 + FP81 + collaudo Epson; chiudere session **12** Cosenza (open stale, printer off) prima del pilota locale |

### Magazzino (salon 5)

| Area | Stato |
|------|-------|
| Giacenze / hub | Dati presenti; transfer write non rieseguito oggi |
| Cassa | N/A |

---

## Flussi — esito rispetto all’audit precedente

| Flusso | Prove 26/11 | Oggi (rilettura) | Esito per 1/12 |
|--------|-------------|------------------|----------------|
| Accessi + sede | PASS coordinator/reception | Invariato (sola lettura) | OK codice; merge Preview consigliato |
| Agenda → In sala | PASS + overlap/doppio/no-show | Nessuna prenotazione attiva futura; audit appt ripuliti | OK Roma dopo merge Preview |
| Report / BOSS | PASS dic-2025 | Riconferma totali OK | OK consultazione |
| Magazzino | Codice + stock | Stock invariato in lettura | OK soft; write sul posto/isolato Docker |
| App Clienti | PWA live | Repo allineato main | **Manca** OTP/prenota device |
| App Team / Presenze | UI login | `attendance_logs` = 0 | **Manca** timbratura device |
| Cassa Epson | CONTANTI fix in Bridge 1.3.3 | Roma **1.3.3** online | **Manca** collaudo fisico cash+card |

**Ambiente write:** Preview condivide il DB di produzione → niente nuovi collaudi write senza isolamento (Docker/staging) o marker e cleanup concordato.

---

## Anteprima partenza operativa 1° dicembre

### Preservare sempre

Anagrafiche clienti, collaboratori/permessi, prenotazioni **reali** future, giacenze, storico BOSS (`legacy_turnover_daily` / LAV002), documenti e registri fiscali, job #18 e trail sale 52/54/57/58/63.

### Per sede — dati di test / turni da gestire (prima dell’apertura)

| Sede | Da gestire | Azione prevista (non eseguita ora) |
|------|------------|-------------------------------------|
| Roma | Job **#18** failed (sale 63 `error`) | **Lasciare fermo** — niente requeue |
| Roma | Sale pending/queued 52, 57, 58 | Non requeue senza journal Epson |
| Roma | Dev bridge `bridge-dev-macbook` stale | Revocare/offline quando operativo |
| Roma | Nuovo turno 1/12 | Aprire turno fresco `printer_enabled=true` dopo coda 0 |
| Cosenza | Session **12** open da mag-2026 | Chiudere/admin-close in finestra ops |
| Tutte | Prenotazioni ≥ 1/12 | Oggi **0**; **ricontrollare** la mattina del 1/12 |
| Tutte | Marker audit | Nessun appt audit residuo attivo |

### Checklist mattina 1/12 (sola osservazione + ops concordate)

1. Query prenotazioni attive future ≥ now.
2. Heartbeat Bridge per sede (Roma deve restare 1.3.3).
3. Coda fiscale Roma = 0; job 18 non in pending.
4. Turno cassa nuovo Roma se si abilita stampa.
5. Non promuovere Preview→prod senza decisione esplicita sui fix `b978d4f`.

---

## Verdetto

**PILOTA LIMITATO — Roma soft (Agenda/In sala/Clienti/Report/Magazzino consultazione)**  
**NO-GO cassa/stampa multi-sede e NO-GO carta fiscale finché Epson non conferma Contanti+Carta.**

Produzione Manager resta su `25768fb` senza i guard audit Preview.

---

## Blocchi effettivi → prova mancante → prossimo intervento

| # | Blocco | Prova mancante | Prossimo intervento |
|---|--------|----------------|---------------------|
| 1 | Cassa Epson Contanti+Carta (Roma) | Scontrino+void+callback per entrambi i metodi | Finestra post-BOSS (`docs/ROMA_PAYMENT_VERIFY.md` Bridge); job 18 fermo |
| 2 | Guard fiscali/agenda solo Preview | Merge/promote `b978d4f` in prod | Review + deploy `audit/prelaunch…` → main dopo OK |
| 3 | Bridge assente Corigliano/Castrovillari/Cosenza | Install 1.3.3 + 1 scontrino/sede | Pacchetto zip + `INSTALL_SITES.md` / activate-worker |
| 4 | App Clienti OTP/push | Device + destinatari test | Collaudo PWA `/app-clienti` |
| 5 | App Team / Presenze | Timbratura reale + geofence | Collaudo PWA `/team` su telefono |
| 6 | Write tests senza inquinare prod | Staging/Docker isolato | Non usare Preview per write di massa |
| 7 | Session 12 Cosenza stale | Chiusura ops | Admin close quando si apre pilota Cosenza |
| 8 | Migrazioni LAV002 local-only | Repair/push controllato | Opzionale; dati già presenti |

**Criterio GO completo 1/12:** blocchi 1–2 chiusi per Roma; 3 chiuso prima di estendere cassa alle altre sedi; 4–5 almeno su un device pilota.
