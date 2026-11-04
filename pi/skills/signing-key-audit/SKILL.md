---
name: signing-key-audit
description: "Signatur- und Release-Schlüssel sowie CI-/Registry-Zugänge im Fleet finden, prüfen und ohne Ausgabe in CI-Secrets übernehmen."
---

# signing-key-audit

Klasse: Signatur- und Release-Schlüssel und CI-Zugänge finden, ihre Gültigkeit beweisen und ohne Wertausgabe in CI-Secrets übernehmen. Gemeint sind Tauri-Updater/minisign, age-verschlüsselte Keystores, Registry-Zugänge (z. B. Harbor) und GitHub-Secrets im Fleet.

## Ablauf
1. **Erwartung aus Repo und CI holen.**
   - Öffentlicher Schlüssel, z. B. `tauri.conf.json` → `plugins.updater.pubkey`. Base64-dekodiert ergibt er `untrusted comment: minisign public key: <KEY-ID>`.
   - CI-Variable mit `gh variable get <NAME> --repo <org>/<repo>`.
   - Secret-Namen und ihr Datum: `gh secret list --repo …`, dazu Nachbar-Repos und `--org …`. Nur Namen, die Werte sind nicht lesbar.
2. **Auf allen Fleet-Maschinen suchen**, lokal und per `ssh -o BatchMode=yes <host>`:
   - `ls -la ~/.tauri`
   - Dateinamen: `find ~ -xdev \( -name node_modules -o -name .cache -o -name target -o -name Steam -o -name containers \) -prune -o -type f \( -iname '*.key' -o -iname '*.key.pub' -o -iname '*signing*' \) -size -64k -printf '%TY-%Tm-%Td %s %p\n'`
   - Inhalte nur als Dateinamen (`grep -rIl`):
     - der Tauri-Geheimschlüssel-Kopf `dW50cnVzdGVkIGNvbW1lbnQ6IHJzaWduIGVuY3J5cHRlZCBzZWNyZXQga2V5` (base64 von „untrusted comment: rsign encrypted secret key“)
     - Kopien des Pubkeys per `grep -F "<pubkey-base64>"`
   - Datum der Funde gegen das Datum der Secrets halten. Gleiche Minute heißt: Das ist die Quelle der Secrets.
3. **Paar beweisen, ohne etwas auszugeben.**
   - Minisign/Tauri: eine Wegwerf-Datei signieren und gegen den Repo-Pubkey prüfen. Signieren mit `TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(cat <pw-datei>)" tauri signer sign -f <key> <datei>` (Passwort nur per Env, nie in argv; ohne `node`: `nix shell nixpkgs#nodejs -c …`). Die `.sig` ist base64 einer minisign-Signatur; dekodieren und prüfen mit `nix shell nixpkgs#minisign -c minisign -V -p <pub-dekodiert> -x <sig> -m <datei>`. Erwartete Ausgabe: „Signature and comment signature verified“. Nur die öffentliche Signatur verlässt die Maschine, Testdateien sofort löschen.
   - age-Keystore: das verschlüsselte Archiv zum Schlüssel kopieren und nur die Liste prüfen: `age -d -i <key> <archiv>.tar.age | tar -t`. Nichts entpacken. Die Dateinamen im Archiv belegen den Schlüssel.
4. **Registry-Zugänge (z. B. Harbor) prüfen und in ein Secret übernehmen.** Den Wert per Skript auf der Quellmaschine lesen, nie ausgeben.
   - Kontoart: `GET /api/v2.0/users/current` liefert bei Benutzern `sysadmin_flag`, bei Robot-Konten 412 PRECONDITION.
   - Echte Rechte je Repo: `GET /service/token?service=harbor-registry&scope=repository:<proj>/<repo>:push,pull`, dann den JWT-Payload (`access[].actions`) dekodieren. Ein persönlicher Test-Robot hat oft nur `pull` und taugt nicht zum Hochladen.
   - Übergabe in die CI per Pipe, ohne Zwischenausgabe: `ssh <host> '<skript, das nur den Wert druckt>' | gh secret set <NAME> --repo <org>/<repo>`.
   - Zwischendateien nur mit Rechten 0600 und sofort löschen.
5. **Doku nachziehen** mit Ablageort, Key-ID und Prüfdatum, nie mit Werten. Dem Nutzer eine zweite Sicherung empfehlen.

## Stolperfallen
- Nie Inhalte privater Schlüssel, Passwortdateien oder Registry-/Docker-Auth ausgeben, auch nicht gekürzt. Bei grep immer `-l`. Grund: Tool-Ausgaben landen in Sitzungsdateien und Kompressions-Zusammenfassungen.
- Nicht-interaktive SSH-Shells haben oft weder `node` noch `nix` im PATH. Dann absolute Pfade nutzen, etwa `/nix/var/nix/profiles/default/bin/nix --extra-experimental-features "nix-command flakes" shell …`.
- Fehlt ein Schlüssel an der dokumentierten Stelle: erst alle Fleet-Maschinen durchsuchen, dann erst „verloren“ dokumentieren. Grund: Ein neuer Updater-Schlüssel bricht die Selbst-Updates aller bestehenden Installationen.
- Secrets anderer Repos lassen sich weder auslesen noch kopieren. Werte aus lokalen Quellen (Docker-Login, age-Key-Datei) nur nach Rückfrage in neue Secrets übernehmen, am besten als Org-Secret für alle Repos. Ist der Wert nur als Secret im Quell-Repo vorhanden und dort gültig, ein eigenes Zugangs-Konto statt der Admin-Kopie beschaffen: ein einmaliger Workflow im Quell-Repo erzeugt per Verwaltungs-API einen Robot mit minimalen Rechten (nur push+pull auf die nötigen Projekte) und gibt sein einmaliges Secret verschlüsselt aus. `workflow_dispatch` verlangt die Workflow-Datei auf dem Default-Branch (auch per API-Dispatch 404); deshalb den Einmal-Workflow mit `on: pull_request` in einen nie gemergten PR legen — der PR-Event führt die Workflow-Version aus dem Merge-Ref aus, und Branches im eigenen Repo bekommen die Secrets; `types: [opened, synchronize]` halten den Workflow über Pushes auf dem PR zum Laufen. Einmal-Parameter (z. B. Passphrase) als Zeile im PR-Text übergeben und aus `github.event.pull_request.body` lesen. Danach PR schließen, Branch löschen und die Werte lokal entschlüsselt per Pipe in `gh secret set` übernehmen.
- Lehnt eine Verwaltungs-API den Body ab (400), das Schema der VORHANDENEN Instanz aus ihrem Swagger/OpenAPI lesen statt Felder weiter raten — Versionen unterscheiden sich in Feldnamen und Pflichtfeldern. Pfade durchprobieren (`/swagger.json`, `/api/v2.0/swagger.yaml` …); ein 200 kann trotzdem die SPA-HTML sein, also Inhalt prüfen. Roboter-Rechte sind Registry-Scope (push/pull je Resource, z. B. `{"action":"push","resource":"repository"}` je Projekt-Namespace) — Verwaltungs-API (Roboter anlegen/löschen, Projektdaten leeren) bleibt Adminen vorbehalten.
- Derselbe Einmal-Workflow eignet sich zum Lesen geschützter Registry-Inhalte (z. B. ORAS-Artefakte mit Testdaten): in der CI mit den Admin-Zugängen `oras pull` (Version + SHA prüfen wie in den Repo-Workflows), als GitHub-Artefakt mit kurzer Aufbewahrung ablegen und lokal per `gh run download` holen; danach PR schließen, Branch löschen. Grund: Persönliche Testzugänge und Pull-Robots haben oft keinen Scope auf die Projektdaten.
- In Einmal-Workflow-Skripten mit `set -euo pipefail`: keine `cmd | head`-Pipes (SIGPIPE tötet den Lauf mit Exit 141/2) — `find … | wc -l` oder `… | sort | head || true` nehmen. Inline-`node -e`-Helfer mit stdin-Puffer-Variable keine lokalen Variablen desselben Namens im Ausdruck geben (TDZ-ReferenceError).
- Verschlüsselte Übergabe mit openssl: `-pass env:VAR` sieht nur EXPORTIERTE Variablen — Zuweisung und `export` trennen, sonst „No environment variable“; Passphrase aus einer Datei per `VAR=$(cat datei); export VAR` übernehmen, weil `-pass file:` die Zeilenumbrüche der Datei mitliest.
- Werte aus CI-Logs greppen: auf ein Inhaltsmerkmal ankern statt nur den Variablennamen — Base64-Chiffren beginnen mit `U2FsdGVkX1` („Salted__“), Namen mit bekanntem Präfix (z. B. `robot`). Grund: Die `##[group]`-Echos des Scripts stehen selbst im Log und enthalten dieselben Variablennamen, ein reiner Namens-Match greift zuerst die Script-Zeile.
- Zugangsdaten aus Sitzungsprotokollen anderer Agenten (`~/.claude/…`, pi-Sessions) nur nutzen, wenn der Nutzer es ausdrücklich erlaubt. Dann Kandidaten per Regex herausziehen, Platzhalter und `$VAR`-Verweise am Anfang verwerfen (ein `$` mitten im Wert ist erlaubt), Kandidaten nur als Hash-Präfix und Länge zeigen und höchstens etwa 3 Anmeldeversuche machen. Grund: Solche Protokolle enthalten oft veraltete Passwörter, und viele Fehlversuche können das Konto sperren.
