# Bonifica vendite pre-lancio

## Script

`cleanup-class-a-sales.sql` — **non eseguito** in produzione in questa fase.

Default finale dello script: `ROLLBACK` (dry-run sicuro). Per applicare: backup → dry-run → sostituire `ROLLBACK` con `COMMIT`.

## Classe A eliminabili (18 ID — review 2026-11-16)

`8, 9, 27, 35, 47, 48, 49, 50, 51, 55, 56, 59, 60, 62, 67, 73, 74, 76`

**Esclusa da A → C:** `63` (job 18 phantom/failed; nessuna prova assoluta di non-emissione su Epson → preservare).

## Classi B/C da preservare (non nello script)

| sale_id | fiscal_status | Motivo preservare | Prova fisica / journal ancora necessaria |
|--------|---------------|-------------------|------------------------------------------|
| 52 | queued | job 5 completed senza `fiscalReceiptNumber` | **C**: scontrino carta o `fiscal_journal` Bridge |
| 54 | printed | job 7 completed senza receipt# ma status printed | **C** |
| 57 | pending | job 8 completed senza receipt# | **C** |
| 58 | pending | job 9 completed senza receipt# | **C** |
| **63** | pending | job 18 `failed`, attempts=0, result=null, cleanup E2E; **nessun** `fiscal_documents` né bridge event, ma `completed_at` settato → dubbio residuo | **C**: preservare finché journal Epson 19/05 non conferma |
| 53 | voided | trail sale+void | **B→void** |
| 64 | voided | receipt #1 + void | **B** |
| 70 | printed | receipt #3 | **B** |
| 72 | printed | receipt #5 | **B** |
| 75 | voided | receipt #3 + void | **B** |

Per 52/54/57/58/63: **non** cambiare `fiscal_status` e **non** fare requeue finché non c’è prova fisica o journal.

## Conteggio atteso dopo COMMIT riuscito

- `sales`: 28 − 18 = **10** (B/C incl. 63)
- class A list: **0**
- `sale_items` target: 23 → 0; `appointments` unlink: 13 (righe appointment restano)
- `fiscal_print_jobs` su A: già 0; `stock_movements` su A: 0
- `fiscal_status IN ('pending','queued')` residui attesi tra **52, 57, 58, 63** (+ printed irrisolto **54**) — **non zero**
