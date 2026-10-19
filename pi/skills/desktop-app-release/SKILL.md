---
name: desktop-app-release
description: Use when packaging or releasing a cross-platform desktop app (Tauri v2 + GitHub Actions) for Linux, Windows and macOS: cheap pre-checks, test runs without a tag, tag-triggered draft releases, sidecars and bundled runtimes, reading failed bundle jobs, and handing the right installer to the user for testing.
---

# desktop-app-release

# Desktop-App für Linux, Windows und macOS paketieren und veröffentlichen

Klasse: Installer einer plattformübergreifenden Desktop-App in der CI bauen, prüfen und als Release ausliefern.
Stack beim Nutzer: Tauri v2 + GitHub Actions (Standard-Runner), Release-Workflow per Tag, Release als Entwurf.
Fallen von Tauri (Konfiguration, Sidecars, Linux, Windows, macOS, CI-Plattenplatz, Updater) stehen in
references/tauri-v2.md.

## Procedure
1. **Billig vorprüfen, nicht voll bündeln:**
   - Staging-Skripte (Sidecars, mitgelieferte Laufzeiten, Ressourcen) mit Fake-Werkzeugen im PATH testen.
   - Den Workflow mit actionlint prüfen.
   - Volle Bundle-Builds laufen nur in der CI. Sie dauern pro Plattform über 30 Minuten und brauchen viel RAM.
2. **Testlauf ohne Tag:**
   - Dem Release-Workflow zusätzlich `workflow_dispatch` mit einer Eingabe für die Plattformen geben.
   - Ohne Tag lädt er die Pakete als Workflow-Artefakte hoch und legt keinen Release-Entwurf an.
   - Stand auf einen `ci/<name>`-Zweig pushen, den Lauf per REST starten, den Zweig danach löschen.
   - `workflow_dispatch` startet nur Workflows, deren Datei schon auf dem Standard-Branch liegt. Einen NEUEN Workflow
     vor dem Merge testen: im Wegwerf-Commit zusätzlich `push: branches: [ci/<name>]` eintragen, auf diesen Zweig
     pushen, Lauf beobachten, Zweig löschen.
   - Erst taggen, wenn alle Plattformen grün sind. Grund: Jeder Tag-Lauf hinterlässt einen Release-Entwurf und
     kostet eine halbe Stunde.
3. **Beobachten:**
   - Den Lauf als Hintergrundtask verfolgen.
   - Die Matrix läuft mit `fail-fast: false`, damit eine rote Plattform die anderen nicht abbricht.
4. **Fehler gezielt lesen:**
   - `GET actions/runs/<run>/jobs` liefert je Job die Schritte; gesucht sind die mit `conclusion == "failure"`.
   - `GET actions/jobs/<job>/logs` (Weiterleitung folgen: `curl -L`) in eine Datei unter `.tmp/` schreiben.
   - Die Datei nur mit `grep -n -i 'error\|panicked\|failed to'` lesen.
   - Meldet ein Unterwerkzeug nur einen Sammelfehler, zuerst mit `--verbose` bauen. Bei Fehlschlag zusätzlich das
     Bundle-Verzeichnis als Artefakt hochladen (`if: failure()`). Grund: Raten kostet je Versuch einen ganzen Lauf.
5. **Taggen:**
   - Den Tag nach dem Muster des Workflows setzen; das Release entsteht als Entwurf.
   - **Updater-Signatur aktivieren (alles drei nötig):** Schlüssel einmalig `pnpm --dir <ui> tauri signer generate -w ~/.tauri/<app>-updater.key --password <pw> --ci` (Key + .pub + Passwort unter ~/.tauri/, chmod 600); Repo-Secrets `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` und Variable `LUMI_UPDATER_PUBKEY` per `gh secret/variable set … < datei` setzen; UND `plugins.updater.pubkey` in tauri.conf.json füllen — Format ist der einzeilige base64-Inhalt der .pub-Datei (sie kodiert Kommentarzeile + Key). Achtung: Das CLI liest beim Signieren das Konfigurationsfeld, nicht die Secrets — steht dort `""`, bricht der Lauf NACH erfolgreichem Bundling ab mit „failed to decode pubkey: Missing comment in public key". Bettet die App den Key zusätzlich per `option_env!` ein, muss dieselbe Variable auch als Build-ENV exportiert werden. Nach dem Eintragen Tag auf den Fix-Commit verschieben (löschen + neu setzen), sonst baut der Lauf den alten Stand.
   - Updater-Manifest und Signaturen gibt es nur mit den Signatur-Secrets. Fehlende Secrets und die
     Apple-Signierung als „wartet auf Nutzer“ führen.
   - **Fällt der Tag-Push still aus** (kein Run nach ~2 Minuten, auch nach Tag löschen+neu pushen nicht):
     Workflow per REST vom Tag-Ref anstoßen — `POST …/actions/workflows/<file>/dispatches {"ref":"<tagname>", "inputs":{"plattformen":"alle"}}`; der Lauf nutzt die Workflow-Datei aus dem Tag-Commit. Bei `workflow_dispatch`-Event baut er ARTEFAKTE statt eines Release-Entwurfs (tagName bleibt leer).
   - **Release dann selbst anlegen:** `POST /releases` mit `tag_name`, `target_commitish` = Tag-Commit-SHA, `draft: true`; Notes aus der Release-Verwendungs-Doku bzw. kuratiert. Nach Build-Ende Artefakte herunterladen (`GET actions/runs/<run>/artifacts` → zip entpacken), Assets per `POST uploads/releases/<id>/assets?name=…` hochladen (jeweils Paket UND `.sig`), dann Release veröffentlichen (`PATCH …/releases/<id> {"draft": false}`). Draft-Releases zeigen vorher eine `untagged-…`-URL — normal. **Nach dem Publishen `tag_name` verifizieren:** Bei Draft + bereits existierendem Tag kann GitHub beim Veröffentlichen den Namen verlieren (`tag_name` wird selbst zu `untagged-…`) — dann per `PATCH {"tag_name": …}` zurücksetzen, denn alle Asset-Download-URLs und das Updater-Manifest zeigen auf `releases/download/<tag>/…` und brechen sonst still.
   - **`latest.json` selbst bauen, wenn der Lauf per Dispatch lief** (tauri-action erzeugt sie nur bei echten Tag-Events): `version`, `notes`, `pub_date` (UTC ISO), `platforms`: `linux-x86_64` → AppImage, `darwin-universal` → `app.tar.gz` (nicht das dmg — macOS-Updater lädt das Archiv), `windows-x86_64` → MSI oder NSIS-Setup; je `signature` = Dateiinhalt der zugehörigen `.sig`, `url` = endgültige Asset-URL. JSON per Python bauen (Signaturen sind mehrzeilig) und als Asset `latest.json` hochladen — ohne sie findet die App kein Update.
6. **Notes aus der History kuratieren:**
   - `git log --oneline <vorigerTag>..HEAD -- <app-pfad> | wc -l` und `git log --format=%s … | grep -oE '^[a-z]+\(<scope>\)' | sort | uniq -c` für die Substanz; PR-Link und Test-Zahlen aus den letzten Berichten dazunehmen.
   - Download-Tabelle je Plattform ins Body; macOS als „Universal (Apple Silicon + Intel)" ausweisen, wenn `--target universal-apple-darwin` gebaut wurde.
   - Body-Datei vor dem POST einmal Korrektur lesen (Tippfehler); JSON-Payload per Python bauen, nicht per Shell-Quote.
7. **Übergabe an den Nutzer:**
   - Genau das Paket für sein System nennen, mit Link:
     - Arch/CachyOS → AppImage
     - Debian/Ubuntu → .deb
     - Windows → Installer (.msi/.exe)
     - macOS → .dmg
   - Bei privatem Repo dazusagen, dass der Download einen Login braucht.
   - Was nur von Hand prüfbar ist (Audio, Benachrichtigungen, Autostart, Updater), als Handtest-Liste mitgeben.

## Pitfalls
- Mitgelieferte Laufzeiten (z. B. Node) aus offiziellen Upstream-Builds nehmen, nie aus Nix. Grund: Nix-Binaries
  hängen an /nix/store-Pfaden (Interpreter, Bibliotheken) und haben andere Build-Optionen.
- Mitgelieferte `node_modules` vor dem Bündeln auf die Zielplattform beschneiden: Prebuilds anderer OS/CPU und
  musl-Varianten auf glibc-Linux entfernen. Grund: Paketierer wie linuxdeploy prüfen jede mitgelieferte ELF-Datei
  und brechen an fremden Binaries ab (Details in references/tauri-v2.md).
- Staging- und Hilfsskripte müssen `$CARGO_TARGET_DIR` beachten. Grund: CI und Entwicklungsrechner nutzen
  verschiedene Target-Verzeichnisse; ein fest verdrahtetes `target/` findet die Binaries nicht.
- GitHub-API-Zeitfilter sind UTC: `actions/runs?created=>…` mit Ortszeit gefüllt liefert still `total_count: 0`
  (die Zeit liegt in der Zukunft) — vorher `date -u` prüfen, sonst diagnostiziert man einen nicht gelaufenen
  Workflow, der längst läuft.
- Doku-Commits (und alle anderen): Subject ≤72 Zeichen — der lokale Guard-Hook blockt längere still. Scheitert ein
  Commit am Hook, `git add` + `git commit` ZUSAMMEN neu ausführen; ein nach dem Hook-Fehler wiederholtes bloßes
  `git commit` findet das Staging teils nicht mehr vor.
