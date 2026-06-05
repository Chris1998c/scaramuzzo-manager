# SCARAMUZZO MANAGER – PRE PILOT GATE

## 1) BUILD & DEPLOY
- [ ] `npm run build` locale OK
- [ ] ultimo push su main OK
- [ ] ultimo deploy Vercel in stato Ready
- [ ] nessun errore runtime immediato su /login
- [ ] nessun errore runtime immediato su /dashboard

## 2) ENV CRITICHE – VERCEL
- [ ] NEXT_PUBLIC_SUPABASE_URL presente
- [ ] NEXT_PUBLIC_SUPABASE_ANON_KEY presente
- [ ] SUPABASE_SERVICE_ROLE_KEY presente
- [ ] SUPABASE_JWT_SECRET presente se usato nel progetto
- [ ] MOBILE_JWT_SECRET presente (obbligatorio: login mobile risponde 503 senza token se manca)
- [ ] fiscal callback secret presente
- [ ] nessuna env legacy/duplicata che crea ambiguità

## 3) ENV CRITICHE – WHATSAPP
- [ ] stato deciso chiaramente: reminders OFF per il pilota
- [ ] WHATSAPP_ACCESS_TOKEN verificato o volutamente assente
- [ ] WHATSAPP_PHONE_NUMBER_ID (claim OTP + invii Graph)
- [ ] WHATSAPP_OTP_TEMPLATE_NAME — template Meta con body {{1}} = codice OTP
- [ ] WHATSAPP_OTP_TEMPLATE_LANG (default `it`)
- [ ] CUSTOMER_CLAIM_OTP_PEPPER (produzione, non placeholder dev)
- [ ] CUSTOMER_CLAIM_DEBUG_OTP=false in produzione
- [ ] WHATSAPP_APPOINTMENT_REMINDER_TEMPLATE_NAME verificato o volutamente assente
- [ ] nessun cron attivo per reminders automatici se provider non configurato

## 4) SUPABASE – STRUTTURA
- [ ] migration allineate all’ultima versione del repo
- [ ] `fiscal_print_jobs` esiste
- [ ] `attendance_logs` esiste
- [ ] `appointment_whatsapp_reminders` esiste
- [ ] `customer_service_cards` esiste
- [ ] `service_prices` esiste
- [ ] nessuna migration locale importante non ancora applicata al remoto

## 5) SUPABASE – SICUREZZA/RUOLI
- [ ] coordinator entra e vede tutto correttamente
- [ ] magazzino lavora correttamente sul centrale
- [ ] reception vede solo il proprio salone
- [ ] cliente non accede al centro di controllo
- [ ] nessun endpoint restituisce dati cross-salone con utente reception

## 6) DATI BASE PILOTA
- [ ] esiste almeno 1 salon pilota reale scelto
- [ ] esiste almeno 1 utente coordinator valido
- [ ] esiste almeno 1 utente reception del salone pilota
- [ ] esiste almeno 1 cassa/sessione apribile nel salone pilota
- [ ] esistono servizi reali e prezzi del salone pilota
- [ ] esiste almeno 1 prodotto vendibile nel salone pilota
- [ ] esiste almeno 1 cliente test
- [ ] esiste almeno 1 collaboratore/staff reale associato al salone pilota

## 7) FISCALE / PRINT BRIDGE
- [ ] PC cassa pilota identificato
- [ ] Print Bridge installato sul PC giusto
- [ ] servizio bridge avviabile
- [ ] endpoint locale bridge risponde
- [ ] stampante Epson FP81 RT raggiungibile dal PC cassa
- [ ] callback fiscale verso app configurata
- [ ] test stampa non ancora fatto oppure fatto e documentato

## 8) AI / OPENAI (OPZIONALE)
- [ ] stato deciso chiaramente: AI ON/OFF per il pilota
- [ ] OPENAI_API_KEY presente (solo se si vuole abilitare l'AI) oppure volutamente assente
- [ ] OPENAI_MODEL opzionale (default consigliato `gpt-4o-mini`)
- [ ] verificato che senza OPENAI_API_KEY il comportamento sia:
  - [ ] Marketing Ai (`/api/marketing/ai-copy-assist`) disattivato — bottone "Migliora messaggio" disabilitato
  - [ ] Client Intelligence AI usa il fallback deterministico (`buildClientInsights`)
  - [ ] nessuna chiamata a OpenAI eseguita
- [ ] nessun segreto OpenAI committato nel repo (solo `.env.example` con placeholder)

## 9) GO / NO GO
- [ ] tutti i punti bloccanti chiusi
- [ ] nessun dubbio su env, bridge, ruoli, DB
- [ ] pilota autorizzato