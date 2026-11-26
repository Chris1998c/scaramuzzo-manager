# Consegna UI flow polish — 26/11/2026

**Branch UI:** `audit/ui-flow-polish-2026-11-26` (parte da tip che include `d23d1f8`)  
**Patch funzionali separate (non mischiate in questo commit di polish):** `dc0123d`, `cac4894`  
**Ambiente flusso:** isolato `localhost:3010` + Docker · dati sintetici · **prod e job #18 fermi**

## Preview navigabile

_(URL dopo deploy)_

Per rilascio selettivo: cherry-pick solo i commit di questo branch UI, oppure solo `dc0123d` / `cac4894`.

## Prima / dopo — percorso reception

| Step | Prima | Dopo |
| --- | --- | --- |
| Clienti | `screenshots/before/05-clienti-BEFORE-prod-200.png` (prod listone) | `screenshots/after/flow-01-clienti-desktop.png` — meta + cerca + `sczBtn*` |
| In sala | `screenshots/before/04-in-sala-reception.png` | (stesso percorso isolato con 1 appuntamento Cliente Alpha) |
| Cassa riepilogo | emoji pagamento / CTA generica | `flow-04-cassa-riepilogo-desktop.png` + mobile: totale grande, Contanti/Carta, **Conferma · € · stampa**, sticky telefono |

Flusso collaudato isolato: Clienti → (cliente Alpha) → In sala (appt `99901`) → Cassa desktop + telefono.  
Agenda “Nuovo appuntamento” già allineata in `d23d1f8` (data IT, errori leggibili); in questo giro verificata griglia oggi con seed in sala.

## Magazzino sottopagine

| Pagina | Esito |
| --- | --- |
| Hub | OK — hero senza titolo doppio |
| Movimenti | OK — `MagazzinoPageShell` + `MagazzinoHero` |
| Scarico rapido | OK |
| Scarico | OK |
| Carico | OK — hero + banner vista hub senza jargon ID |
| Trasferimenti | **ancora da allineare** (hero extrabold legacy) |
| Inventario / prodotto / modifica | **ancora da vedere** a video post-fix |
| Nuovo prodotto | già su `MagazzinoHero` |

## App Clienti / Team

| App | Repo | Build / commit | Verifica autenticata |
| --- | --- | --- | --- |
| App Clienti | `scaramuzzo-client-app` @ `ee845b1` | Expo web script + `.env` Supabase | `signInWithPassword` su **Supabase isolato** con `cliente.alpha.isolato@example.com` → **OK**. UI Expo web end-to-end **non aperta** in questo giro. |
| App Team | `scaramuzzo-team-app` @ `c3e21c0` | `dist/` PWA | Login **code+PIN** vs Manager isolato: `SYN-STAFF-201` / `1234` → token OK; `POST /api/mobile/my-appointments` e `attendance/status` → **OK**. Schermata `login.html` serve locale flaky (porta 3020); flusso UI PWA **parziale**. |

## Pulizia codice (solo inutilità verificate)

File passati in rassegna in questo giro (oltre alle modifiche UI):

| File / area | Azione |
| --- | --- |
| `app/dashboard/cassa/[appointmentId]/page.tsx` | Commento header aggiornato; rimossi emoji pagamento; CTA/copy allineate. **Conservati** commenti su sconti riga / printer_enabled. |
| `app/dashboard/magazzino/{rapida,movimenti,scarico,carico}/page.tsx` | Rimossi hero duplicati / import `framer-motion`+`ArrowLeft` inutilizzati dove non più usati. |
| `components/magazzino/ui/magazzinoUi.tsx` | `MagazzinoHero.title` opzionale. |
| `lib/servicesCatalog.ts`, `AgendaGrid`, provider | (giro precedente `d23d1f8`) checkmark commenti → testo sobrio. |
| `components/agenda/ServiceBox.tsx` | `console.log` drag **conservato** (gated `NODE_ENV !== production`). |
| TODO / blocchi commentati abbandonati | Nessun TODO risolto da eliminare trovato in `app/dashboard` operativo. |

**Non rimossi:** commenti su regole fiscali, permessi sedi, compensazioni, idempotenza, rollback Agenda.

## Schermate ancora da vedere

- Trasferimenti (hero legacy)
- Inventario + scheda prodotto + modifica + QR
- Nuovo appuntamento modal retest mobile post-seed di oggi (desktop già OK in audit precedente)
- Checkout Cassa fino a registrazione vendita (UI confermata; **non** chiusa vendita per non sporcare ledger oltre il necessario — cassa aperta con totale €25 pronta)
- App Clienti: UI Expo autenticata (booking/cancel)
- App Team: PWA login.html → home/appointments in browser
- WhatsApp / Impostazioni sotto-tab dopo polish Impostazioni

## Check

- `npm run lint` (tsc) PASS  
- `npm run build` PASS  
- Scritture solo isolato  
