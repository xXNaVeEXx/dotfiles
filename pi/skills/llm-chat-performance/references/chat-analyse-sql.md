# Echte Chats auswerten — Zugang und SQL

## Zugang (mag-tech Test-Cluster)
- kubectl läuft auf `gamzat@gamzat-dev` (Schlüssel freigegeben): `ssh -o BatchMode=yes gamzat@gamzat-dev
  'export KUBECONFIG=~/.config/.kube/k3s-config; kubectl …'`. Das kubeconfig bleibt dort, nicht kopieren.
- Test-Cluster `clusterapp`: Namespace `gamzatlab`, Pod `postgres-0`, DB `besichtigung`, Benutzer `app`
  (`printenv POSTGRES_USER POSTGRES_DB` im Pod). Andere Namespaces: `gamzatlab-main` (main), `ki-*` (KI-Plattform).
- SQL als Datei über stdin schicken, nie interaktiv:
  `ssh … 'kubectl -n gamzatlab exec -i postgres-0 -- psql -U app -d besichtigung -At -F " | " -f -' < /tmp/x.sql`
  Erste Zeile der Datei: `SET default_transaction_read_only = on;` — garantiert nur lesen.

## Datenform
- `chat_messages.tool_calls` ist ein jsonb-Array von Teilen: `type` = `tool-call` (mit `toolName`, `args`),
  `tool-result` (mit `toolName`, `result`), `zwischentext`. Aufrufe immer über `type = 'tool-call'` zählen (sonst doppelt),
  Ergebnisgrößen über `type = 'tool-result'` (`length(result::text)`).
- Eine „Antwort“ = Nutzernachricht plus direkt folgende Assistant-Nachricht derselben Sitzung (`row_number()` über
  `sort_order, created_at`); Dauer = `created_at` Assistant − `created_at` Nutzer (Gesamtzeit, keine Rundenzeiten).
- `ai_usage_logs` (Tokens je Modellaufruf) wird nur geschrieben, wenn die App selbst abrechnet; läuft die Abrechnung über
  ein Gateway, fehlen Rundenzeiten → im Bericht sagen und Lauf-Kennzahlen je Antwort als Folgeaufgabe vorschlagen.

## Fallen
- In `psql -f` gilt ein `WITH … AS (…)` nur für die eine Anweisung; temporäre Views scheitern im Read-only-Modus. Den
  CTE-Kopf per Skript vor jede Abfrage setzen.
- Doppelte Aufrufe = gleiches `toolName` + gleiches `args::text` innerhalb derselben Antwort, nur `tool-call`-Teile.

## Abfragen, die sich bewährt haben
- Aufrufe je Antwort mit Median-Dauer (Buckets 0 / 1–2 / 3–4 / 5–13 / Ausreißer).
- Je Tool: Anzahl, Ø/max Ergebnisgröße, Fehlschläge (`result::text ~* '"success"\s*:\s*false|"error"'`), sortiert nach
  Gesamtvolumen.
- Doppelaufrufe je Tool; Gesamtvolumen und Zahl der Ergebnisse > 8 KB; Antworten vor/nach einem Stichtag (Wirkung).
