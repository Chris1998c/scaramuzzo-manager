# Inventario sola lettura — 2026-11-26 Europe/Rome

Ambiente: Supabase `jrqhfnvtdaiutquksgxd` (unico progetto ACTIVE). Baseline operativa: `2026-11-16T15:01:28` UTC.

## Conteggi

| Entità | Totale | Post-baseline | Note |
|---------|--------|---------------|------|
| sales | 10 | 0 | Tutte Roma (salon 1), pre-baseline |
| appointments | 48 | 0 | Nessuna prenotazione futura ≥ 2026-11-26 |
| attendance_logs | 0 | — | Nessuna timbratura ancora |
| cash_sessions | 17 | — | 2 **open** stale: id 17 Roma (2026-11-09), id 12 Cosenza (2026-05-20) |
| fiscal_print_jobs | 25 | — | 16 completed, 8 cancelled, 1 failed (job 18 sale 63) |
| fiscal_documents | 10 | — | Trail fiscale preservare |
| stock_movements | 407 | — | Giacenze presenti su sedi 1–5 |
| bridge_installations | 2 | — | Solo Roma; altre sedi **senza Bridge** |

## Classificazione sales (già in README-bonifica-vendite.md)

- Classe A eliminabili (dry-run): 18 ID — **già rimossi** (restano 10 B/C).
- Residui pending/queued da **non** requeue senza journal Epson: 52, 54, 57, 58, 63.
- Trail stampato/voidato da preservare: 53, 64, 70, 72, 75 (+ 54 printed irrisolto).

## Appuntamenti

- Test marcati: 96 cancelled, 97 done, 138 cancelled `[TEST WA REMINDER]`.
- Customer app: 124, 125 cancelled; 126 scheduled passato — preservare.
- Incerti pre-baseline: nascosti da baseline operativa; **non cancellare** senza review nominativa.
- Prenotazioni reali future: **0** al momento dell’inventario.

## Bridge postazioni

| bridge_id | salon | version heartbeat | last_seen | Esito |
|-----------|-------|-------------------|-----------|-------|
| roma_cassa_1 | 1 Roma | **1.2.0** (repo 1.3.2) | 2026-11-26 | Online; last_error DNS storico su host vercel |
| bridge-dev-macbook | 1 | 1.2.0 | 2026-05-23 | Stale / non operativa |

Corigliano, Castrovillari, Cosenza: **nessuna installazione Bridge** in DB.

## Report dicembre 2025 (legacy_turnover_daily.total_gross)

| Sede | Atteso | Ottenuto | Esito |
|------|--------|----------|-------|
| Roma (1) | €17.977 | €17.977 | OK |
| Corigliano (2) | €30.791 | €30.791 | OK |
| Castrovillari (3) | €11.103 | €11.103 | OK |
| Cosenza (4) | €29.540 | €29.540 | OK |

BOSS LAV002: tabella `legacy_staff_turnover` presente (14+ righe); migrazioni `2026111718*` / `2026111719*` **non ancora su remote** — Report Team nominativo dipende da push migrazione.

## Bonifica proposta (NON eseguita)

1. Backup verificabile (pg dump o snapshot Supabase).
2. Dry-run `cleanup-class-a-sales.sql` — già eseguito in passato; A già assenti.
3. Chiudere/admin-close cash_sessions open stale (17, 12) dopo conferma sede.
4. Revocare `bridge-dev-macbook` o marcarla offline.
5. Job/sale incerte 52/54/57/58/63: riconciliare con journal Epson **prima** di qualsiasi delete/requeue.
6. Fermarsi qui: nessun DELETE/UPDATE in produzione senza elenco firmato.

### Effetto previsto per sede (se si applicasse solo chiusura turni stale)

| Sede | Azione | Effetto |
|------|--------|---------|
| Roma | close session 17 | Nessuna vendita/giacenza; solo stato turno |
| Cosenza | close session 12 | Idem |
| Altre | nessuna | — |
