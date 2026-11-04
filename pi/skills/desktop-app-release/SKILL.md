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
0. **Version bumpen (vor jedem Tag):** App-Version an ALLEN Stellen: Workspace-`Cargo.toml` (`version =`, src-tauri erbt via `version.workspace`), `src-tauri/tauri.conf.json`, `ui/package.json`, ZWEI Tests mit hartkodierter/abgeleiteter Version (z. B. `version_matches_workspace` in lumi-core, eingebettetes Changelog `releases(CHANGELOG, version)`) und den CHANGELOG-Eintrag der neuen Version OBEN (Kurz-Zeile `> Kurz: …` + Bullets; das Format parst der App-Hilfe-Reader). Danach `cargo update -w --offline` in der Dev-Shell (nix develop -c …) laufen lassen — sonst bleiben die eigenen Workspace-Pakete in Cargo.lock auf der alten Version und der Tag/Build trägt falsche Versionszeichen. Bump-Commit über Branch+PR (main ist push-geschützt).
1. **Billig vorprüfen, nicht voll bündeln:**
   - Staging-Skripte (Sidecars, mitgelieferte Laufzeiten, Ressourcen) mit Fake-Werkzeugen im PATH testen.
   - Den Workflow mit actionlint prüfen.
   - Volle Bundle-Builds laufen nur in der CI. Sie dauern pro Plattform über 30 Minuten und brauchen viel RAM.
2. **Testlauf ohne Tag (und Installer-Rauchtest VOR jedem Tag — Pflicht):**
   - Dem Release-Workflow zusätzlich `workflow_dispatch` mit einer Eingabe für die Plattformen geben.
   - Ohne Tag lädt er die Pakete als Workflow-Artefakte hoch und legt keinen Release-Entwurf an.
   - Stand auf einen `ci/<name>`-Zweig pushen, den Lauf per REST starten, den Zweig danach löschen.
   - `workflow_dispatch` startet nur Workflows, deren Datei schon auf dem Standard-Branch liegt. Einen NEUEN Workflow
     vor dem Merge testen: im Wegwerf-Commit zusätzlich `push: branches: [ci/<name>]` eintragen, auf diesen Zweig
     pushen, Lauf beobachten, Zweig löschen.
   - **Vor dem ersten Tag einer Version das Installer-Artefakt vom Branch bauen und rauchtesten** (Linux: Dispatch
     auf dem Fix-Branch mit `plattformen: linux`, Artefakt laden, AppImage starten). Erst wenn der Rauchtest
     bestanden ist, mergen + taggen. Grund: Nutzer-Anforderung — jedes vorzeitig getaggte Release, das beim Nutzer
     nicht startet, erzwingt ein Folge-Release; ein Branch-Artefakt kostet nur einen Workflow-Lauf ohne Tag.
   - **Rauchtest so ausführen (Linux):** AppImage mit frischem LUMI_HOME/Testdatenverzeichnis (nie das echte
     Nutzerprofil) starten, 30–60 s OHNE Pipe am Leben lassen, dann VERIFIZIEREN: Prozess lief noch (pgrep —
     Muster mit `[B]racket`-Trick gegen Selbstmatch), KEINE neue Datei im Crash-Ordner des TEST-Datenverzeichnisses
     (`…/<app>/logs/crash-*.txt`), erwartete Warnungen im Log (z. B. fehlende Tray-Bibliothek) sind kein Abbruch.
     Grund: Start-Panics liegen oft erst Sekunden nach den ersten Logzeilen, und Tests (cargo/vitest) laufen in
     Tokio-/Mock-Kontexten, die den App-Setup-Pfad nie ausführen. Falle beim Beweis: `timeout 60 app | head; echo $?`
     liefert den Exit-Code von `head` (immer 0) — ohne Pipe starten und echten Exit-Code lesen.
   - Erst taggen, wenn alle Plattformen grün sind UND der Rauchtest bestanden ist. Grund: Jeder Tag-Lauf
     hinterlässt einen Release-Entwurf und kostet eine halbe Stunde.
3. **Beobachten:**
   - Den Lauf als Hintergrundtask verfolgen — Wächter auf den WORKFLOW-RUN (`actions/runs/<id>` → `status == completed`) setzen, NICHT auf PR-`statusCheckRollup`: laufende Checks liefern `conclusion: null`, so dass die unique-Liste aus leerem String + SUCCESS/SKIPPED schneller Jobs besteht und ein `*SUCCESS*`-Case zu früh abbricht.
   - JEDER curl gegen die GitHub-API braucht `-H "Authorization: Bearer $GH_TOKEN"` — ein exportiertes GH_TOKEN sendet curl nicht von selbst, und ein privates Repo antwortet auf unauthentifizierte API-Calls mit 404 (nicht 401), so dass ein Wächter sonst stundenlang „Run nicht gefunden" polled, während der Run längst grün ist. `gh`-CLI nutzt GH_TOKEN automatisch, curl nicht.
   - Die Matrix läuft mit `fail-fast: false`, damit eine rote Plattform die anderen nicht abbricht.
   - Ein einzelner roter UI-Test in einem sonst unberührten App-Teil ist oft flaky: zuerst `gh run rerun <id> --failed`; erst bei Wiederholung lokal reproduzieren.
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
   - **Release dann selbst anlegen:** `POST /releases` mit `tag_name`, `target_commitish` = Tag-Commit-SHA, `draft: true`; Notes aus der Release-Verwendungs-Doku bzw. kuratiert. Nach Build-Ende Artefakte herunterladen (`GET actions/runs/<run>/artifacts` → zip entpacken), Assets per `POST uploads/releases/<id>/assets?name=…` hochladen (jeweils Paket UND `.sig`), dann Release veröffentlichen (`PATCH …/releases/<id> {"draft": false}`). Draft-Releases zeigen vorher eine `untagged-…`-URL — normal. **Nach dem Publishen `tag_name` verifizieren:** Bei Draft + bereits existierendem Tag kann GitHub beim Veröffentlichen den Namen verlieren (`tag_name` wird selbst zu `untagged-…`) — dann per `PATCH {"tag_name": …}` zurücksetzen, denn alle Asset-Download-URLs und das Updater-Manifest zeigen auf `releases/download/<tag>/…` und brechen sonst still. **Nach der Reparatur die öffentlichen Download-URLs NACHLAUFEN:** `releases/download/<tag>/…` liefert direkt nach der tag_name-Rücksetzung noch Minutenlang 404 (GitHub bindet den Pfad verzögert); als Sofort-Beweis den Asset-Inhalt über die Asset-API holen (`GET /releases/assets/<id>` mit `Accept: application/octet-stream` — geht immer), und die öffentliche URL ~5 Minuten später einmal verifizieren, bevor man Links an Nutzer ausgibt. Bleibt sie dauerhaft 404: Asset löschen und unter gleichem Namen neu hochladen.
   - **`latest.json` selbst bauen, wenn der Lauf per Dispatch lief** (tauri-action erzeugt sie nur bei echten Tag-Events): `version`, `notes`, `pub_date` (UTC ISO), `platforms`: `linux-x86_64` → AppImage, `darwin-universal` → `app.tar.gz` (nicht das dmg — macOS-Updater lädt das Archiv), `windows-x86_64` → MSI oder NSIS-Setup; je `signature` = Dateiinhalt der zugehörigen `.sig`, `url` = endgültige Asset-URL. JSON per Python bauen (Signaturen sind mehrzeilig) und als Asset `latest.json` hochladen — ohne sie findet die App kein Update.
   - **Start-Rauchtest wiederholen, falls der Tag-Build vom getesteten Branch-Stand abweicht** (z. B. Merge-Commit, geänderte Secrets/ENV): dieselbe Prüfung wie Schritt 2 vor dem Publishen; bei identischem Stand reicht der Branch-Beweis.
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
- Über dlopen geladene Bibliotheken (z. B. AppIndicator/Ayatana für das Tray) landen NICHT im AppImage: linuxdeploy
  folgt nur ELF-Link-Abhängigkeiten, nicht dlopen-Aufrufe. Grund: Auf Systemen ohne die Bibliothek (Arch, SteamOS)
  panict die App beim Start — libappindicator-sys lädt im TrayIconBuilder. Vor dem Tray-Bau per dlopen-Probe
  prüfen (z. B. libloading über die 4 Namen libayatana-appindicator3.so[.1], libappindicator3.so[.1]); fehlt sie:
  Tray überspringen, warnen UND „Schließen = verstecken" an die Tray-Existenz koppeln, sonst verschwindet die App
  ohne Rückweg. Sofort-Workaround für Nutzer: Paket libayatana-appindicator installieren.
- **ARM64 (aarch64) mit in die Release-Matrix**, wenn Nutzer ARM-Geräte nutzen (Asahi, Pi 5): GitHub-ARM-Standard-
  Runner gibt es seit Anfang 2026 auch für PRIVATE Repos (Labels `ubuntu-22.04-arm`/`ubuntu-24.04-arm`, free-tier-
  fähig) — kein Cross-Kompilieren/QEMU nötig. Matrix-Eintrag analog x86_64 (natives Target, `--verbose`), so bleibt
  die glibc-Untergrenze identisch (22.04 → 2.35). Der Updater bekommt den Plattform-Schlüssel `linux-aarch64`
  automatisch von tauri-action. Vor dem Release das ARM-AppImage auf einem echten ARM-Gerät rauchtesten.
- **C++-Basis-Laufzeit (libstdc++/libgcc_s) wird von linuxdeploy bewusst NICHT gebündelt** (AppImage-Excludelist).
  Ziel mit älterer GLIBCXX_-Version → WebKitGTK-Start bricht. Nachbessern per Post-Bundle-Schritt: AppImage
  `--appimage-extract`-entpacken, Libs nach `usr/lib/checkrt/`, AppRun-Hook in `apprun-hooks/`, mit SHA-gepinntem
  appimagetool neu packen. Der Hook soll Symbol-Versionen vergleichen (grep -a + sort -V — kein binutils auf
  Zielsystemen nötig) und die Mitbrings NUR bei fehlender/älterer System-Lib auf LD_LIBRARY_PATH legen, sonst
  blockiert man neuere System-Libs. Das Entpacken erzeugt `squashfs-root` MIT Bindestrich (nicht `squashfs_root`).
  **Signaturfolge:** Umpacken ändert die Datei → .sig und latest.json-Signaturen sind wertlos; der Workflow muss
  nach dem Umpacken neu signieren (tauri signer) und die Signaturen im latest.json-Asset ersetzen
  (separater Job nach allen Bundles, Keys aus den .sig-Assets des Releases).
- Nach Workflow-Edits, die einen Job einfügen: die Job→Steps-Zuordnung per YAML-Parse verifizieren
  (`python3 -c "import yaml; … jobs.<name>.steps[…].name"`) statt nur `YAML OK`. Grund: Ein eingefügter Job-Kopf
  vor einem bestehenden Schritt-ZWEIG kann den Folge-Schritt in den NEUEN Job rutschen lassen — YAML bleibt
  valide, nur die Semantik (z. B. ein `if: failure()`-Upload im falschen Job) bricht still.
- Heruntergeladene Release-Binaries (appimagetool & Co.) vor Gebrauch auf Größe/Typ prüfen
  (`file`, `ls -l`), bevor SHA-Checks gebaut werden. Grund: Nicht existierende Release-Tags liefern eine
  9-Byte-„Not Found"-Textdatei — zwei davon haben sogar identische SHA-256-Werte und täuschen ein korrektes
  Pinning vor. Vorab die Assets des Tags über die Releases-API listen.
- Shell-Skripte, die ein Workflow direkt aufruft (ohne `bash <skript>`), brauchen das Ausführungsbit IM GIT:
  `git update-index --chmod=+x <skript>` und per `git ls-files -s <skript>` Mode `100755` verifizieren.
  Grund: Das lokale Dateisystem-Bit täuscht Funktion vor (lokal laufen Tests grün), die CI checkt frisch aus
  und der Schritt bricht mit exit 126 (Permission denied); fehlerbedingte Diagnose-Schritte mit nacktem
  `grep` liefern dann zusätzlich exit 1 bei leerem Ergebnis und verwischen das echte Fehlerbild.
