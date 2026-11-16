# Classificazione appuntamenti (48) — 2026-11-16

## Test dimostrati (rimossi dall’operatività)
| id | azione | prova |
|----|--------|-------|
| 96 | `cancelled` | notes `e2e-staff-…` |
| 138 | già `cancelled` | notes `[TEST WA REMINDER]` |
| 97 | `done` (storico) | notes `e2e-staff-…`; sale 62 eliminata (A); nascosto da baseline |

## Reali (preservati)
| id | status | source | nota |
|----|--------|--------|------|
| 124 | cancelled | customer_app | prenotazione App Clienti |
| 125 | cancelled | customer_app | prenotazione App Clienti |
| 126 | scheduled (passato) | customer_app | prenotazione App Clienti con customer — **non cancellato** |
| done con sale B/C | done | booking/walk_in | trail fiscale preservato |

## Incerti (preservati, fuori baseline operativa)
Tutti gli altri `scheduled` / `in_progress` / `in_sala` con `start_time` < baseline (feb–nov 2026) senza marker test esplicito: **non cancellati**. Non compaiono in Agenda/KPI post-baseline. Elenco id aperti pre-baseline: 30,31,32,42,43,48,54,57,64,65,66,67,72,76,77,115,116,117,126,132,133,134,136,141 (+ done storici).

## Reminder
Nessun appointment con `start_time >= now()` in status attivo → nessun reminder futuro da appuntamenti di prova.
