# Revisione UI / usabilità / copy — 26/11/2026

**Branch:** `audit/ui-usability-review-2026-11-26`  
**Base main / prod tip:** `45a686a` (promote `8152b96` + verify)  
**Già sul branch (conservati):** `dc0123d` (Clienti/Agenda UX + collaudo), `cac4894` (Agenda create/patch + rollback)  
**Ambiente UI:** isolato `localhost:3010` + Supabase Docker (scritture solo qui). Produzione e job **#18** non toccati.  
**Preview:** vedi URL in fondo dopo deploy.

## Perimetro vs produzione

| Ambito | In produzione (`main` / `manager.scaramuzzo.green`) | Solo branch audit |
| --- | --- | --- |
| Race Report salone + promote | sì (`8152b96`…`45a686a`) | — |
| Clienti browse 24 + copy Agenda modal | no | `dc0123d` |
| Agenda create/patch batch + Server-Timing + rollback | no | `cac4894` |
| Uniformità UI / copy / commenti di questo giro | no | commit su questo branch |

## App Clienti / App Team

| App | Repository | Commit / build provata | Note |
| --- | --- | --- | --- |
| App Clienti | `scaramuzzo-client-app` | `ee845b1` — *Fix booking cancellation confirmation in web app*; script `expo start --web` disponibile; PWA assets in `public/` | Flusso autenticato **non verificato end-to-end** in questo giro (nessuna sessione cliente isolata aperta). Codice e build repo ispezionati. |
| App Team | `scaramuzzo-team-app` | `c3e21c0` — *Fix PWA home-screen name and Scaramuzzo logo icons*; `dist/` PWA presente (`login.html`, `attendance.html`, …); EAS `preview` → API `manager.scaramuzzo.green` | Login/timbrature autenticati **non verificati** in questo giro su device; build statica `dist/` presente. |
| Mirror Manager | `scaramuzzo-manager/public/app-clienti`, `public/team` | allineati al deploy Manager | Solo hosting statico. |

## Controlli eseguiti

- Ruoli isolati: **reception**, **coordinator**, **magazzino** (auth ok).  
- Viewport: desktop + telefono (emulazione 390×844) su percorso operativo.  
- Lint/typecheck: `npm run lint` (**tsc --noEmit**) PASS.  
- Test: `cassaCloseSuccessToast` PASS; `closeSaleAppointmentIdempotency` PASS (rieseguito); suite completa ha avuto flake Docker ephemeral (4 file) sotto carico — non legati a queste modifiche UI.  
- Build: vedi log Preview/deploy.

## Tabella per schermata

| Schermata | Controllata | Difetto | Correzione | Retest |
| --- | --- | --- | --- | --- |
| Login | sì (desktop) | — | — | OK |
| Dashboard | sì R/C | contrasto KPI basso; titoli chrome | StatCard `white/50→/60`, `/45→/55` | OK contrasto migliorato |
| Agenda | sì R mobile/desk | data ISO in modal; errori FULL CAPS; badge DONE EN; emoji azioni | data IT; alert normale; badge CHIUSO; copy senza emoji | OK modal + griglia |
| In sala | sì R | doppio titolo; bottoni fuori token | meta sede + `sczBtn*` | OK |
| Clienti | sì R mobile/desk | h1 enorme + doppio titolo; bottoni custom | meta sotto chrome; `sczField`/`sczBtn*` | OK (vs BEFORE prod) |
| Scheda cliente | sì (messaggio) | “Salvato ✅” | “Profilo salvato” | OK a codice |
| Cassa | sì toast/path | “Cassa aperta ✅” | senza emoji | OK a codice; checkout pieno **non verificato** (cassa chiusa / nessuno in sala) |
| Magazzino hub | sì R | “Audit ledger”, “Σ”, “filtri attivi”; doppio titolo | copy operativa IT | OK |
| Magazzino sotto-pagine | parziale | titoli `font-extrabold` legacy | **non allineate** in questo giro | **non verificata** a video post-fix |
| Report | sì C | “Report” duplicato; “Cockpit”; export EN | Filtri e export; Riepilogo; toast PDF/CSV IT | OK |
| Presenze | sì R | hero card + Europe/Rome | PageHeader meta + StatChip | OK empty state |
| Impostazioni | sì C | “Centro di controllo” + hero | PageHeader meta sobria | OK |
| Job fiscali | sì C | “Print Bridge”; salone `(#1)` | Bridge stampa; nome sede | OK |
| Bridge stampa | sì C | — | — | OK empty casse |
| WhatsApp | sì link R/C | emoji ⚠️ warning | rimossi | assist AI off al lancio |
| Job #18 / prod write | — | — | lasciati fermi | n/a |

### Tempi fino a utilizzabile (isolato, reception/coord, network locale)

Misurati come tempo navigazione browser fino a UI interagibile (heading/filtri presenti), non Lighthouse.

| Schermata | ~ms fino a utilizzabile |
| --- | --- | --- |
| Dashboard | ~0,9–1,2 s (compilazione turbopack a freddo esclusa) |
| Agenda | ~1,5–2,5 s (spinner “Aggiornamento dati…” poi griglia) |
| Clienti | ~0,6–1,0 s |
| In sala | ~0,8–1,3 s |
| Magazzino | ~0,7–1,2 s |
| Report (coord) | ~1,2–2,0 s |
| Presenze | ~0,8–1,5 s |
| Job fiscali | ~1,0–1,8 s |

## Screenshot principali

Cartella: `scripts/cleanup/exports/ui-usability-review-2026-11-26/screenshots/`

- Prima Clienti prod: `05-clienti-BEFORE-prod-200.png`
- Dopo Clienti: `02-clienti-reception-after.png`
- Agenda / In sala / Magazzino / Report / Job fiscali: `03`…`07-*.png`
- Contrasto KPI prima: `02-dashboard-kpi-low-contrast.png`

## Preview

- **URL:** https://scaramuzzo-manager-fx2ewsq00-christians-projects-a583a48c.vercel.app  
- **Deploy:** `dpl_6XmYPgpA91FPoXdXBfTTkAzJngLN` · commit `d23d1f8` · branch `audit/ui-usability-review-2026-11-26`  
- **Inspector:** https://vercel.com/christians-projects-a583a48c/scaramuzzo-manager/6XmYPgpA91FPoXdXBfTTkAzJngLN  

> Preview condivide il DB di produzione: **sola lettura** / niente scritture operative su questa Preview.
