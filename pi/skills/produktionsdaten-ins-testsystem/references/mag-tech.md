# Projektwerte: mag-tech-monorepo (besichtigungs-app)

- Zugang Kundeninstanz: `ssh root@<host>`, k3s, Namespace der App (z. B. `besichtigungsapp`), Pod `postgres-0`,
  DB `besichtigung`, Benutzer `app`. Test-System clusterapp: `ssh gamzat@gamzat-dev` mit
  `KUBECONFIG=~/.config/.kube/k3s-config`, Namespace `gamzatlab`. Sicherungen nach `~/sicherungen/` auf gamzat-dev.
- Schemas: `public`, `revenue`, `timetracking` (App), `keycloak` (Identity-Provider in derselben DB — nie übernehmen).
- Mandanten-Spalte `firma_id`; Mandantentabelle `firmen` (Name in `firmenname`), Benutzer `users`
  (`keycloak_id`, eindeutige Indizes auf `email`, `keycloak_id`, `vehicle_id`). Anmelde-Konten = `users.keycloak_id IN
  (SELECT id FROM keycloak.user_entity)`; Rollen/Gruppen dazu in `user_firma_roles`, `user_groups`.
- Ausschluss-Muster für `--exclude-table-data`: `public.email_*`, `public.chat_*`, `public.ki_*`, `public.ai_*`,
  `public.messaging_*`, `public.push_*`, `public.record_history`, `public.accounting_settings`,
  `public.bank_connections`, `public.bank_transactions`, `public.softphone_einrichtungen`, `public.licenses`,
  `public.license_audit_log`, `public.module_license_periods`, `public.mobile_app_freigabe`,
  `public.company_settings`, `public.konfiguration_werte`, dazu Rettungs-/Hilfstabellen früherer Migrationen.
  Nicht übernehmen, obwohl ohne Mandanten-Spalte: `__drizzle_migrations`, `__seed_applied`,
  `konfiguration_parameter`, `user_theme_settings`, `filter_presets`.
- Erweiterung `pg_trgm` liegt im Schema `public` und muss in Zwischen-/Probe-DBs VOR dem Restore angelegt werden.
- Migrationen: `cd apps/besichtigungs-app && DATABASE_URL=… DRIZZLE_DIR=$PWD/drizzle bash k8s/scripts/migrate.sh`
  im Wrapper `mt-check`; Sequenzen danach mit `apps/besichtigungs-app/drizzle/resync-sequences.sql`.
- Kontaktfelder: `customers.email/phone` (eindeutiger Index `customers_email_firma_idx` je Firma),
  `offers.customer_email/customer_phone/header_dispatcher/notes`, `invoices.customer_email/customer_phone/
  finalized_snapshot` (jsonb, enthält auch IBAN), `users.email/pdf_email/phone/pdf_telefon`,
  `firmen.kontakt_email/kontakt_telefon/kontakt_telefon_alt/kontakt_fax`, `arbeitsnachweis_email_settings.cc_email`,
  Freitexte in `customers`, `appointments`, `comments`, `magic_events`, `customer_umzugsliste_events`,
  `editor_templates.content_json`, `variable_definitions.example`. Portal-Token: `magic_links.token`.
- Instanzweite Zeilen mit leerer `firma_id` (z. B. `variable_definitions` mit eindeutigem Index über
  `coalesce(firma_id, '0…0'), template_type, key`) nicht übernehmen.
- Dateien: Volume `/app/media` im App-Pod (Container `app`), referenziert über `media.url`, `thumbnail_url`,
  `card_url` (`/media/<datei>`); Belege in `revenue.receipts.s3_key`.
- Lokale Postgres-Werkzeuge können neuer als der Server sein: Dumps für das Ziel mit
  `docker exec besichtigungsapp-e2e-postgres pg_dump …` (PG 16) erzeugen.
- Ältere Benutzer-Zeilen derselben Firmen im Ziel, die in der Quelle fehlen, bleiben stehen (Benutzer werden nie
  gelöscht) — ihre Kontaktfelder nach dem Lauf ebenfalls auf Ersatzwerte setzen (`…alt@beispiel.example`).
