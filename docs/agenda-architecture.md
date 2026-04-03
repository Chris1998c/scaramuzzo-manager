# Agenda — contratto tecnico e perimetro codice

Documento interno per evitare regressioni. Non sostituisce RLS o policy Supabase.

## 1. Contratto dati

- **`appointments` (header):** `start_time`, `end_time`, `status`, `notes`, `staff_id`, `customer_id` (più id). Valori di header devono riflettere le righe operative quando l’app aggiorna tramite il flusso agenda.
- **`appointment_services` (righe):** `start_time`, `duration_minutes`, `staff_id`, `service_id`, `appointment_id`. **Non esiste `end_time` sulle righe:** la fine logica è sempre `start_time + duration_minutes` (in memoria o nel calcolo header).
- **Regola header (allineata al codice `computeHeaderFromLines`):**
  - `start_time` = minimo degli `start_time` delle righe (dopo clamp durata).
  - `end_time` = massimo degli istanti di fine logica (`start_time + duration_minutes` clampato).
  - `staff_id` = `staff_id` della **prima riga** ordinata per `start_time` ascendente, poi `id` ascendente (tie-break).

## 2. Query unica lista griglia

Stringa **`AGENDA_LIST_SELECT`** in `lib/agenda/agendaContract.ts`: appointment con embed `customer` e `appointment_services` con embed `services`. È la select di riferimento per la lista giorno/agenda.

## 3. Normalizzazione (`normalizeAgendaRows`)

Input: array grezzo da Supabase. Output: `AgendaAppointment[]` stabile per UI.

- Header con `id` non numerico o `<= 0`: **escluso** dall’array.
- Riga `appointment_services` senza `id` finito o con `id <= 0`: **esclusa**.
- `duration_minutes`: **`clampDurationMinutes`** (minimo = `SLOT_MINUTES` da `components/agenda/utils`).
- Embed `customer` / `services`: **oggetto** atteso; se PostgREST restituisce **array**, si usa il **primo elemento** (`unwrapSingleEmbed`).
- Servizio embed mancante: fallback nome/durata/color coerenti con il resto del modulo.

## 4. Header da righe DB (`computeHeaderFromLines` / `syncAppointmentHeaderFromDb`)

- `computeHeaderFromLines`: puro, usa clamp durata prima di MIN/MAX; staff dalla prima riga ordinata (tempo + id).
- `syncAppointmentHeaderFromDb`: legge `appointment_services` da DB, ricalcola header, aggiorna `appointments`. Se **non ci sono righe**, termina con `ok` **senza** aggiornare l’header (dato legacy corrotto resta tale finché non si aggiungono righe o si interviene a mano).

## 5. Commit griglia: drag / resize / edit / create

- Mutazioni su **righe** passano da **`commitLinePatch(client, { appointmentId, lineId, patch })`**: aggiorna solo campi presenti in `patch`; `duration_minutes` viene clampato; **patch vuota = no-op** (`ok: true`, nessuna query Supabase, header invariato).
- Dopo update riga riuscito: **`syncAppointmentHeaderFromDb`** ricompone header da tutte le righe.
- Modali (creazione / modifica nome cliente, note, ecc.) devono restare allineate: cambi che spostano **tempo o staff di riga** → commit su `appointment_services` + sync; solo metadati header (es. note) possono aggiornare `appointments` senza toccare le righe, secondo implementazione attuale.

## 6. Perché `appointment_services` non ha `end_time`

Evita duplicazione e drift: una sola fonte di verità per la durata (`duration_minutes`). `end_time` dell’header è derivato e allineato via sync.

## 7. File core

| Ruolo | Percorso |
|--------|-----------|
| Select, tipi, normalize, header, commit | `lib/agenda/agendaContract.ts` |
| Costanti slot / tempo UI, apertura salone griglia (`agendaGridDayStartLabel`) | `components/agenda/utils.ts` |
| Griglia, drag/resize, commit | `components/agenda/AgendaGrid.tsx`, `components/agenda/ServiceBox.tsx` |
| Creazione / edit | `components/agenda/AgendaModal.tsx`, `components/agenda/EditAppointmentModal.tsx` |
| Pagina | `app/dashboard/agenda/page.tsx` |

Test contratto: `lib/agenda/agendaContract.test.ts` (Vitest).

## 8. Legacy / fuori flusso (non riattaccare)

- **`components/agenda/AppointmentBox.tsx`:** non far reintrare nel flusso lista/commit condiviso con `ServiceBox`; rischio doppi writer o modello dati diverso.
- **`agendaIntel`:** rimosso; non reintrodurre layer paralleli di “intelligenza” sulla stessa lista.

## 9. Rischi residui reali

- **DB già sporco:** header non allineato alle righe, righe senza servizio valido, clienti mancanti — la normalizzazione attenua crash UI ma **non** corregge il DB.
- **Appuntamento senza righe:** sync header non ricalcola; la UI può mostrare header vecchio.
- **Più staff su righe diverse:** consentito dai dati; header espone un solo `staff_id` (regola della prima fascia oraria).
- **RLS / permessi:** errori Supabase vanno gestiti a livello UI/messaggi; questo documento non copre policy.

## 10. Verifica rapida anti-regressione

1. `npx tsc --noEmit`
2. `npm test` (o `npx vitest run`)
3. Manuale: crea appuntamento singolo e multi-servizio; drag e resize; edit solo note / solo cliente; verifica che orari header e altezze box restino coerenti con `SLOT_MINUTES` e durate.
4. Code review: nessun nuovo update diretto su `appointment_services` che Salti `commitLinePatch` + sync dove il flusso standard è la griglia.

## 11. UI griglia e modale (linee guida)

- **Card (`ServiceBox`):** ogni riga è una card; **barra e tint** derivano da `services.color_code` di **quella riga** (app multi-servizio = colori diversi per box). Altezza = `duration_minutes` rispetto a `SLOT_MINUTES` (minimo ufficiale = stesso clamp della persistenza).
- **Modifica appuntamento:** layout compatto scrollabile dentro viewport; listino servizi in sola lettura con stesso codice colore; form cliente / orario / staff / note allineati al contratto (spostamento orario/staff → righe + `syncAppointmentHeaderFromDb` quando ci sono `appointment_services`).
